/**
 * Access/Refresh JWT의 생성과 검증 및 서버 세션 연결 식별자를 담당합니다.
 * 두 종류의 Secret과 tokenType을 분리하고 Refresh 원문 없이 회전 상태를 연결합니다.
 */
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

import type { UserRole } from "../../generated/prisma/enums";
import { env } from "../../config/env";
import { UnauthorizedError } from "../errors/app-error";

type TokenType = "access" | "refresh";

interface AuthTokenPayload {
  userId: string;
  role: UserRole;
  tokenType: TokenType;
  sessionId: string;
  refreshTokenId: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const USER_ROLE_LIST = ["CUSTOMER", "MOVER"] as const satisfies readonly UserRole[];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** DB 세션과 JWT를 연결할 예측 불가능한 UUID 식별자를 생성합니다. */
export function createAuthTokenIdentifiers(): {
  sessionId: string;
  refreshTokenId: string;
} {
  return {
    sessionId: randomUUID(),
    refreshTokenId: randomUUID(),
  };
}

function getSecret(tokenType: TokenType): string {
  return tokenType === "access"
    ? env.ACCESS_TOKEN_SECRET
    : env.REFRESH_TOKEN_SECRET;
}

function getExpiresInSeconds(tokenType: TokenType): number {
  const maxAge =
    tokenType === "access"
      ? env.ACCESS_TOKEN_MAX_AGE_MS
      : env.REFRESH_TOKEN_MAX_AGE_MS;

  return Math.floor(maxAge / 1000);
}

function getTokenError(tokenType: TokenType, isExpired: boolean): UnauthorizedError {
  const prefix = tokenType === "access" ? "ACCESS_TOKEN" : "REFRESH_TOKEN";

  return new UnauthorizedError(
    isExpired ? "인증 토큰이 만료되었습니다." : "인증 토큰이 유효하지 않습니다.",
    `${prefix}_${isExpired ? "EXPIRED" : "INVALID"}`,
  );
}

function isUserRole(value: unknown): value is UserRole {
  return USER_ROLE_LIST.some((role) => role === value);
}

/** 지정한 용도의 JWT를 HS256으로 서명하며 사용자 ID는 표준 subject에 저장합니다. */
export function createToken(
  userId: string,
  role: UserRole,
  tokenType: TokenType,
  sessionId: string = randomUUID(),
  refreshTokenId: string | null = tokenType === "refresh" ? randomUUID() : null,
): string {
  return jwt.sign(
    {
      role,
      tokenType,
      sessionId,
      ...(refreshTokenId ? { refreshTokenId } : {}),
    },
    getSecret(tokenType),
    {
      algorithm: "HS256",
      expiresIn: getExpiresInSeconds(tokenType),
      issuer: env.JWT_ISSUER,
      subject: userId,
    },
  );
}

/** Access/Refresh Token을 함께 발급하며 갱신 시에도 두 토큰을 회전시킵니다. */
export function createAuthTokens(
  userId: string,
  role: UserRole,
  sessionId: string = randomUUID(),
  refreshTokenId: string = randomUUID(),
): AuthTokens {
  return {
    accessToken: createToken(userId, role, "access", sessionId, null),
    refreshToken: createToken(
      userId,
      role,
      "refresh",
      sessionId,
      refreshTokenId,
    ),
  };
}

function verifyTokenPayload(
  token: string,
  tokenType: TokenType,
  ignoreExpiration: boolean,
): AuthTokenPayload {
  try {
    const payload = jwt.verify(token, getSecret(tokenType), {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      ignoreExpiration,
    });

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      !isUserRole(payload.role) ||
      payload.tokenType !== tokenType ||
      typeof payload.sessionId !== "string" ||
      !UUID_PATTERN.test(payload.sessionId)
    ) {
      throw getTokenError(tokenType, false);
    }

    let refreshTokenId: string | null = null;
    if (tokenType === "refresh") {
      if (
        typeof payload.refreshTokenId !== "string" ||
        !UUID_PATTERN.test(payload.refreshTokenId)
      ) {
        throw getTokenError(tokenType, false);
      }
      refreshTokenId = payload.refreshTokenId;
    }

    return {
      userId: payload.sub,
      role: payload.role,
      tokenType,
      sessionId: payload.sessionId,
      refreshTokenId,
    };
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    throw getTokenError(tokenType, error instanceof jwt.TokenExpiredError);
  }
}

/** 서명·만료·issuer·용도·세션 식별자를 검증하고 최소 인증 정보만 반환합니다. */
export function verifyToken(token: string, tokenType: TokenType): AuthTokenPayload {
  return verifyTokenPayload(token, tokenType, false);
}

/** 로그아웃에서 만료된 Access도 서명·용도를 검증한 뒤 연결 세션만 폐기합니다. */
export function verifyAccessTokenForLogout(token: string): AuthTokenPayload {
  return verifyTokenPayload(token, "access", true);
}
