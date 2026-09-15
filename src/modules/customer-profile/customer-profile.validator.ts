/**
 * multipart/form-data의 문자열 body를 Zod로 검증해 Customer Profile Service DTO로 정규화합니다.
 * 이미지 바이너리 검증은 image middleware가 담당하며 인증과 DB 조회는 수행하지 않습니다.
 */
import { z } from "zod";

import { BadRequestError } from "../../common/errors/app-error";
import { parseWithZod } from "../../common/validation/zod-parser";
import {
  CUSTOMER_REGIONS,
  CUSTOMER_SERVICE_TYPES,
} from "./customer-profile.constants";
import type {
  CreateCustomerProfileInput,
  UpdateCustomerProfileInput,
} from "./customer-profile.dto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KOREAN_MOBILE_PATTERN = /^01[016789]\d{7,8}$/;
const PASSWORD_LETTER_PATTERN = /[A-Za-z]/;
const PASSWORD_NUMBER_PATTERN = /\d/;
const PASSWORD_SPECIAL_PATTERN = /[^A-Za-z0-9]/;

const serviceTypesSchema = z
  .preprocess(
    (value) => {
      if (value === undefined) return [];
      const values = Array.isArray(value) ? value : [value];
      return values.map((serviceType) =>
        typeof serviceType === "string"
          ? serviceType.trim().toUpperCase()
          : serviceType,
      );
    },
    z
      .array(
        z.enum(CUSTOMER_SERVICE_TYPES, {
          error: "SMALL, HOME, OFFICE만 사용할 수 있습니다.",
        }),
      )
      .min(1, { error: "서비스 유형을 한 개 이상 선택해 주세요." }),
  )
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "같은 서비스 유형을 중복 선택할 수 없습니다.",
      });
    }
  });

const regionSchema = z
  .string({ error: "지역을 선택해 주세요." })
  .trim()
  .min(1, { error: "지역을 선택해 주세요." })
  .pipe(
    z.enum(CUSTOMER_REGIONS, {
      error: "지원하는 17개 시·도만 선택할 수 있습니다.",
    }),
  );

const nameSchema = z
  .string({ error: "이름을 입력해 주세요." })
  .trim()
  .min(1, { error: "이름을 입력해 주세요." })
  .max(50, { error: "이름은 50자 이하여야 합니다." });

const emailSchema = z
  .string({ error: "이메일을 입력해 주세요." })
  .trim()
  .min(1, { error: "이메일을 입력해 주세요." })
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .max(255, { error: "올바른 이메일 형식이 아닙니다." })
      .regex(EMAIL_PATTERN, { error: "올바른 이메일 형식이 아닙니다." }),
  );

const phoneSchema = z
  .string({ error: "전화번호 형식이 올바르지 않습니다." })
  .transform((value) =>
    value.trim() === "" ? null : value.replace(/[-\s]/g, ""),
  )
  .refine(
    (value) => value === null || KOREAN_MOBILE_PATTERN.test(value),
    { error: "올바른 국내 휴대전화 번호가 아닙니다." },
  );

function passwordSchema(field: "currentPassword" | "newPassword") {
  return z
    .string({ error: "비밀번호를 문자열로 입력해 주세요." })
    .refine(
      (value) => {
        const byteLength = Buffer.byteLength(value, "utf8");
        return byteLength >= 8 && byteLength <= 72;
      },
      { error: "비밀번호는 8~72바이트여야 합니다." },
    )
    .refine(
      (value) =>
        field === "currentPassword" ||
        (PASSWORD_LETTER_PATTERN.test(value) &&
          PASSWORD_NUMBER_PATTERN.test(value) &&
          PASSWORD_SPECIAL_PATTERN.test(value)),
      { error: "새 비밀번호에는 영문, 숫자, 특수문자가 모두 포함되어야 합니다." },
    );
}

const createCustomerProfileSchema = z
  .object({
    serviceTypes: serviceTypesSchema,
    region: regionSchema,
  })
  .strict();

const updateCustomerProfileSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    currentPassword: passwordSchema("currentPassword").optional(),
    newPassword: passwordSchema("newPassword").optional(),
    serviceTypes: serviceTypesSchema.optional(),
    region: regionSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasCurrentPassword = value.currentPassword !== undefined;
    const hasNewPassword = value.newPassword !== undefined;

    if (hasCurrentPassword !== hasNewPassword) {
      context.addIssue({
        code: "custom",
        path: [hasCurrentPassword ? "newPassword" : "currentPassword"],
        message:
          "비밀번호 변경에는 현재 비밀번호와 새 비밀번호가 모두 필요합니다.",
      });
    }
  });

/** 프로필 생성 body를 검증하고 인증 User에서 가져올 필드를 요청으로 받지 않습니다. */
export function parseCreateCustomerProfileInput(
  bodyValue: unknown,
  profileImageUrl: string | null,
): CreateCustomerProfileInput {
  const body = parseWithZod(createCustomerProfileSchema, bodyValue, {
    message: "입력값을 확인해 주세요.",
    fallbackField: "body",
  });

  return { ...body, profileImageUrl };
}

/**
 * 프로필 수정 body를 검증하고 생략·빈 문자열을 구분합니다.
 * phone 생략은 기존 값 유지, 빈 문자열은 DB null 저장이며 최소 한 필드가 필요합니다.
 */
export function parseUpdateCustomerProfileInput(
  bodyValue: unknown,
  profileImageUrl?: string,
): UpdateCustomerProfileInput {
  const body = parseWithZod(updateCustomerProfileSchema, bodyValue, {
    message: "입력값을 확인해 주세요.",
    fallbackField: "body",
  });

  if (Object.keys(body).length === 0 && profileImageUrl === undefined) {
    throw new BadRequestError(
      "입력값을 확인해 주세요.",
      "VALIDATION_ERROR",
      [{ field: "body", reason: "수정할 값을 한 개 이상 입력해 주세요." }],
    );
  }

  return {
    ...body,
    ...(profileImageUrl !== undefined ? { profileImageUrl } : {}),
  };
}
