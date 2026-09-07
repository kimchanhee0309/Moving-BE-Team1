import { BadRequestError } from "../../common/errors/app-error";

export type AuthRole = "CUSTOMER" | "MOVER";
/** 클라이언트가 임의의 권한/프로필 완료 상태를 저장하지 못하도록 허용 필드만 반환합니다. */
export function parseRole(value: unknown): AuthRole {
  if (value !== "CUSTOMER" && value !== "MOVER") throw new BadRequestError("일반 유저 또는 기사님을 선택해 주세요.", "VALIDATION_ERROR");
  return value;
}

function text(value: unknown): string { return typeof value === "string" ? value : ""; }
export function parseCredentials(body: unknown, signup = false) {
  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const email = text(data.email).trim().toLowerCase();
  const password = text(data.password);
  const name = text(data.name).trim();
  const phone = text(data.phone).replace(/[\s-]/g, "");
  const role = parseRole(data.role);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 128) {
    throw new BadRequestError("이메일과 비밀번호를 확인해 주세요.", "VALIDATION_ERROR");
  }
  if (signup && (!name || name.length > 80 || !/^(?:010\d{8}|01[16789]\d{7,8}|02\d{7,8}|0(?:[3-6][1-5]|70)\d{7,8})$/.test(phone) || password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password) || !/[^a-zA-Z0-9\s]/.test(password) || /\s/.test(password))) {
    throw new BadRequestError("이름, 전화번호와 비밀번호 조건을 확인해 주세요.", "VALIDATION_ERROR");
  }
  return { email, password, name, phone, role };
}

/** 외부 주소로 인증 결과를 보내지 않습니다. 경로 정규화 후에도 같은 origin인지 검사합니다. */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/";
  const url = new URL(value, "https://moving.local");
  return url.origin === "https://moving.local" ? `${url.pathname}${url.search}${url.hash}` : "/";
}
