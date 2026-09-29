/** 복구 답변 검증 뒤 발급하는 단기 비밀번호 재설정 토큰을 담당합니다. */
import { createHash, timingSafeEqual } from "node:crypto";

import jwt from "jsonwebtoken";

import type { UserRole } from "../../generated/prisma/enums";
import { env } from "../../config/env";
import {
  BadRequestError,
  ServiceUnavailableError,
} from "../../common/errors/app-error";

interface PasswordResetPayload {
  userId: string;
  role: UserRole;
  credentialVersion: string;
}

const RESET_TOKEN_TYPE = "password-reset";
const RESET_TOKEN_MAX_AGE_SECONDS = 15 * 60;

function getRecoverySecret(): string {
  if ((env.PASSWORD_RESET_TOKEN_SECRET?.length ?? 0) < 32) {
    throw new ServiceUnavailableError(
      "비밀번호 재설정 보안 설정이 필요합니다.",
      "PASSWORD_RECOVERY_NOT_CONFIGURED",
    );
  }
  return env.PASSWORD_RESET_TOKEN_SECRET!;
}

function credentialVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url");
}

export function createPasswordResetToken(
  userId: string,
  role: UserRole,
  passwordHash: string,
): string {
  const secret = getRecoverySecret();
  return jwt.sign(
    { role, tokenType: RESET_TOKEN_TYPE, credentialVersion: credentialVersion(passwordHash) },
    secret,
    {
      algorithm: "HS256",
      expiresIn: RESET_TOKEN_MAX_AGE_SECONDS,
      issuer: env.JWT_ISSUER,
      subject: userId,
    },
  );
}

export function verifyPasswordResetToken(token: string): PasswordResetPayload {
  try {
    const secret = getRecoverySecret();
    const payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
    });
    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      (payload.role !== "CUSTOMER" && payload.role !== "MOVER") ||
      payload.tokenType !== RESET_TOKEN_TYPE ||
      typeof payload.credentialVersion !== "string"
    ) {
      throw new Error("invalid reset token payload");
    }
    return {
      userId: payload.sub,
      role: payload.role,
      credentialVersion: payload.credentialVersion,
    };
  } catch (error) {
    if (error instanceof ServiceUnavailableError) throw error;
    throw new BadRequestError(
      "비밀번호 재설정 인증이 만료되었거나 올바르지 않습니다.",
      "PASSWORD_RESET_TOKEN_INVALID",
    );
  }
}

export function matchesCredentialVersion(
  passwordHash: string,
  version: string,
): boolean {
  const expected = Buffer.from(credentialVersion(passwordHash));
  const received = Buffer.from(version);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
