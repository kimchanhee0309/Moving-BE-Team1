/**
 * 이메일 회원가입과 로그인 요청 Body를 Zod로 검증하고 정규화합니다.
 * HTTP 입력만 책임지며 DB 중복 확인이나 비밀번호 해싱은 Service에 위임합니다.
 */
import { z } from "zod";

import { parseWithZod } from "../../common/validation/zod-parser";
import type { LoginRequestDto, SignUpRequestDto } from "./auth.dto";

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
    name: requiredString.max(50, { error: "50자 이하여야 합니다." }),
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
  })
  .strict();

const loginSchema = z
  .object({
    email: emailSchema,
    password: requiredString,
    role: roleSchema,
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
 * 로그인 입력 형식만 검증하며 계정 존재 여부는 조회하지 않습니다.
 * @param value Express가 전달한 신뢰하지 않는 요청 Body
 * @returns 이메일이 정규화된 로그인 요청 DTO
 * @throws 형식·필수값·허용 필드 검증 실패 시 VALIDATION_ERROR
 * @remarks DB·cookie·token을 변경하지 않습니다.
 */
export function parseLoginInput(value: unknown): LoginRequestDto {
  return parseWithZod(loginSchema, value, { fallbackField: "body" });
}
