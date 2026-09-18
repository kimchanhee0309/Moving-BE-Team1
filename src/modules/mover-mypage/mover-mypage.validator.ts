/** 기사님 기본정보 수정 Body를 Zod로 검증하고 정규화합니다. */
import { z } from "zod";

import { BadRequestError } from "../../common/errors/app-error";
import { userNameSchema } from "../../common/validation/user-name-schema";
import { parseWithZod } from "../../common/validation/zod-parser";
import type { UpdateMoverBasicInfoRequestDto } from "./mover-mypage.dto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KOREAN_MOBILE_PATTERN = /^01[016789]\d{7,8}$/;
const PASSWORD_LETTER_PATTERN = /[A-Za-z]/;
const PASSWORD_NUMBER_PATTERN = /\d/;
const PASSWORD_SPECIAL_PATTERN = /[^A-Za-z0-9]/;

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
  .nullable()
  .transform((value) =>
    value === null || value.trim() === ""
      ? null
      : value.replace(/[-\s]/g, ""),
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

const updateMoverBasicInfoSchema = z
  .object({
    name: userNameSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    currentPassword: passwordSchema("currentPassword").optional(),
    newPassword: passwordSchema("newPassword").optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasNewPassword = value.newPassword !== undefined;

    if (hasNewPassword && value.currentPassword === undefined) {
      context.addIssue({
        code: "custom",
        path: ["currentPassword"],
        message: "비밀번호 변경에는 현재 비밀번호가 필요합니다.",
      });
    }
  });

/** 빈 PATCH를 거절하고 Customer Profile과 같은 기본정보·비밀번호 정책을 적용합니다. */
export function parseUpdateMoverBasicInfoRequest(
  bodyValue: unknown,
): UpdateMoverBasicInfoRequestDto {
  const body = parseWithZod(updateMoverBasicInfoSchema, bodyValue, {
    message: "입력값을 확인해 주세요.",
    fallbackField: "body",
  });

  if (Object.keys(body).length === 0) {
    throw new BadRequestError(
      "입력값을 확인해 주세요.",
      "VALIDATION_ERROR",
      [{ field: "body", reason: "수정할 값을 한 개 이상 입력해 주세요." }],
    );
  }

  return body;
}
