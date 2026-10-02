/**
 * bcrypt가 같은 비밀번호를 검증하고 다른 비밀번호는 거절하는지 확인합니다.
 * 생성된 hash가 원문과 다른지도 함께 검증해 평문 저장 회귀를 막습니다.
 */
import {
  hashPassword,
  hashRecoveryAnswer,
  verifyPassword,
  verifyRecoveryAnswer,
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

  /**
   * 시나리오: 앞 72바이트(한글 24자)가 같고 뒷부분만 다른 긴 복구 답변을 비교합니다.
   * 기대 결과: bcrypt 입력 제한으로 뒷부분이 무시되지 않고 다른 답변은 거절합니다.
   */
  test("72바이트를 넘는 복구 답변도 전체 내용을 비교한다", async () => {
    const prefix = "가".repeat(30);
    const answerHash = await hashRecoveryAnswer(`${prefix}정답`);

    expect(answerHash).not.toContain(prefix);
    await expect(verifyRecoveryAnswer(`${prefix}정답`, answerHash)).resolves.toBe(true);
    await expect(verifyRecoveryAnswer(`${prefix}오답`, answerHash)).resolves.toBe(false);
  });
});
