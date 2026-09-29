/**
 * 이메일 회원가입·로그인과 회원 탈퇴 요청 Body를 Zod로 검증하고 정규화합니다.
 * HTTP 입력만 책임지며 DB 중복 확인이나 비밀번호 해싱은 Service에 위임합니다.
 */
import { z } from "zod";

import { userNameSchema } from "../../common/validation/user-name-schema";
import { parseWithZod } from "../../common/validation/zod-parser";
import type {
  AccountRecoveryRequestDto,
  ConfirmPasswordResetRequestDto,
  LoginRequestDto,
  SignUpRequestDto,
  VerifyRecoveryAnswerRequestDto,
  WithdrawAccountRequestDto,
} from "./auth.dto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^01[016789]\d{7,8}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).+$/;

const requiredString = z
  .string({ error: "필수 문자열 값입니다." })
  .trim()
  .min(1, { error: "필수 문자열 값입니다." });

const roleSchema = z.enum(["CUSTOMER", "MOVER"], {
  error: "CUSTOMER 또는 MOVER만 사용할 수 있습니다.",
});

const recoveryQuestionSchema = z.enum([
  "CHILDHOOD_NICKNAME",
  "MEMORABLE_PLACE",
  "PERSONAL_PHRASE",
]);

const recoveryAnswerSchema = z
  .string({ error: "복구 답변은 문자열이어야 합니다." })
  .transform((value) => value.normalize("NFKC").trim().toLowerCase())
  .pipe(z.string().min(2, { error: "복구 답변은 2자 이상 입력해 주세요." }).max(100, { error: "복구 답변은 100자 이내로 입력해 주세요." }));

const emailSchema = requiredString
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .max(255, { error: "올바른 이메일 형식이 아닙니다." })
      .regex(EMAIL_PATTERN, { error: "올바른 이메일 형식이 아닙니다." }),
  );

const passwordSchema = requiredString.refine(
  (value) =>
    value.length >= 8 &&
    Buffer.byteLength(value, "utf8") <= 72 &&
    PASSWORD_PATTERN.test(value),
  { error: "8~72바이트이며 영문, 숫자, 특수문자를 포함해야 합니다." },
);

const signUpSchema = z
  .object({
    name: userNameSchema,
    email: emailSchema,
    phone: requiredString
      .transform((value) => value.replace(/-/g, ""))
      .pipe(
        z.string().regex(PHONE_PATTERN, {
          error: "올바른 휴대전화 번호 형식이 아닙니다.",
        }),
      ),
    password: passwordSchema,
    role: roleSchema,
    recoveryQuestion: recoveryQuestionSchema,
    recoveryAnswer: recoveryAnswerSchema,
  })
  .strict();

const loginSchema = z
  .object({
    email: emailSchema,
    password: requiredString,
    role: roleSchema,
  })
  .strict();

const withdrawAccountSchema = z
  .object({
    currentPassword: z
      .string({ error: "현재 비밀번호는 문자열이어야 합니다." })
      .min(1, { error: "현재 비밀번호를 입력해 주세요." })
      .optional(),
  })
  .strict();

const accountRecoverySchema = z
  .object({
    name: userNameSchema,
    email: emailSchema,
    role: roleSchema,
  })
  .strict();

const confirmPasswordResetSchema = z
  .object({
    token: requiredString.max(4096, { error: "재설정 인증이 올바르지 않습니다." }),
    newPassword: passwordSchema,
  })
  .strict();

const verifyRecoveryAnswerSchema = accountRecoverySchema.extend({
  recoveryAnswer: recoveryAnswerSchema,
}).strict();

/**
 * 회원가입 필수값과 길이·형식을 검증하고 이메일과 전화번호를 정규화합니다.
 * @param value Express가 전달한 신뢰하지 않는 요청 Body
 * @returns Service가 사용할 검증된 회원가입 요청 DTO
 * @throws 형식·필수값·허용 필드 검증 실패 시 VALIDATION_ERROR
 * @remarks DB·cookie·token을 변경하지 않습니다.
 */
export function parseSignUpInput(value: unknown): SignUpRequestDto {
  return parseWithZod(signUpSchema, value, { fallbackField: "body" });
}

/**
 * 로그인 입력 형식만 검증하며 계정 존재 여부는 조회하지 않습니다.
 * @param value Express가 전달한 신뢰하지 않는 요청 Body
 * @returns 이메일이 정규화된 로그인 요청 DTO
 * @throws 형식·필수값·허용 필드 검증 실패 시 VALIDATION_ERROR
 * @remarks DB·cookie·token을 변경하지 않습니다.
 */
export function parseLoginInput(value: unknown): LoginRequestDto {
  return parseWithZod(loginSchema, value, { fallbackField: "body" });
}

/**
 * 회원 탈퇴 Body의 허용 필드만 검증하며 계정 유형별 필수 여부는 Service가 최신 User로 판단합니다.
 * @param value Express가 전달한 신뢰하지 않는 요청 Body
 * @returns 선택적 현재 비밀번호만 포함한 탈퇴 요청 DTO
 * @throws 형식·허용 필드 검증 실패 시 VALIDATION_ERROR
 * @remarks 비밀번호를 정규화하거나 로그·응답에 포함하지 않습니다.
 */
export function parseWithdrawAccountInput(
  value: unknown,
): WithdrawAccountRequestDto {
  return parseWithZod(withdrawAccountSchema, value ?? {}, {
    fallbackField: "body",
  });
}

export function parseAccountRecoveryInput(
  value: unknown,
): AccountRecoveryRequestDto {
  return parseWithZod(accountRecoverySchema, value, { fallbackField: "body" });
}

export function parseConfirmPasswordResetInput(
  value: unknown,
): ConfirmPasswordResetRequestDto {
  return parseWithZod(confirmPasswordResetSchema, value, {
    fallbackField: "body",
  });
}

export function parseVerifyRecoveryAnswerInput(
  value: unknown,
): VerifyRecoveryAnswerRequestDto {
  return parseWithZod(verifyRecoveryAnswerSchema, value, {
    fallbackField: "body",
  });
}
