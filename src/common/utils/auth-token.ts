/**
 * Access/Refresh JWT의 생성과 검증을 담당합니다.
 * 두 종류의 Secret을 분리하고 tokenType을 검사하여 토큰 용도 혼용을 차단합니다.
 */
import jwt from "jsonwebtoken";

import type { UserRole } from "../../generated/prisma/enums";
import { env } from "../../config/env";
import { UnauthorizedError } from "../errors/app-error";

type TokenType = "access" | "refresh";

interface AuthTokenPayload {
  userId: string;
  role: UserRole;
  tokenType: TokenType;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const USER_ROLE_LIST = ["CUSTOMER", "MOVER"] as const satisfies readonly UserRole[];

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
): string {
  return jwt.sign(
    { role, tokenType },
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
export function createAuthTokens(userId: string, role: UserRole): AuthTokens {
  return {
    accessToken: createToken(userId, role, "access"),
    refreshToken: createToken(userId, role, "refresh"),
  };
}

/** 서명·만료·issuer·용도·필수 payload를 검증하고 최소 인증 정보만 반환합니다. */
export function verifyToken(token: string, tokenType: TokenType): AuthTokenPayload {
  try {
    const payload = jwt.verify(token, getSecret(tokenType), {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
    });

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      !isUserRole(payload.role) ||
      payload.tokenType !== tokenType
    ) {
      throw getTokenError(tokenType, false);
    }

    return {
      userId: payload.sub,
      role: payload.role,
      tokenType,
    };
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    throw getTokenError(tokenType, error instanceof jwt.TokenExpiredError);
  }
}
