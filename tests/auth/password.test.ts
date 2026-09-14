/**
 * bcrypt가 같은 비밀번호를 검증하고 다른 비밀번호는 거절하는지 확인합니다.
 * 생성된 hash가 원문과 다른지도 함께 검증해 평문 저장 회귀를 막습니다.
 */
import {
  hashPassword,
  verifyPassword,
} from "../../src/modules/auth/password";

describe("Password", () => {
  test("비밀번호를 hash하고 올바른 원문만 일치시킨다", async () => {
    const passwordHash = await hashPassword("Password1!");

    expect(passwordHash).not.toBe("Password1!");
    await expect(verifyPassword("Password1!", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("WrongPassword1!", passwordHash)).resolves.toBe(
      false,
    );
  });
});
