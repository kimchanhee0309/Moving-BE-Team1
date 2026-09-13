/**
 * 운영 환경의 평문 HTTP 요청을 공개 HTTPS origin으로 영구 리다이렉트합니다.
 * TLS 종료는 배포 프록시가 담당하고 이 계층은 잘못된 평문 진입만 차단합니다.
 */
import type { RequestHandler } from "express";

import { env } from "../../config/env";

/** trust proxy가 복원한 프로토콜을 기준으로 운영 요청 전체에 HTTPS를 강제합니다. */
export const requireHttps: RequestHandler = (request, response, next) => {
  if (env.NODE_ENV !== "production" || request.secure) {
    next();
    return;
  }

  // Host header를 사용하지 않아 공격자가 임의 도메인으로 redirect를 만들 수 없게 합니다.
  const destination = new URL(request.originalUrl, env.OAUTH_CALLBACK_BASE_URL);
  response.redirect(308, destination.toString());
};
