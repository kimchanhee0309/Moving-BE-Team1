/** 기사님 기본정보 수정 요청의 정규화와 검증 규칙을 확인합니다. */
import { BadRequestError } from "../../src/common/errors/app-error";
import { parseUpdateMoverBasicInfoRequest } from "../../src/modules/mover-mypage/mover-mypage.validator";

describe("Mover My Page validator", () => {
  test("기본정보를 정규화한다", () => {
    expect(
      parseUpdateMoverBasicInfoRequest({
        name: "  홍길동  ",
        email: "  MOVER@EXAMPLE.COM ",
        phone: "010-1234-5678",
      }),
    ).toEqual({
      name: "홍길동",
      email: "mover@example.com",
      phone: "01012345678",
    });
  });

  test("빈 전화번호는 null로 정규화한다", () => {
    expect(parseUpdateMoverBasicInfoRequest({ phone: " " })).toEqual({
      phone: null,
    });
  });

  test("명시적인 null 전화번호를 허용한다", () => {
    expect(parseUpdateMoverBasicInfoRequest({ phone: null })).toEqual({
      phone: null,
    });
  });

  test.each(["ㄱㄴㄷ", "김지훈2", "홍길동!"])(
    "허용되지 않은 이름 형식을 거절한다: %s",
    (name) => {
      expect(() => parseUpdateMoverBasicInfoRequest({ name })).toThrow(
        BadRequestError,
      );
    },
  );

  test("빈 PATCH를 거절한다", () => {
    expect(() => parseUpdateMoverBasicInfoRequest({})).toThrow(
      expect.objectContaining({
        status: 400,
        code: "VALIDATION_ERROR",
      }),
    );
  });

  test("현재 비밀번호만 전달한 기본정보 수정은 허용한다", () => {
    expect(
      parseUpdateMoverBasicInfoRequest({ currentPassword: "old-pass1!" }),
    ).toEqual({ currentPassword: "old-pass1!" });
  });

  test("새 비밀번호 변경에는 현재 비밀번호가 필요하다", () => {
    expect(() =>
      parseUpdateMoverBasicInfoRequest({ newPassword: "new-pass2!" }),
    ).toThrow(expect.objectContaining({ status: 400, code: "VALIDATION_ERROR" }));
  });

  test("새 비밀번호 복잡도와 알 수 없는 필드를 검증한다", () => {
    expect(() =>
      parseUpdateMoverBasicInfoRequest({
        currentPassword: "old-pass1!",
        newPassword: "abcdefgh",
        role: "CUSTOMER",
      }),
    ).toThrow(
      expect.objectContaining({
        status: 400,
        code: "VALIDATION_ERROR",
      }),
    );
  });
});
