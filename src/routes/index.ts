import { Router } from "express";

import { HTTP_STATUS } from "../common/constants/http-status";
import { sendSuccess } from "../common/response/api-response";
import { timeStamp } from "node:console";

export const apiRouter = Router();

apiRouter.get("/health", (_request, response) => {
  return sendSuccess(response, HTTP_STATUS.OK, {
    status: "ok",
    timeStamp: new Date().toISOString(),
  });
});
