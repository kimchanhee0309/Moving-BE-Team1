/**
 * 회원가입 이메일 인증의 6자리 코드 HMAC과 코드 확인 뒤 발급하는 단기 "이메일 인증 토큰"을 담당합니다.
 * 처리 흐름: 코드 생성 → 이메일과 묶은 HMAC 저장·비교 → 확인 성공 시 15분 만료 JWT 발급 → 가입 시 JWT 검증.
 * DB 조회·메일 발송·가입 처리는 다루지 않으며 코드 원문과 토큰을 로그에 남기지 않습니다.
 * 운영 환경변수를 늘리지 않도록 비밀번호 재설정용 Secret을 재사용하되, 용도 구분값을 서명 대상에 넣어
 * 한 용도의 코드·토큰을 다른 용도에 쓸 수 없게 합니다.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import jwt from "jsonwebtoken";

import {
  BadRequestError,
  ServiceUnavailableError,
} from "../../common/errors/app-error";
import { env } from "../../config/env";

/** 인증코드 유효 시간(ms)입니다. */
export const SIGNUP_EMAIL_CODE_EXPIRES_IN_MS = 5 * 60 * 1000;
/** 응답으로 알려 주는 인증코드 유효 시간(초)입니다. */
export const SIGNUP_EMAIL_CODE_EXPIRES_IN_SECONDS = 5 * 60;
/** 같은 이메일로 코드를 다시 보낼 수 있을 때까지의 대기 시간(초)입니다. */
export const SIGNUP_EMAIL_CODE_RESEND_AFTER_SECONDS = 60;
/** 코드 한 건에 허용하는 최대 확인 시도 횟수입니다. */
export const SIGNUP_EMAIL_CODE_MAX_FAILED_ATTEMPTS = 5;
/** 이메일 인증 토큰의 유효 시간(초)입니다. 가입 양식을 마저 작성할 시간을 줍니다. */
export const SIGNUP_EMAIL_VERIFICATION_TOKEN_EXPIRES_IN_SECONDS = 15 * 60;

/** 비밀번호 재설정 코드 HMAC과 입력 공간이 겹치지 않게 하는 용도 구분값입니다. */
const CODE_HASH_PURPOSE = "signup-email-verification";
/** 비밀번호 재설정 토큰(password-reset)과 구분하는 JWT tokenType입니다. */
const VERIFICATION_TOKEN_TYPE = "signup-email-verification";

/** 검증을 통과한 이메일 인증 토큰에서 꺼낸 값입니다. */
export interface SignupEmailVerificationPayload {
  /** 인증을 마친 소문자 정규화 이메일입니다. */
  email: string;
  /** 토큰을 발급한 SignupEmailVerification 기록의 UUID입니다. */
  verificationId: string;
}

function getRequiredSecret(secret: string | undefined): string {
  if (!secret || secret.length < 32) {
    throw new ServiceUnavailableError(
      "이메일 인증 보안 설정이 필요합니다.",
      "EMAIL_VERIFICATION_NOT_CONFIGURED",
    );
  }

  return secret;
}

/**
 * 메일 본문에만 사용할 6자리 숫자 코드를 암호학적으로 안전하게 생성합니다.
 * @returns 앞자리 0을 포함할 수 있는 6자리 코드
 * @remarks DB와 로그에는 원문을 저장하지 않습니다.
 */
export function createSignupEmailCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * 짧은 숫자 코드의 오프라인 대입을 막도록 이메일·용도 구분값·서버 Secret으로 HMAC을 생성합니다.
 * @param email 코드가 속한 소문자 정규화 이메일
 * @param code 메일로 보낼 또는 사용자가 입력한 6자리 코드
 * @returns DB 저장·비교용 SHA-256 HMAC hex
 * @throws Secret 미설정 시 EMAIL_VERIFICATION_NOT_CONFIGURED
 */
export function hashSignupEmailCode(email: string, code: string): string {
  return createHmac("sha256", getRequiredSecret(env.PASSWORD_RESET_CODE_SECRET))
    .update(`${CODE_HASH_PURPOSE}:${email}:${code}`)
    .digest("hex");
}

/**
 * 입력 코드의 HMAC을 일정 시간 비교해 원문 코드 노출 없이 일치 여부를 확인합니다.
 * @param email 코드가 속한 소문자 정규화 이메일
 * @param code 사용자가 입력한 6자리 코드
 * @param expectedHash DB에 저장된 HMAC hex
 * @returns 코드 일치 여부
 * @throws Secret 미설정 시 EMAIL_VERIFICATION_NOT_CONFIGURED
 */
export function matchesSignupEmailCode(
  email: string,
  code: string,
  expectedHash: string,
): boolean {
  const received = Buffer.from(hashSignupEmailCode(email, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

/**
 * 코드 확인을 마친 이메일에 15분 만료 이메일 인증 토큰을 발급합니다.
 * @param email 인증을 마친 소문자 정규화 이메일
 * @param verificationId 검증 완료 처리한 SignupEmailVerification UUID
 * @returns 가입 요청 Body로 전달할 서명된 JWT
 * @throws Secret 미설정 시 EMAIL_VERIFICATION_NOT_CONFIGURED
 * @remarks 로그인 권한이 없는 토큰이며 cookie가 아닌 응답 Body로만 전달합니다.
 */
export function createSignupEmailVerificationToken(
  email: string,
  verificationId: string,
): string {
  return jwt.sign(
    { tokenType: VERIFICATION_TOKEN_TYPE, email },
    getRequiredSecret(env.PASSWORD_RESET_TOKEN_SECRET),
    {
      algorithm: "HS256",
      expiresIn: SIGNUP_EMAIL_VERIFICATION_TOKEN_EXPIRES_IN_SECONDS,
      issuer: env.JWT_ISSUER,
      jwtid: verificationId,
    },
  );
}

/**
 * 이메일 인증 토큰의 서명·만료·발급자·용도를 확인하고 인증된 이메일을 복원합니다.
 * @param token 가입 요청이 전달한 이메일 인증 토큰
 * @returns 인증된 이메일과 인증 기록 UUID
 * @throws 위조·만료·다른 용도의 토큰이면 EMAIL_VERIFICATION_TOKEN_INVALID, Secret 미설정 시 EMAIL_VERIFICATION_NOT_CONFIGURED
 * @remarks 일회성 여부는 확인하지 않으며 Service가 DB 기록으로 다시 검증합니다.
 */
export function verifySignupEmailVerificationToken(
  token: string,
): SignupEmailVerificationPayload {
  try {
    const payload = jwt.verify(
      token,
      getRequiredSecret(env.PASSWORD_RESET_TOKEN_SECRET),
      { algorithms: ["HS256"], issuer: env.JWT_ISSUER },
    );

    // 같은 Secret으로 서명한 비밀번호 재설정 토큰을 가입 인증에 쓰지 못하도록 tokenType을 확인합니다.
    if (
      typeof payload === "string" ||
      payload.tokenType !== VERIFICATION_TOKEN_TYPE ||
      typeof payload.email !== "string" ||
      typeof payload.jti !== "string"
    ) {
      throw new Error("invalid signup email verification token payload");
    }

    return { email: payload.email, verificationId: payload.jti };
  } catch (error: unknown) {
    if (error instanceof ServiceUnavailableError) throw error;

    throw new BadRequestError(
      "이메일 인증이 만료되었거나 올바르지 않습니다. 이메일 인증을 다시 진행해 주세요.",
      "EMAIL_VERIFICATION_TOKEN_INVALID",
    );
  }
}
