/**
 * multipart/form-data의 문자열 body를 Customer Profile Service DTO로 검증·정규화합니다.
 * 이미지 바이너리 검증은 image middleware가 담당하며 인증과 DB 조회는 수행하지 않습니다.
 */
import { BadRequestError, type ErrorDetails } from "../../common/errors/app-error";
import {
  isCustomerRegion,
  isCustomerServiceType,
  type CustomerRegion,
  type CustomerServiceType,
} from "./customer-profile.constants";
import type {
  CreateCustomerProfileInput,
  UpdateCustomerProfileInput,
} from "./customer-profile.dto";

const CREATE_FIELDS = new Set(["serviceTypes", "region"]);
const UPDATE_FIELDS = new Set([
  "name",
  "email",
  "phone",
  "currentPassword",
  "newPassword",
  "serviceTypes",
  "region",
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KOREAN_MOBILE_PATTERN = /^01[016789]\d{7,8}$/;
const PASSWORD_LETTER_PATTERN = /[A-Za-z]/;
const PASSWORD_NUMBER_PATTERN = /\d/;
const PASSWORD_SPECIAL_PATTERN = /[^A-Za-z0-9]/;

function toBodyRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validationError([{ field: "body", reason: "요청 본문 형식이 올바르지 않습니다." }]);
  }

  return value as Record<string, unknown>;
}

function validationError(details: ErrorDetails): BadRequestError {
  return new BadRequestError("입력값을 확인해 주세요.", "VALIDATION_ERROR", details);
}

function rejectUnknownFields(body: Record<string, unknown>, allowedFields: Set<string>): void {
  const unknownFields = Object.keys(body).filter((field) => !allowedFields.has(field));

  if (unknownFields.length > 0) {
    throw validationError(
      unknownFields.map((field) => ({ field, reason: "허용되지 않은 필드입니다." })),
    );
  }
}

function parseRequiredString(
  value: unknown,
  field: string,
  reason: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validationError([{ field, reason }]);
  }

  return value.trim();
}

function parseServiceTypes(value: unknown): CustomerServiceType[] {
  const values = Array.isArray(value) ? value : [value];

  if (
    values.length === 0 ||
    values.some((serviceType) => typeof serviceType !== "string")
  ) {
    throw validationError([
      { field: "serviceTypes", reason: "서비스 유형을 한 개 이상 선택해 주세요." },
    ]);
  }

  const normalized = values.map((serviceType) =>
    typeof serviceType === "string" ? serviceType.trim().toUpperCase() : "",
  );

  if (normalized.some((serviceType) => !isCustomerServiceType(serviceType))) {
    throw validationError([
      { field: "serviceTypes", reason: "SMALL, HOME, OFFICE만 사용할 수 있습니다." },
    ]);
  }

  if (new Set(normalized).size !== normalized.length) {
    throw validationError([
      { field: "serviceTypes", reason: "같은 서비스 유형을 중복 선택할 수 없습니다." },
    ]);
  }

  return normalized.filter(isCustomerServiceType);
}

function parseRegion(value: unknown): CustomerRegion {
  const region = parseRequiredString(value, "region", "지역을 선택해 주세요.");

  if (!isCustomerRegion(region)) {
    throw validationError([{ field: "region", reason: "지원하는 17개 시·도만 선택할 수 있습니다." }]);
  }

  return region;
}

function parseName(value: unknown): string {
  const name = parseRequiredString(value, "name", "이름을 입력해 주세요.");

  if (name.length > 50) {
    throw validationError([{ field: "name", reason: "이름은 50자 이하여야 합니다." }]);
  }

  return name;
}

function parseEmail(value: unknown): string {
  const email = parseRequiredString(value, "email", "이메일을 입력해 주세요.").toLowerCase();

  if (email.length > 255 || !EMAIL_PATTERN.test(email)) {
    throw validationError([{ field: "email", reason: "올바른 이메일 형식이 아닙니다." }]);
  }

  return email;
}

