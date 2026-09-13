import { Router } from "express";

import { HTTP_STATUS } from "../common/constants/http-status";
import { sendSuccess } from "../common/response/api-response";
import { authRouter } from "../modules/auth/auth.router";

export const apiRouter = Router();

// 도메인 Router는 최상위 경로만 이 파일에서 조립합니다.
apiRouter.use("/auth", authRouter);

apiRouter.get("/health", (_request, response) => {
  return sendSuccess(response, HTTP_STATUS.OK, {
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});
