/**
 * 일반 이메일 계정의 비밀번호 해싱과 비교를 담당합니다.
 * 원문 비밀번호나 생성된 hash를 로그와 API 응답에 노출하지 않습니다.
 */
import bcrypt from "bcrypt";

const PASSWORD_SALT_ROUNDS = 10;

/** bcrypt salt를 포함한 단방향 hash를 생성하며 DB 저장 외 용도로 반환하지 않습니다. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

/** 입력 비밀번호와 저장된 hash를 timing-safe한 bcrypt 비교 함수로 검증합니다. */
export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
