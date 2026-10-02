/**
 * Auth 요청 DTO가 정상 입력을 정규화하고 잘못된 필드를 배열형 오류로 반환하는지 검증합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  parseAccountRecoveryInput,
  parseConfirmPasswordResetInput,
  parseLoginInput,
  parseSignUpInput,
  parseVerifyPasswordResetCodeInput,
  parseWithdrawAccountInput,
} from "../../src/modules/auth/auth.validator";

describe("Auth validator", () => {
  test("회원가입 입력의 이메일과 전화번호를 정규화한다", () => {
    const input = parseSignUpInput({
      name: " 홍길동 ",
      email: " USER@Example.com ",
      phone: "010-1234-5678",
      password: "Password1!",
      role: "CUSTOMER",
    });

    expect(input).toEqual({
      name: "홍길동",
      email: "user@example.com",
      phone: "01012345678",
      password: "Password1!",
      role: "CUSTOMER",
    });
  });

  test("복구 질문과 답변은 함께 받고 답변을 정규화한다", () => {
    const base = { name: "홍길동", email: "user@example.com", phone: "01012345678", password: "Password1!", role: "CUSTOMER" };
    expect(parseSignUpInput({ ...base, recoveryQuestion: "CHILDHOOD_NICKNAME", recoveryAnswer: "  별명  " })).toMatchObject({ recoveryQuestion: "CHILDHOOD_NICKNAME", recoveryAnswer: "별명" });
    expect(() => parseSignUpInput({ ...base, recoveryQuestion: "CHILDHOOD_NICKNAME" })).toThrow(BadRequestError);
    expect(() => parseSignUpInput({ ...base, recoveryAnswer: "별명" })).toThrow(BadRequestError);
    expect(() => parseConfirmPasswordResetInput({ token: "token", newPassword: "Password1!", recoveryAnswer: "x" })).toThrow(BadRequestError);
  });

  test("목록 밖 복구 질문은 한국어 사유로 거절한다", () => {
    const base = { name: "홍길동", email: "user@example.com", phone: "01012345678", password: "Password1!", role: "CUSTOMER" };
    expect(() => parseSignUpInput({ ...base, recoveryQuestion: "UNKNOWN", recoveryAnswer: "별명" })).toThrow(
      expect.objectContaining({
        details: [expect.objectContaining({ field: "recoveryQuestion", reason: "제공된 복구 질문 중 하나를 선택해 주세요." })],
      }),
    );
  });

  test.each(["김지훈", "홍 길동", "Jihoon Kim", "Anne-Marie", "O'Connor", "김·지훈"])(
    "회원가입에서 허용된 이름 형식을 통과시킨다: %s",
    (name) => {
      expect(
        parseSignUpInput({
          name,
          email: "user@example.com",
          phone: "01012345678",
          password: "Password1!",
          role: "CUSTOMER",
        }).name,
      ).toBe(name);
    },
  );

  test.each(["", "ㄱㄴㄷ", "김지훈2", "홍길동!", "가".repeat(51)])(
    "회원가입에서 허용되지 않은 이름 형식을 거절한다: %s",
    (name) => {
      expect(() =>
        parseSignUpInput({
          name,
          email: "user@example.com",
          phone: "01012345678",
          password: "Password1!",
          role: "CUSTOMER",
        }),
      ).toThrow(BadRequestError);
    },
  );

  test("여러 필드가 잘못되면 details 배열에 모두 기록한다", () => {
    expect.assertions(2);

    try {
      parseSignUpInput({
        name: "",
        email: "invalid-email",
        phone: "1234",
        password: "weak",
        role: "ADMIN",
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details?.map((detail) => detail.field)).toEqual(
          expect.arrayContaining(["name", "email", "phone", "password", "role"]),
        );
      }
    }
  });

  test("로그인 요청에는 이메일, 비밀번호, 역할이 모두 필요하다", () => {
    expect(() => parseLoginInput({ email: "user@example.com" })).toThrow(
      BadRequestError,
    );
  });

  test("계정 복구 입력을 정규화하고 새 비밀번호 정책을 검증한다", () => {
    expect(parseAccountRecoveryInput({
      name: " 홍길동 ",
      email: " USER@Example.com ",
      role: "CUSTOMER",
    })).toEqual({ name: "홍길동", email: "user@example.com", role: "CUSTOMER" });

    expect(parseConfirmPasswordResetInput({
      token: "reset-token",
      newPassword: "NextPassword1!",
    })).toEqual({ token: "reset-token", newPassword: "NextPassword1!" });

    expect(() => parseConfirmPasswordResetInput({ token: "reset-token", newPassword: "weak" })).toThrow(BadRequestError);

    expect(parseVerifyPasswordResetCodeInput({
      challengeId: "11111111-1111-4111-8111-111111111111",
      code: "123456",
    })).toEqual({
      challengeId: "11111111-1111-4111-8111-111111111111",
      code: "123456",
    });
    expect(() => parseVerifyPasswordResetCodeInput({
      challengeId: "not-a-uuid",
      code: "12345",
    })).toThrow(BadRequestError);
  });

  test("OAuth 탈퇴는 빈 Body를 허용하고 이메일 계정 비밀번호는 원문을 보존한다", () => {
    expect(parseWithdrawAccountInput(undefined)).toEqual({});
    expect(
      parseWithdrawAccountInput({ currentPassword: " Password1! " }),
    ).toEqual({ currentPassword: " Password1! " });
  });

  test("탈퇴 요청의 빈 비밀번호와 임의 필드를 거절한다", () => {
    expect(() =>
      parseWithdrawAccountInput({ currentPassword: "" }),
    ).toThrow(BadRequestError);
    expect(() =>
      parseWithdrawAccountInput({ userId: "other-user-id" }),
    ).toThrow(BadRequestError);
  });
});
