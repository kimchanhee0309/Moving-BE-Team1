import { Router } from "express";

import { HTTP_STATUS } from "../common/constants/http-status";
import { sendSuccess } from "../common/response/api-response";
import { authRouter } from "../modules/auth/auth.routes";

export const apiRouter = Router();
apiRouter.use("/auth", authRouter);

apiRouter.get("/health", (_request, response) => {
  return sendSuccess(response, HTTP_STATUS.OK, {
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});
