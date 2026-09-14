/**
 * 모든 도메인 Router와 개발용 정적 profile 이미지 경로를 최상위 URL에 조립합니다.
 * 각 endpoint의 입력 검증·권한·DB 처리는 담당 module에 위임합니다.
 */
import express, { Router } from "express";

import { HTTP_STATUS } from "../common/constants/http-status";
import { sendSuccess } from "../common/response/api-response";
import { authRouter } from "../modules/auth/auth.router";
import { CUSTOMER_PROFILE_UPLOAD_DIRECTORY } from "../modules/customer-profile/customer-profile.image";
import { customerProfileRouter } from "../modules/customer-profile/customer-profile.router";

/** 앱이 `/`에 연결하는 최상위 API Router입니다. */
export const apiRouter = Router();

// 도메인 Router는 최상위 경로만 이 파일에서 조립합니다.
apiRouter.use("/auth", authRouter);
// UUID로 저장된 개발용 이미지 파일만 공개하며 업로드·검증은 Customer Profile module이 담당합니다.
apiRouter.use(
  "/uploads/customer-profiles",
  express.static(CUSTOMER_PROFILE_UPLOAD_DIRECTORY, { dotfiles: "deny", index: false }),
);
apiRouter.use("/customers", customerProfileRouter);

apiRouter.get("/health", (_request, response) => {
  return sendSuccess(response, HTTP_STATUS.OK, {
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});
