/**
 * Auth 요청 DTO가 정상 입력을 정규화하고 잘못된 필드를 배열형 오류로 반환하는지 검증합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  parseLoginInput,
  parseSignUpInput,
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
});
