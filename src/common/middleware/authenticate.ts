/**
 * Access Token 쿠키를 검증해 Express 요청에 인증 주체를 연결합니다.
 * 사용자 DB 조회나 역할·profile 검사는 각각 Service와 후속 미들웨어에 맡깁니다.
 */
import type { RequestHandler } from "express";

import { getAccessTokenFromCookie } from "../cookies/auth-cookie";
import { UnauthorizedError } from "../errors/app-error";
import { verifyToken } from "../utils/auth-token";

/** Access Token의 존재·서명·만료·payload를 검증하고 request.auth를 설정합니다. */
export const authenticate: RequestHandler = (request, _response, next) => {
  const accessToken = getAccessTokenFromCookie(request);

  if (!accessToken) {
    next(new UnauthorizedError("로그인이 필요합니다.", "ACCESS_TOKEN_MISSING"));
    return;
  }

  try {
    const payload = verifyToken(accessToken, "access");

    request.auth = {
      userId: payload.userId,
      role: payload.role,
    };

    next();
  } catch (error: unknown) {
    next(error);
  }
};
