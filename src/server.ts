import type { Server } from "node:http";

import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

let server: Server | undefined;
let isShuttingDown = false;

async function startServer(): Promise<void> {
  await prisma.$connect();

  server = app.listen(env.PORT, () => {
    console.log(`서버가 ${env.PORT}번 포트에서 실행 중입니다.`);
  });
}

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
