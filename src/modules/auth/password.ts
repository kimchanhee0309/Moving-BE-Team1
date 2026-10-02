/**
 * 일반 이메일 계정의 비밀번호 해싱과 비교를 담당합니다.
 * 원문 비밀번호나 생성된 hash를 로그와 API 응답에 노출하지 않습니다.
 */
import { createHash } from "node:crypto";

import bcrypt from "bcrypt";

const PASSWORD_SALT_ROUNDS = 10;

/** bcrypt salt를 포함한 단방향 hash를 생성하며 DB 저장 외 용도로 반환하지 않습니다. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

/**
 * 복구 답변을 bcrypt 입력용 고정 길이 문자열로 바꿉니다.
 * 답변은 최대 100자(한글 약 300바이트)라 bcrypt의 72바이트 입력 제한을 넘을 수 있습니다.
 * 72바이트 이후가 무시되면 앞부분만 같은 다른 답변도 통과하므로, SHA-256 hex(64바이트)로 전체 답변을 반영한 뒤 bcrypt에 넣습니다.
 */
function digestRecoveryAnswer(answer: string): string {
  return createHash("sha256").update(answer, "utf8").digest("hex");
}

/**
 * 정규화된 복구 답변의 bcrypt hash를 생성합니다. 원문은 저장·로그·응답하지 않습니다.
 * @param answer validator에서 NFKC·trim·소문자 정규화를 마친 답변
 * @returns DB recoveryAnswerHash에 저장할 bcrypt hash
 */
export function hashRecoveryAnswer(answer: string): Promise<string> {
  return bcrypt.hash(digestRecoveryAnswer(answer), PASSWORD_SALT_ROUNDS);
}

/**
 * 정규화된 복구 답변이 저장된 hash와 일치하는지 bcrypt로 비교합니다.
 * @param answer validator에서 정규화를 마친 답변
 * @param answerHash hashRecoveryAnswer로 만든 저장 hash
 * @returns 일치하면 true
 */
export function verifyRecoveryAnswer(answer: string, answerHash: string): Promise<boolean> {
  return bcrypt.compare(digestRecoveryAnswer(answer), answerHash);
}

/** 입력 비밀번호와 저장된 hash를 timing-safe한 bcrypt 비교 함수로 검증합니다. */
export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
