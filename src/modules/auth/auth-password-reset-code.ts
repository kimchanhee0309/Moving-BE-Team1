/**
 * 비밀번호 재설정용 6자리 코드 생성과 HMAC 검증을 담당합니다.
 * 코드 원문은 메일에만 전달하고 DB·로그·오류에는 저장하지 않습니다.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { ServiceUnavailableError } from "../../common/errors/app-error";
import { env } from "../../config/env";

export const PASSWORD_RESET_CODE_EXPIRES_IN_MS = 5 * 60 * 1000;
export const PASSWORD_RESET_CODE_EXPIRES_IN_SECONDS = 5 * 60;
export const PASSWORD_RESET_CODE_RESEND_AFTER_SECONDS = 60;
export const PASSWORD_RESET_CODE_MAX_FAILED_ATTEMPTS = 5;

function getPasswordResetCodeSecret(): string {
  const secret = env.PASSWORD_RESET_CODE_SECRET;
  if (!secret || secret.length < 32) {
    throw new ServiceUnavailableError(
      "비밀번호 재설정 보안 설정이 필요합니다.",
      "PASSWORD_RECOVERY_NOT_CONFIGURED",
    );
  }

  return secret;
}

/**
 * 메일 본문에만 사용할 6자리 숫자 코드를 암호학적으로 안전하게 생성합니다.
 * @returns 앞자리 0을 포함할 수 있는 6자리 코드
 * @remarks DB와 로그에는 원문을 저장하지 않습니다.
 */
export function createPasswordResetCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * 짧은 숫자 코드의 오프라인 대입을 막도록 사용자 ID와 서버 Secret으로 HMAC을 생성합니다.
 * @param userId 코드가 속한 User UUID
 * @param code 메일로 보낼 또는 사용자가 입력한 6자리 코드
 * @returns DB 저장·비교용 SHA-256 HMAC hex
 */
export function hashPasswordResetCode(userId: string, code: string): string {
  return createHmac("sha256", getPasswordResetCodeSecret())
    .update(`${userId}:${code}`)
    .digest("hex");
}

/**
 * 입력 코드의 HMAC을 일정 시간 비교해 원문 코드 노출 없이 일치 여부를 확인합니다.
 * @param userId 코드가 속한 User UUID
 * @param code 사용자가 입력한 6자리 코드
 * @param expectedHash DB에 저장된 HMAC hex
 * @returns 코드 일치 여부
 */
export function matchesPasswordResetCode(
  userId: string,
  code: string,
  expectedHash: string,
): boolean {
  const received = Buffer.from(hashPasswordResetCode(userId, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return (
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}
