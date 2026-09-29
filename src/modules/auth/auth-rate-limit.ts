/**
 * 인증 endpoint의 IP 기반 요청 제한을 정의합니다.
 * 비즈니스 인증 결과는 다루지 않고 초과 요청을 팀 공통 AppError로 전달합니다.
 */
import { rateLimit } from "express-rate-limit";
import type { NextFunction, Request, Response } from "express";

import { TooManyRequestsError } from "../../common/errors/app-error";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const failedOptionalSessionRefreshRequests = new WeakSet<Request>();

/**
 * 선택 세션이 잘못된 Refresh Token을 비회원 응답으로 정리했음을 기록합니다.
 * @param request 현재 선택 세션 요청
 * @returns 반환값 없음
 * @remarks 선택 세션은 보안 실패도 200 계약이므로 limiter가 정상 비회원 요청과 구분할 때만 사용합니다.
 */
export function markOptionalSessionRefreshFailure(request: Request): void {
  failedOptionalSessionRefreshRequests.add(request);
}

function wasOptionalSessionRequestSuccessful(
  request: Request,
  response: Response,
): boolean {
  return (
    response.statusCode < 400 &&
    !failedOptionalSessionRefreshRequests.has(request)
  );
}

function rejectRateLimitedRequest(
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  next(
    new TooManyRequestsError(
      "인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      "AUTH_RATE_LIMIT_EXCEEDED",
    ),
  );
}

function rejectLoginRateLimitedRequest(
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  next(
    new TooManyRequestsError(
      "로그인에 5회 실패해 15분간 로그인이 제한되었습니다. 비밀번호 찾기를 이용해 주세요.",
      "LOGIN_ATTEMPTS_EXCEEDED",
    ),
  );
}

/** 로그인 실패를 IP별 15분에 5회로 제한해 무차별 대입을 완화합니다. */
export const loginRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rejectLoginRateLimitedRequest,
});

/** 계정 존재 여부 대입을 줄이기 위해 계정 찾기를 IP별 1시간에 10회로 제한합니다. */
export const accountRecoveryRateLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rejectRateLimitedRequest,
});

/** 메일 폭탄과 계정 대입을 줄이기 위해 코드 발송을 IP별 1시간에 5회로 제한합니다. */
export const passwordResetCodeSendRateLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rejectRateLimitedRequest,
});

/** 6자리 코드 무차별 대입을 줄이기 위해 검증 요청을 IP별 1시간에 5회로 제한합니다. */
export const passwordResetCodeVerifyRateLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rejectRateLimitedRequest,
});

/** 자동 계정 생성을 줄이기 위해 회원가입을 IP별 1시간에 10회로 제한합니다. */
export const signUpRateLimiter = rateLimit({
  windowMs: ONE_HOUR_MS,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rejectRateLimitedRequest,
});

/** 공급자 인증 화면을 반복 생성하는 요청을 IP별 15분에 20회로 제한합니다. */
export const oauthStartRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rejectRateLimitedRequest,
});

/** 탈취 code 반복 교환과 callback 공격을 IP별 15분에 30회로 제한합니다. */
export const oauthCallbackRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rejectRateLimitedRequest,
});

/**
 * 선택 세션의 정상 비회원·Access 확인·Refresh 복원은 제한에서 제외하고,
 * 잘못된 Refresh Token 시도만 별도 저장소에서 IP별 15분에 30회로 제한합니다.
 */
export const sessionRefreshRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  requestWasSuccessful: wasOptionalSessionRequestSuccessful,
  handler: rejectRateLimitedRequest,
});

/** 정상 토큰 회전은 제외하고 탈취 Refresh Token 실패를 IP별 15분에 30회로 제한합니다. */
export const refreshRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rejectRateLimitedRequest,
});
