/**
 * DB·Redis 연결, HTTP 서버 시작과 process 종료를 담당합니다.
 * 필수 인프라 연결 확인 후 요청을 받고 종료 시 HTTP 요청을 정리한 뒤 연결을 닫습니다.
 * 도메인 처리와 cron 세부 구현은 각 모듈에 위임합니다.
 */
import type { Server } from "node:http";

import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { closeRedis, connectRedis } from "./lib/redis";
import { closeAllNotificationConnections } from "./modules/notification/notification.hub";
import {
  startMoveDayNotificationScheduler,
  stopMoveDayNotificationScheduler,
} from "./modules/notification/move-day.scheduler";

let server: Server | undefined;
let isShuttingDown = false;

/**
 * DB·Redis 연결 확인 후 HTTP 서버와 알림 스케줄러를 시작합니다.
 * @returns 서버 시작 처리 완료 Promise
 * @throws 필수 인프라 연결 실패
 * @remarks 시작 실패는 최하단 handler가 종료 절차로 전달합니다.
 */
async function startServer(): Promise<void> {
  await prisma.$connect();
  await connectRedis();

  // 인프라 연결을 기다리던 중 종료 신호가 들어오면 HTTP 서버를 열지 않습니다.
  if (isShuttingDown) {
    return;
  }

  server = app.listen(env.PORT, () => {
    console.log(`서버가 ${env.PORT}번 포트에서 실행 중입니다.`);

    if (env.SWAGGER_ENABLED) {
      console.log(`Swagger 문서: http://localhost:${env.PORT}/api-docs`);
    }
  });

  startMoveDayNotificationScheduler();
}

/**
 * 스케줄러·SSE·HTTP 서버·인프라 연결을 정리하고 process를 종료합니다.
 * @param signal 종료 원인
 * @param exitCode 종료 코드, 정상 종료는 0
 * @returns 종료 처리 Promise
 * @remarks 중복 실행을 방지하고 10초 초과 시 강제 종료합니다.
 */
async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`${signal} 신호를 받아 서버를 종료합니다.`);

  const forceShutdownTimer = setTimeout(() => {
    process.exit(1);
  }, 10_000);

  forceShutdownTimer.unref();

  try {
    // 새 cron 실행을 중단합니다.
    stopMoveDayNotificationScheduler();

    // 장기 SSE 연결을 먼저 닫아 HTTP 종료가 대기하지 않게 합니다.
    closeAllNotificationConnections();

    const currentServer = server;

    if (currentServer) {
      // 진행 중 HTTP 요청이 끝날 때까지 DB·Redis 연결을 유지합니다.
      await new Promise<void>((resolve, reject) => {
        currentServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  } catch {
    console.error("HTTP 서버 종료 중 오류가 발생했습니다.");
    exitCode = 1;
  }

  // 하나의 정리 작업이 실패해도 다른 인프라 연결 정리를 시도합니다.
  const cleanupResults = await Promise.allSettled([
    closeRedis(),
    prisma.$disconnect(),
  ]);

  if (cleanupResults.some((result) => result.status === "rejected")) {
    console.error("인프라 연결 정리에 실패했습니다.");
    exitCode = 1;
  }

  clearTimeout(forceShutdownTimer);
  process.exit(exitCode);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("uncaughtException", () => {
  console.error("처리되지 않은 예외가 발생했습니다.");
  void shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", () => {
  console.error("처리되지 않은 Promise rejection이 발생했습니다.");
  void shutdown("unhandledRejection", 1);
});

startServer().catch(async () => {
  console.error("서버를 시작하지 못했습니다.");

  // DB만 연결된 상태에서 Redis 시작이 실패한 경우에도 동일하게 정리합니다.
  await shutdown("startupFailure", 1);
});