function parsePhone(value: unknown): string | null {
  if (typeof value !== "string") {
    throw validationError([{ field: "phone", reason: "전화번호 형식이 올바르지 않습니다." }]);
  }

  // multipart에는 실제 null 타입이 없으므로 빈 문자열을 명시적인 삭제 요청으로 해석합니다.
  if (value.trim() === "") {
    return null;
  }

  const phone = value.replace(/[-\s]/g, "");

  if (!KOREAN_MOBILE_PATTERN.test(phone)) {
    throw validationError([{ field: "phone", reason: "올바른 국내 휴대전화 번호가 아닙니다." }]);
  }

  return phone;
}

function parsePassword(value: unknown, field: "currentPassword" | "newPassword"): string {
  if (typeof value !== "string") {
    throw validationError([{ field, reason: "비밀번호를 문자열로 입력해 주세요." }]);
  }

  const byteLength = Buffer.byteLength(value, "utf8");

  if (byteLength < 8 || byteLength > 72) {
    throw validationError([{ field, reason: "비밀번호는 8~72바이트여야 합니다." }]);
  }

  if (
    field === "newPassword" &&
    (!PASSWORD_LETTER_PATTERN.test(value) ||
      !PASSWORD_NUMBER_PATTERN.test(value) ||
      !PASSWORD_SPECIAL_PATTERN.test(value))
  ) {
    throw validationError([
      { field, reason: "새 비밀번호에는 영문, 숫자, 특수문자가 모두 포함되어야 합니다." },
    ]);
  }

  return value;
}

/** 프로필 생성 body를 검증하고 인증 User에서 가져올 필드를 요청으로 받지 않습니다. */
export function parseCreateCustomerProfileInput(
  bodyValue: unknown,
  profileImageUrl: string | null,
): CreateCustomerProfileInput {
  const body = toBodyRecord(bodyValue);
  rejectUnknownFields(body, CREATE_FIELDS);

  return {
    serviceTypes: parseServiceTypes(body.serviceTypes),
    region: parseRegion(body.region),
    profileImageUrl,
  };
}

/**
 * 프로필 수정 body를 검증하고 생략·빈 문자열을 구분합니다.
 * phone 생략은 기존 값 유지, 빈 문자열은 DB null 저장이며 최소 한 필드가 필요합니다.
 */
export function parseUpdateCustomerProfileInput(
  bodyValue: unknown,
  profileImageUrl?: string,
): UpdateCustomerProfileInput {
  const body = toBodyRecord(bodyValue);
  rejectUnknownFields(body, UPDATE_FIELDS);

  if (Object.keys(body).length === 0 && profileImageUrl === undefined) {
    throw validationError([{ field: "body", reason: "수정할 값을 한 개 이상 입력해 주세요." }]);
  }

  const input: UpdateCustomerProfileInput = {};

  if (Object.hasOwn(body, "name")) input.name = parseName(body.name);
  if (Object.hasOwn(body, "email")) input.email = parseEmail(body.email);
  if (Object.hasOwn(body, "phone")) input.phone = parsePhone(body.phone);
  if (Object.hasOwn(body, "serviceTypes")) {
    input.serviceTypes = parseServiceTypes(body.serviceTypes);
  }
  if (Object.hasOwn(body, "region")) input.region = parseRegion(body.region);

  const hasCurrentPassword = Object.hasOwn(body, "currentPassword");
  const hasNewPassword = Object.hasOwn(body, "newPassword");

  if (hasCurrentPassword !== hasNewPassword) {
    const missingField = hasCurrentPassword ? "newPassword" : "currentPassword";
    throw validationError([
      { field: missingField, reason: "비밀번호 변경에는 현재 비밀번호와 새 비밀번호가 모두 필요합니다." },
    ]);
  }

  if (hasCurrentPassword && hasNewPassword) {
    input.currentPassword = parsePassword(body.currentPassword, "currentPassword");
    input.newPassword = parsePassword(body.newPassword, "newPassword");
  }

  if (profileImageUrl !== undefined) input.profileImageUrl = profileImageUrl;

  return input;
}
