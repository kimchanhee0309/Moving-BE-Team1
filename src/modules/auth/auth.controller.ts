/**
 * Auth Router의 HTTP 입력을 DTO로 변환하고 Service 결과를 공통 응답과 쿠키로 전달합니다.
 * 비밀번호 검증, DB 조회, JWT 정책은 각각 Validator와 Service에 위임합니다.
 */
import type { Request, RequestHandler } from "express";

import {
  clearAuthCookies,
  getRefreshTokenFromCookie,
  setAuthCookies,
} from "../../common/cookies/auth-cookie";
import { UnauthorizedError } from "../../common/errors/app-error";
import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getCurrentUser, login, refreshAuth, signUp } from "./auth.service";
import { parseLoginInput, parseSignUpInput } from "./auth.validator";

function getAuthenticatedUserId(request: Request): string {
  if (!request.auth) {
    throw new UnauthorizedError("로그인이 필요합니다.", "ACCESS_TOKEN_MISSING");
  }

  return request.auth.userId;
}

/** 회원가입 요청을 검증하고 profile 미등록 상태의 사용자를 생성해 201로 반환합니다. */
export const signUpController: RequestHandler = async (request, response) => {
  const input = parseSignUpInput(request.body);
  const user = await signUp(input);

  return sendSuccess(response, HTTP_STATUS.CREATED, user);
};

/** 자격 증명을 검증하고 Access/Refresh Token을 HttpOnly 쿠키로 발급합니다. */
export const loginController: RequestHandler = async (request, response) => {
  const input = parseLoginInput(request.body);
  const result = await login(input);

  setAuthCookies(response, result.tokens);

  return sendSuccess(response, HTTP_STATUS.OK, result.user);
};

/** Access Token으로 식별된 사용자의 최신 정보와 profileCompleted를 반환합니다. */
export const meController: RequestHandler = async (request, response) => {
  const user = await getCurrentUser(getAuthenticatedUserId(request));

  return sendSuccess(response, HTTP_STATUS.OK, user);
};

/** Refresh Token을 검증해 Access/Refresh Token을 모두 회전하고 민감값은 Body에 담지 않습니다. */
export const refreshController: RequestHandler = async (request, response) => {
  const refreshToken = getRefreshTokenFromCookie(request);

  if (!refreshToken) {
    throw new UnauthorizedError(
      "Refresh Token이 필요합니다.",
      "REFRESH_TOKEN_MISSING",
    );
  }

  const result = await refreshAuth(refreshToken);

  setAuthCookies(response, result.tokens);

  return sendSuccess(response, HTTP_STATUS.OK, null);
};

/** Stateless 로그아웃으로 두 쿠키를 만료시키며 이미 만료된 토큰도 동일하게 처리합니다. */
export const logoutController: RequestHandler = (_request, response) => {
  clearAuthCookies(response);

  return sendSuccess(response, HTTP_STATUS.OK, null);
};
