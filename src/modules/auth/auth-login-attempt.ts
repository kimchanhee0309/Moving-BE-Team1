/** 단일 서버에서 계정별 로그인 실패를 추적합니다. 이메일 원문 대신 해시 키만 보관합니다. */
import { createHash } from "node:crypto";

import { TooManyRequestsError } from "../../common/errors/app-error";
import type { LoginRequestDto } from "./auth.dto";

const MAX_FAILURES = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000;

interface LoginAttemptState {
  failures: number;
  blockedUntil: number;
}

const attempts = new Map<string, LoginAttemptState>();

function keyOf(input: Pick<LoginRequestDto, "email" | "role">): string {
  return createHash("sha256").update(`${input.role}:${input.email}`).digest("base64url");
}

function blockedError(): TooManyRequestsError {
  return new TooManyRequestsError(
    "로그인에 5회 실패해 15분간 로그인이 제한되었습니다. 비밀번호 찾기를 이용해 주세요.",
    "LOGIN_ATTEMPTS_EXCEEDED",
  );
}

export function assertLoginAttemptAllowed(
  input: Pick<LoginRequestDto, "email" | "role">,
  now = Date.now(),
): void {
  const key = keyOf(input);
  const state = attempts.get(key);
  if (!state) return;
  if (state.blockedUntil <= now) {
    attempts.delete(key);
    return;
  }
  if (state.failures >= MAX_FAILURES) throw blockedError();
}

export function registerLoginFailure(
  input: Pick<LoginRequestDto, "email" | "role">,
  now = Date.now(),
): void {
  const key = keyOf(input);
  const current = attempts.get(key);
  const failures = current && current.blockedUntil > now ? current.failures + 1 : 1;
  if (failures >= MAX_FAILURES) {
    attempts.set(key, { failures, blockedUntil: now + BLOCK_DURATION_MS });
    throw blockedError();
  }
  attempts.set(key, { failures, blockedUntil: now + BLOCK_DURATION_MS });
}

export function clearLoginAttempts(
  input: Pick<LoginRequestDto, "email" | "role">,
): void {
  attempts.delete(keyOf(input));
}
