import type { CookieOptions, Request, Response } from "express";

import { AUTH_COOKIE } from "../constants/auth-cookie";
import { env } from "../../config/env";

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
    maxAge: env.REFRESH_TOKEN_MAX_AGE_MS,
  };
}

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

export function clearAuthCookies(response: Response): void {
  const cookieOptions = createBaseCookieOptions();

  response.clearCookie(AUTH_COOKIE.ACCESS_TOKEN, cookieOptions);

  response.clearCookie(AUTH_COOKIE.REFRESH_TOKEN, cookieOptions);
}

export function getAccessTokenFromCookie(request: Request): string | null {
  const accessToken: unknown = request.cookies?.[AUTH_COOKIE.ACCESS_TOKEN];

  return typeof accessToken === "string" ? accessToken : null;
}

export function getRefreshTokenFromCookie(request: Request): string | null {
  const refreshToken: unknown = request.cookies?.[AUTH_COOKIE.REFRESH_TOKEN];

  return typeof refreshToken === "string" ? refreshToken : null;
}
