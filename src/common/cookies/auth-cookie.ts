import type { CookieOptions, Request, Response } from "express";

import { AUTH_COOKIE } from "../constants/auth-cookie";
import { env } from "../../config/env";

/**
 * Auth 쿠키의 발급·조회·삭제 규칙을 한 곳에서 관리합니다.
 * 토큰 문자열은 응답 Body나 JavaScript에서 읽을 수 없도록 HttpOnly 쿠키로만 전달합니다.
 */

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

function createBaseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",

    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

function createAccessTokenCookieOptions(): CookieOptions {
  return {
    ...createBaseCookieOptions(),
    maxAge: env.ACCESS_TOKEN_MAX_AGE_MS,
  };
}

function createRefreshTokenCookieOptions(): CookieOptions {
  return {
    ...createBaseCookieOptions(),
    path: "/auth/refresh",
    maxAge: env.REFRESH_TOKEN_MAX_AGE_MS,
  };
}

function createAccessTokenClearOptions(): CookieOptions {
  return createBaseCookieOptions();
}

function createRefreshTokenClearOptions(): CookieOptions {
  return {
    ...createBaseCookieOptions(),
    path: "/auth/refresh",
  };
}

/** Access Token과 회전된 Refresh Token을 각각의 만료시간과 경로로 발급합니다. */
export function setAuthCookies(response: Response, tokens: AuthTokens): void {
  response.cookie(
    AUTH_COOKIE.ACCESS_TOKEN,
    tokens.accessToken,
    createAccessTokenCookieOptions(),
  );

  response.cookie(
    AUTH_COOKIE.REFRESH_TOKEN,
    tokens.refreshToken,
    createRefreshTokenCookieOptions(),
  );
}

/** 로그아웃 시 발급 때와 동일한 옵션으로 두 인증 쿠키를 만료시킵니다. */
export function clearAuthCookies(response: Response): void {
  response.clearCookie(
    AUTH_COOKIE.ACCESS_TOKEN,
    createAccessTokenClearOptions(),
  );

  response.clearCookie(
    AUTH_COOKIE.REFRESH_TOKEN,
    createRefreshTokenClearOptions(),
  );
}

/** 인증 미들웨어가 검증할 Access Token 문자열만 안전하게 추출합니다. */
export function getAccessTokenFromCookie(request: Request): string | null {
  const accessToken: unknown = request.cookies?.[AUTH_COOKIE.ACCESS_TOKEN];

  return typeof accessToken === "string" ? accessToken : null;
}

/** 갱신 API가 검증할 Refresh Token 문자열만 안전하게 추출합니다. */
export function getRefreshTokenFromCookie(request: Request): string | null {
  const refreshToken: unknown = request.cookies?.[AUTH_COOKIE.REFRESH_TOKEN];

  return typeof refreshToken === "string" ? refreshToken : null;
}
