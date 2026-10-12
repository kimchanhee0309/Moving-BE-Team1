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
  SignupEmailCodeRequestDto,
  VerifyPasswordResetCodeRequestDto,
  VerifySignupEmailCodeRequestDto,
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
    // 필수 여부는 SIGNUP_EMAIL_VERIFICATION_REQUIRED에 따라 Service가 판단하므로 여기서는 형식만 확인합니다.
    emailVerificationToken: requiredString
      .max(4096, { error: "이메일 인증 정보가 올바르지 않습니다." })
      .optional(),
    recoveryQuestion: z.unknown().optional(),
    recoveryAnswer: z.unknown().optional(),
  })
  .strict()
  // 구버전 FE가 전송한 두 필드만 허용해 제거하며 다른 미지의 필드는 계속 거절합니다.
  .transform(({ name, email, phone, password, role, emailVerificationToken }) => ({
    name,
    email,
    phone,
    password,
    role,
    // 구버전 FE처럼 토큰이 없을 때 undefined key를 남기지 않아 기존 DTO 모양을 유지합니다.
    ...(emailVerificationToken === undefined ? {} : { emailVerificationToken }),
  }));

const signupEmailCodeSchema = z.object({ email: emailSchema }).strict();

const verifySignupEmailCodeSchema = z
  .object({
    email: emailSchema,
    code: z.string({ error: "인증코드는 문자열이어야 합니다." }).regex(/^\d{6}$/, {
      error: "인증코드는 6자리 숫자여야 합니다.",
    }),
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
    recoveryAnswer: z.unknown().optional(),
  })
  .strict()
  // 배포 중 구버전 FE의 답변만 무시하고 토큰·새 비밀번호 검증은 유지합니다.
  .transform(({ token, newPassword }) => ({ token, newPassword }));

const verifyPasswordResetCodeSchema = z
  .object({
    challengeId: z.uuid({ error: "비밀번호 재설정 요청 ID가 올바르지 않습니다." }),
    code: z.string({ error: "인증코드는 문자열이어야 합니다." }).regex(/^\d{6}$/, {
      error: "인증코드는 6자리 숫자여야 합니다.",
    }),
  })
  .strict();

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
 * 회원가입 인증코드를 받을 이메일의 형식을 검증하고 소문자로 정규화합니다.
 * @param value Express가 전달한 신뢰하지 않는 요청 Body
 * @returns 정규화된 이메일만 포함한 DTO
 * @throws 형식·필수값·허용 필드 검증 실패 시 VALIDATION_ERROR
 * @remarks 가입 여부는 조회하지 않으며 DB·cookie·token을 변경하지 않습니다.
 */
export function parseSignupEmailCodeInput(
  value: unknown,
): SignupEmailCodeRequestDto {
  return parseWithZod(signupEmailCodeSchema, value, { fallbackField: "body" });
}

/**
 * 회원가입 인증코드 확인 입력의 이메일과 6자리 숫자 형식을 검증합니다.
 * @param value Express가 전달한 신뢰하지 않는 요청 Body
 * @returns 정규화된 이메일과 코드 DTO
 * @throws 형식·필수값·허용 필드 검증 실패 시 VALIDATION_ERROR
 * @remarks 코드 일치 여부는 Service가 DB의 HMAC으로 확인합니다.
 */
export function parseVerifySignupEmailCodeInput(
  value: unknown,
): VerifySignupEmailCodeRequestDto {
  return parseWithZod(verifySignupEmailCodeSchema, value, {
    fallbackField: "body",
  });
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

export function parseVerifyPasswordResetCodeInput(
  value: unknown,
): VerifyPasswordResetCodeRequestDto {
  return parseWithZod(verifyPasswordResetCodeSchema, value, {
    fallbackField: "body",
  });
}
