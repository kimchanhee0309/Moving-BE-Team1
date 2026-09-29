/**
 * Auth Router의 HTTP 입력을 DTO로 변환하고 Service 결과를 공통 응답과 쿠키로 전달합니다.
 * 비밀번호 검증, DB 조회, JWT 정책은 각각 Validator와 Service에 위임합니다.
 */
import type { RequestHandler } from "express";
import type { ParamsDictionary } from "express-serve-static-core";

import {
  clearAuthCookies,
  getAccessTokenFromCookie,
  getRefreshTokenFromCookie,
  setAuthCookies,
} from "../../common/cookies/auth-cookie";
import { UnauthorizedError } from "../../common/errors/app-error";
import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getAuthContext } from "../../common/utils/auth-context";
import {
  confirmPasswordReset,
  findAccount,
  getCurrentUser,
  login,
  requestPasswordResetCode,
  refreshAuth,
  verifyPasswordResetCode,
  restoreOptionalAuthSession,
  signUp,
  withdrawAccount,
} from "./auth.service";
import {
  parseAccountRecoveryInput,
  parseConfirmPasswordResetInput,
  parseLoginInput,
  parseSignUpInput,
  parseVerifyPasswordResetCodeInput,
  parseWithdrawAccountInput,
} from "./auth.validator";
import { markOptionalSessionRefreshFailure } from "./auth-rate-limit";

/** Express가 파싱한 외부 body를 Validator 전까지 신뢰하지 않는 Auth Controller 계약입니다. */
type UnknownBodyRequestHandler = RequestHandler<ParamsDictionary, unknown, unknown>;

/** 회원가입 요청을 검증하고 사용자를 생성한 뒤 인증 쿠키와 data.user를 201로 반환합니다. */
export const signUpController: UnknownBodyRequestHandler = async (request, response) => {
  const input = parseSignUpInput(request.body);
  const result = await signUp(input);

  setAuthCookies(response, result.tokens);

  return sendSuccess(response, HTTP_STATUS.CREATED, { user: result.user });
};

/** 자격 증명을 검증하고 Access/Refresh Token을 HttpOnly 쿠키로 발급합니다. */
export const loginController: UnknownBodyRequestHandler = async (request, response) => {
  const input = parseLoginInput(request.body);
  const result = await login(input);

  setAuthCookies(response, result.tokens);

  return sendSuccess(response, HTTP_STATUS.OK, { user: result.user });
};

/** 이름·이메일·역할이 일치하는지 확인해 로그인 ID와 계정 방식을 반환합니다. */
export const findAccountController: UnknownBodyRequestHandler = async (
  request,
  response,
) => {
  const input = parseAccountRecoveryInput(request.body);
  const result = await findAccount(input);
  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/** 이메일 계정에는 숫자 코드를 발송하고 OAuth 계정에는 SNS 안내 결과를 반환합니다. */
export const requestPasswordResetCodeController: UnknownBodyRequestHandler = async (
  request,
  response,
) => {
  const input = parseAccountRecoveryInput(request.body);
  const result = await requestPasswordResetCode(input);
  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/** 이메일로 받은 숫자 코드를 확인해 15분 만료 비밀번호 재설정 토큰을 반환합니다. */
export const verifyPasswordResetCodeController: UnknownBodyRequestHandler = async (
  request,
  response,
) => {
  const input = parseVerifyPasswordResetCodeInput(request.body);
  const result = await verifyPasswordResetCode(input);
  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/** 단기 재설정 토큰을 검증한 뒤 새 비밀번호로 교체합니다. */
export const confirmPasswordResetController: UnknownBodyRequestHandler = async (
  request,
  response,
) => {
  const input = parseConfirmPasswordResetInput(request.body);
  await confirmPasswordReset(input);
  return sendSuccess(response, HTTP_STATUS.OK, null);
};

/** Access Token으로 식별된 사용자의 최신 정보와 profileCompleted를 반환합니다. */
export const meController: RequestHandler = async (request, response) => {
  const { userId } = getAuthContext(request);
  const user = await getCurrentUser(userId);

  return sendSuccess(response, HTTP_STATUS.OK, { user });
};

/** Refresh Token을 검증해 두 쿠키를 회전하고 최신 사용자를 data.user로 반환합니다. */
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

  return sendSuccess(response, HTTP_STATUS.OK, { user: result.user });
};

/**
 * 공개 페이지에서 비회원은 정상 상태로, 남은 Refresh가 있는 사용자는 복구된 상태로 반환합니다.
 * stale 인증 쿠키는 삭제하고 `/auth/me`와 보호 API의 401 계약은 변경하지 않습니다.
 */
export const optionalSessionController: RequestHandler = async (
  request,
  response,
) => {
  const accessToken = getAccessTokenFromCookie(request);
  const refreshToken = getRefreshTokenFromCookie(request);
  const result = await restoreOptionalAuthSession(accessToken, refreshToken);

  // 선택 세션은 잘못된 Refresh도 200 비회원으로 정리하므로 limiter에만 실패 결과를 명시합니다.
  if (refreshToken !== null && result.user === null) {
    markOptionalSessionRefreshFailure(request);
  }

  if (result.tokens) {
    setAuthCookies(response, result.tokens);
  } else if (result.shouldClearCookies) {
    clearAuthCookies(response);
  }

  return sendSuccess(response, HTTP_STATUS.OK, { user: result.user });
};

/** 인증 본인의 탈퇴 요청을 검증·삭제하고 성공한 경우 두 인증 쿠키를 만료시킵니다. */
export const withdrawAccountController: UnknownBodyRequestHandler = async (
  request,
  response,
) => {
  const { userId } = getAuthContext(request);
  const input = parseWithdrawAccountInput(request.body);

  await withdrawAccount(userId, input);
  clearAuthCookies(response);

  return sendSuccess(response, HTTP_STATUS.OK, null);
};

/** Stateless 로그아웃으로 두 쿠키를 만료시키며 이미 만료된 토큰도 동일하게 처리합니다. */
export const logoutController: RequestHandler = (_request, response) => {
  clearAuthCookies(response);

  return sendSuccess(response, HTTP_STATUS.OK, null);
};
