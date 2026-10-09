/**
 * 회원가입 이메일 인증의 코드 HMAC과 이메일 인증 토큰이 이메일·용도에 묶여 있는지 검증합니다.
 * DB와 SMTP는 사용하지 않으며 tests/setup-env.ts의 테스트 전용 Secret으로 실제 서명·검증을 수행합니다.
 */
import jwt from "jsonwebtoken";

import { createPasswordResetToken } from "../../src/modules/auth/auth-recovery";
import { hashPasswordResetCode } from "../../src/modules/auth/auth-password-reset-code";
import {
  SIGNUP_EMAIL_VERIFICATION_TOKEN_EXPIRES_IN_SECONDS,
  createSignupEmailCode,
  createSignupEmailVerificationToken,
  hashSignupEmailCode,
  matchesSignupEmailCode,
  verifySignupEmailVerificationToken,
} from "../../src/modules/auth/auth-signup-email-verification";

const VERIFICATION_ID = "11111111-1111-4111-8111-111111111111";

describe("Signup email verification code", () => {
  test("앞자리 0을 유지한 6자리 숫자 코드를 만든다", () => {
    for (let index = 0; index < 50; index += 1) {
      expect(createSignupEmailCode()).toMatch(/^\d{6}$/);
    }
  });

  test("같은 이메일의 올바른 코드만 일치하고 다른 이메일·코드는 거절한다", () => {
    const hash = hashSignupEmailCode("user@example.com", "123456");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(matchesSignupEmailCode("user@example.com", "123456", hash)).toBe(true);
    expect(matchesSignupEmailCode("user@example.com", "654321", hash)).toBe(false);
    expect(matchesSignupEmailCode("other@example.com", "123456", hash)).toBe(false);
  });

  test("같은 Secret을 쓰는 비밀번호 재설정 코드 hash와 값이 겹치지 않는다", () => {
    // 사전 조건: 재설정 코드는 `${userId}:${code}`를 서명하므로 식별자가 같아도 용도 구분값 때문에 달라야 합니다.
    expect(hashSignupEmailCode("user@example.com", "123456")).not.toBe(
      hashPasswordResetCode("user@example.com", "123456"),
    );
  });
});

describe("Signup email verification token", () => {
  test("서명된 토큰에서 인증한 이메일과 인증 기록 ID를 복원하고 15분 뒤 만료된다", () => {
    const token = createSignupEmailVerificationToken(
      "user@example.com",
      VERIFICATION_ID,
    );
    const decoded = jwt.decode(token);

    expect(verifySignupEmailVerificationToken(token)).toEqual({
      email: "user@example.com",
      verificationId: VERIFICATION_ID,
    });
    expect(decoded).toEqual(
      expect.objectContaining({ exp: expect.any(Number), iat: expect.any(Number) }),
    );
    if (decoded && typeof decoded !== "string" && decoded.exp && decoded.iat) {
      expect(decoded.exp - decoded.iat).toBe(
        SIGNUP_EMAIL_VERIFICATION_TOKEN_EXPIRES_IN_SECONDS,
      );
    }
  });

  test("위조된 토큰과 만료된 토큰을 EMAIL_VERIFICATION_TOKEN_INVALID로 거절한다", () => {
    const token = createSignupEmailVerificationToken(
      "user@example.com",
      VERIFICATION_ID,
    );
    const invalidError = expect.objectContaining({
      code: "EMAIL_VERIFICATION_TOKEN_INVALID",
      status: 400,
    });

    expect(() => verifySignupEmailVerificationToken("not-a-token")).toThrow(invalidError);
    expect(() => verifySignupEmailVerificationToken(`${token}x`)).toThrow(invalidError);

    jest.useFakeTimers({
      now: Date.now() + (SIGNUP_EMAIL_VERIFICATION_TOKEN_EXPIRES_IN_SECONDS + 1) * 1000,
    });
    try {
      expect(() => verifySignupEmailVerificationToken(token)).toThrow(invalidError);
    } finally {
      jest.useRealTimers();
    }
  });

  test("같은 Secret으로 서명한 비밀번호 재설정 토큰은 가입 인증에 쓸 수 없다", () => {
    const resetToken = createPasswordResetToken(
      "00000000-0000-0000-0000-000000000001",
      "CUSTOMER",
      "bcrypt-current-hash",
      VERIFICATION_ID,
    );

    expect(() => verifySignupEmailVerificationToken(resetToken)).toThrow(
      expect.objectContaining({ code: "EMAIL_VERIFICATION_TOKEN_INVALID" }),
    );
  });
});
