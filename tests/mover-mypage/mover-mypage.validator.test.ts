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

  test("빈 PATCH를 거절한다", () => {
    expect(() => parseUpdateMoverBasicInfoRequest({})).toThrow(
      expect.objectContaining({
        status: 400,
        code: "VALIDATION_ERROR",
      }),
    );
  });

  test("현재 비밀번호와 새 비밀번호는 함께 받아야 한다", () => {
    expect(() =>
      parseUpdateMoverBasicInfoRequest({ currentPassword: "old-pass1!" }),
    ).toThrow(
      expect.objectContaining({
        status: 400,
        code: "VALIDATION_ERROR",
      }),
    );
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
