import {
  assertLoginAttemptAllowed,
  clearLoginAttempts,
  registerLoginFailure,
} from "../../src/modules/auth/auth-login-attempt";

describe("Auth login attempt lock", () => {
  const input = { email: "attempt@example.test", role: "CUSTOMER" as const };

  afterEach(() => clearLoginAttempts(input));

  test("5번째 실패 응답부터 15분 제한 오류를 반환한다", () => {
    const now = 1_000_000;
    for (let count = 1; count < 5; count += 1) {
      expect(() => registerLoginFailure(input, now)).not.toThrow();
    }
    expect(() => registerLoginFailure(input, now)).toThrow(
      expect.objectContaining({ code: "LOGIN_ATTEMPTS_EXCEEDED", status: 429 }),
    );
    expect(() => assertLoginAttemptAllowed(input, now + 1)).toThrow(
      expect.objectContaining({ code: "LOGIN_ATTEMPTS_EXCEEDED" }),
    );
  });

  test("15분이 지나거나 로그인에 성공하면 실패 횟수를 초기화한다", () => {
    registerLoginFailure(input, 1_000_000);
    expect(() => assertLoginAttemptAllowed(input, 1_000_000 + 15 * 60 * 1000)).not.toThrow();

    registerLoginFailure(input, 2_000_000);
    clearLoginAttempts(input);
    expect(() => assertLoginAttemptAllowed(input, 2_000_001)).not.toThrow();
  });
});
