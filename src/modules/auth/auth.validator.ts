/**
 * 이메일 회원가입과 로그인 요청 Body를 런타임에 검증하고 정규화합니다.
 * HTTP 입력만 책임지며 DB 중복 확인이나 비밀번호 해싱은 Service에 위임합니다.
 */
import type { UserRole } from "../../generated/prisma/enums";
import { BadRequestError, type ErrorDetails } from "../../common/errors/app-error";
import type { LoginInput, SignUpInput } from "./auth.dto";

const USER_ROLE_LIST = ["CUSTOMER", "MOVER"] as const satisfies readonly UserRole[];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^01[016789]\d{7,8}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).+$/;

function getRequestBody(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(
      "요청값이 올바르지 않습니다.",
      "VALIDATION_ERROR",
      [{ field: "body", reason: "JSON 객체 형식이어야 합니다." }],
    );
  }

  return value as Record<string, unknown>;
}

function getTrimmedString(
  body: Record<string, unknown>,
  field: string,
  details: ErrorDetails,
): string {
  const value = body[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    details.push({ field, reason: "필수 문자열 값입니다." });
    return "";
  }

  return value.trim();
}

function parseRole(value: string, details: ErrorDetails): UserRole {
  if (value === "CUSTOMER" || value === "MOVER") {
    return value;
  }

  details.push({
    field: "role",
    reason: `${USER_ROLE_LIST.join(" 또는 ")}만 사용할 수 있습니다.`,
  });
  return "CUSTOMER";
}

function throwIfInvalid(details: ErrorDetails): void {
  if (details.length > 0) {
    throw new BadRequestError(
      "요청값이 올바르지 않습니다.",
      "VALIDATION_ERROR",
      details,
    );
  }
}

/** 회원가입 필수값과 길이·형식을 검증하고 이메일과 전화번호를 정규화합니다. */
export function parseSignUpInput(value: unknown): SignUpInput {
  const body = getRequestBody(value);
  const details: ErrorDetails = [];
  const name = getTrimmedString(body, "name", details);
  const email = getTrimmedString(body, "email", details).toLowerCase();
  const phone = getTrimmedString(body, "phone", details).replace(/-/g, "");
  const password = getTrimmedString(body, "password", details);
  const role = parseRole(getTrimmedString(body, "role", details), details);

  if (name.length > 50) {
    details.push({ field: "name", reason: "50자 이하여야 합니다." });
  }

  if (email.length > 255 || (email && !EMAIL_PATTERN.test(email))) {
    details.push({ field: "email", reason: "올바른 이메일 형식이 아닙니다." });
  }

  if (phone && !PHONE_PATTERN.test(phone)) {
    details.push({ field: "phone", reason: "올바른 휴대전화 번호 형식이 아닙니다." });
  }

  // bcrypt는 72바이트 이후 입력을 구분하지 않으므로 길이를 함께 제한합니다.
  if (
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    (password && !PASSWORD_PATTERN.test(password))
  ) {
    details.push({
      field: "password",
      reason: "8~72바이트이며 영문, 숫자, 특수문자를 포함해야 합니다.",
    });
  }

  throwIfInvalid(details);

  return { name, email, phone, password, role };
}

/** 로그인 입력을 검증하며 계정 존재 여부와 무관하게 동일한 형식 오류만 반환합니다. */
export function parseLoginInput(value: unknown): LoginInput {
  const body = getRequestBody(value);
  const details: ErrorDetails = [];
  const email = getTrimmedString(body, "email", details).toLowerCase();
  const password = getTrimmedString(body, "password", details);
  const role = parseRole(getTrimmedString(body, "role", details), details);

  if (email.length > 255 || (email && !EMAIL_PATTERN.test(email))) {
    details.push({ field: "email", reason: "올바른 이메일 형식이 아닙니다." });
  }

  throwIfInvalid(details);

  return { email, password, role };
}
