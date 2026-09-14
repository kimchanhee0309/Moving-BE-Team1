/**
 * 인증 endpoint의 IP 기반 요청 제한을 정의합니다.
 * 비즈니스 인증 결과는 다루지 않고 초과 요청을 팀 공통 AppError로 전달합니다.
 */
import { rateLimit } from "express-rate-limit";
import type { NextFunction, Request, Response } from "express";

import { TooManyRequestsError } from "../../common/errors/app-error";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

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

/** 로그인 실패를 IP별 15분에 5회로 제한해 무차별 대입을 완화합니다. */
export const loginRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
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

/** 탈취 Refresh Token 반복 시도를 줄이기 위해 IP별 15분에 30회로 제한합니다. */
export const refreshRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rejectRateLimitedRequest,
});
