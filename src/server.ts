import type { Server } from "node:http";

import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import {
  startMoveRequestCompletionScheduler,
  stopMoveRequestCompletionScheduler,
} from "./modules/move-request/move-request-completion.scheduler";
import { closeAllNotificationConnections } from "./modules/notification/notification.hub";
import {
  startMoveDayNotificationScheduler,
  stopMoveDayNotificationScheduler,
} from "./modules/notification/move-day.scheduler";

let server: Server | undefined;
let isShuttingDown = false;

async function startServer(): Promise<void> {
  await prisma.$connect();

  server = app.listen(env.PORT, () => {
    console.log(`서버가 ${env.PORT}번 포트에서 실행 중입니다.`);
    console.log(`Swagger 문서: http://localhost:${env.PORT}/api-docs`);
  });

  // MOVE_DAY 알림 cron 스케줄 등록. 실제 대상 판별·발송 로직은
  // modules/notification/move-day.service.ts가 담당하고 여기서는 lifecycle에만 연결한다.
  startMoveDayNotificationScheduler();

  // 이사일이 지난 확정 요청을 완료(COMPLETED)로 바꾸는 cron 등록. 시작 직후에도 한 번 실행해
  // 서버가 내려가 있던 동안 밀린 전이를 반영한다. 전이 로직은 move-request 모듈이 담당한다.
  startMoveRequestCompletionScheduler();
}

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`${signal} 신호를 받아 서버를 종료합니다.`);

  // cron 타이머가 살아있으면 프로세스 종료를 막을 수 있으므로 HTTP 서버를 닫기 전에 정지한다.
  stopMoveDayNotificationScheduler();
  stopMoveRequestCompletionScheduler();

  // SSE는 의도적으로 끝나지 않는 장기 연결이라 server.close()가 끝나길 기다리면 영원히
  // 끝나지 않으므로, 먼저 모든 연결을 강제로 닫아야 한다. 이 호출 이후 각 연결의
  // request.on("close") 핸들러가 허브 등록 해제와 heartbeat 정리를 뒤따라 수행한다.
  closeAllNotificationConnections();

  const forceShutdownTimer = setTimeout(() => {
    process.exit(1);
  }, 10_000);

  forceShutdownTimer.unref();

  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => {
        resolve();
      });
    });
  }

  await prisma.$disconnect();

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

  await prisma.$disconnect();
  process.exit(1);
});
