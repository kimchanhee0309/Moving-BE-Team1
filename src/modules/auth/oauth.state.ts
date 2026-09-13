/**
 * OAuth CSRF State를 생성·서명하고 HttpOnly 쿠키와 callback 값을 함께 검증합니다.
 * 로그인 JWT가 아니며 역할·redirect 복원 외의 인증 수단으로 사용하지 않습니다.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { CookieOptions, Request, Response } from "express";

import { BadRequestError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import type { OAuthProvider, OAuthStateContext } from "./oauth.dto";

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const STATE_VERSION = 1;
const consumedStateNonces = new Map<string, number>();

interface StateEnvelope extends OAuthStateContext {
  version: typeof STATE_VERSION;
}

function getCookieName(provider: OAuthProvider): string {
  return `oauthState_${provider}`;
}

function getCookiePath(provider: OAuthProvider): string {
  return `/auth/oauth/${provider}/callback`;
}

function getCookieOptions(provider: OAuthProvider): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    // 외부 공급자의 top-level callback에서도 쿠키를 보내면서 cross-site POST에는 보내지 않습니다.
    sameSite: "lax",
    path: getCookiePath(provider),
    maxAge: OAUTH_STATE_MAX_AGE_MS,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", env.ACCESS_TOKEN_SECRET)
    .update("moving-oauth-state-v1\0")
    .update(encodedPayload)
    .digest("base64url");
}

function isOAuthStateContext(value: unknown): value is StateEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    state.version === STATE_VERSION &&
    (state.provider === "google" || state.provider === "kakao" || state.provider === "naver") &&
    (state.role === "CUSTOMER" || state.role === "MOVER") &&
    typeof state.nonce === "string" &&
    typeof state.expiresAt === "number" &&
    (state.redirect === undefined || typeof state.redirect === "string")
  );
}

function rejectInvalidState(): never {
  throw new BadRequestError(
    "OAuth 요청이 만료되었거나 유효하지 않습니다.",
    "OAUTH_INVALID_STATE",
  );
}

function consumeNonceOnce(nonce: string, expiresAt: number): void {
  const now = Date.now();

  for (const [consumedNonce, consumedExpiresAt] of consumedStateNonces) {
    if (consumedExpiresAt <= now) {
      consumedStateNonces.delete(consumedNonce);
    }
  }

  if (consumedStateNonces.has(nonce)) {
    return rejectInvalidState();
  }

  consumedStateNonces.set(nonce, expiresAt);
}

/** 32바이트 난수와 10분 만료 문맥을 만들고 HMAC으로 위변조를 방지합니다. */
export function createOAuthState(
  provider: OAuthProvider,
  role: OAuthStateContext["role"],
  redirect?: string,
): { state: string; cookieValue: string } {
  const nonce = randomBytes(32).toString("base64url");
  const envelope: StateEnvelope = {
    version: STATE_VERSION,
    provider,
    role,
    nonce,
    expiresAt: Date.now() + OAUTH_STATE_MAX_AGE_MS,
    ...(redirect ? { redirect } : {}),
  };
  const encodedPayload = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");

  return {
    state: nonce,
    cookieValue: `${encodedPayload}.${signPayload(encodedPayload)}`,
  };
}

/** 생성한 State 문맥을 공급자 callback 경로 전용 HttpOnly 쿠키로 저장합니다. */
export function setOAuthStateCookie(
  response: Response,
  provider: OAuthProvider,
  cookieValue: string,
): void {
  response.cookie(getCookieName(provider), cookieValue, getCookieOptions(provider));
}

/** Callback 진입 즉시 State 쿠키를 지워 브라우저에서 같은 흐름을 다시 쓰지 못하게 합니다. */
export function clearOAuthStateCookie(response: Response, provider: OAuthProvider): void {
  response.clearCookie(getCookieName(provider), {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: getCookiePath(provider),
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}

/** Query nonce, 쿠키 서명, 만료, 공급자를 모두 확인한 뒤 검증된 역할 문맥만 반환합니다. */
export function consumeOAuthState(
  request: Request,
  response: Response,
  provider: OAuthProvider,
  state: string | undefined,
): OAuthStateContext {
  const cookieValue: unknown = request.cookies?.[getCookieName(provider)];
  clearOAuthStateCookie(response, provider);

  if (typeof cookieValue !== "string" || !state) {
    return rejectInvalidState();
  }

  const [encodedPayload, receivedSignature, extra] = cookieValue.split(".");
  if (!encodedPayload || !receivedSignature || extra !== undefined) {
    return rejectInvalidState();
  }

  const expectedSignature = signPayload(encodedPayload);
  const receivedBuffer = Buffer.from(receivedSignature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return rejectInvalidState();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return rejectInvalidState();
  }

  const storedNonce = isOAuthStateContext(decoded)
    ? Buffer.from(decoded.nonce)
    : Buffer.alloc(0);
  const receivedNonce = Buffer.from(state);

  if (
    !isOAuthStateContext(decoded) ||
    decoded.provider !== provider ||
    decoded.expiresAt <= Date.now() ||
    storedNonce.length !== receivedNonce.length ||
    !timingSafeEqual(storedNonce, receivedNonce)
  ) {
    return rejectInvalidState();
  }

  // 쿠키를 복사해 재전송하더라도 같은 Node 인스턴스에서는 nonce를 두 번 소비할 수 없습니다.
  consumeNonceOnce(decoded.nonce, decoded.expiresAt);

  return decoded;
}
