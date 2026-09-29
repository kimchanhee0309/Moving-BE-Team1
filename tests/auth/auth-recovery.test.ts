import {
  createPasswordResetToken,
  matchesCredentialVersion,
  verifyPasswordResetToken,
} from "../../src/modules/auth/auth-recovery";

describe("Auth password recovery token", () => {
  test("서명된 단기 토큰에서 사용자·역할·현재 credential 버전을 복원한다", () => {
    const token = createPasswordResetToken(
      "00000000-0000-0000-0000-000000000001",
      "CUSTOMER",
      "bcrypt-current-hash",
    );
    const payload = verifyPasswordResetToken(token);

    expect(payload).toMatchObject({
      userId: "00000000-0000-0000-0000-000000000001",
      role: "CUSTOMER",
    });
    expect(matchesCredentialVersion("bcrypt-current-hash", payload.credentialVersion)).toBe(true);
    expect(matchesCredentialVersion("bcrypt-changed-hash", payload.credentialVersion)).toBe(false);
  });

  test("위조된 토큰을 PASSWORD_RESET_TOKEN_INVALID로 거절한다", () => {
    expect(() => verifyPasswordResetToken("not-a-token")).toThrow(
      expect.objectContaining({ code: "PASSWORD_RESET_TOKEN_INVALID" }),
    );
  });
});
