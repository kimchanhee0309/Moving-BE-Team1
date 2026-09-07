import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
export const randomToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

/** salt별 scrypt 해시. 입력 길이는 라우트 검증에서 제한하며 원문은 저장하지 않습니다. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // 계정이 없는 경우에도 동일 비용의 KDF를 수행해 빠른 실패와 구분되지 않게 합니다.
  const [, salt = "0".repeat(32), hash = "0".repeat(128)] = (stored ?? "").split(":");
  const key = await derive(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key) && stored !== null;
}
