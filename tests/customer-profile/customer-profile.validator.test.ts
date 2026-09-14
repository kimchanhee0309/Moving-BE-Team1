/**
 * Customer Profile multipart body의 생성·수정 정규화와 명세 위반 거절을 검증합니다.
 * 실제 파일과 DB 없이 문자열 기반 DTO 계약만 확인합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  parseCreateCustomerProfileInput,
  parseUpdateCustomerProfileInput,
} from "../../src/modules/customer-profile/customer-profile.validator";

describe("Customer Profile validator", () => {
  test("생성 요청의 반복 serviceTypes와 한글 지역을 DTO로 변환한다", () => {
    const input = parseCreateCustomerProfileInput(
      { serviceTypes: ["SMALL", "HOME"], region: "서울" },
      "/uploads/customer-profiles/image.jpg",
    );

    expect(input).toEqual({
      serviceTypes: ["SMALL", "HOME"],
      region: "서울",
      profileImageUrl: "/uploads/customer-profiles/image.jpg",
    });
  });

  test("생성 요청에서 인증 User 소유 필드를 받지 않는다", () => {
    expect(() =>
      parseCreateCustomerProfileInput(
        { serviceTypes: "SMALL", region: "서울", userId: "other-user" },
        null,
      ),
    ).toThrow(BadRequestError);
  });

  test("PATCH에서 phone 빈 문자열은 null, 생략은 미포함으로 구분한다", () => {
    expect(parseUpdateCustomerProfileInput({ phone: "" })).toEqual({ phone: null });
    expect(parseUpdateCustomerProfileInput({ name: " 홍길동 " })).toEqual({
      name: "홍길동",
    });
  });

  test("비밀번호 변경에는 현재 비밀번호와 새 비밀번호가 모두 필요하다", () => {
    expect(() =>
      parseUpdateCustomerProfileInput({ newPassword: "Changed1!" }),
    ).toThrow(BadRequestError);
  });

  test("수정 필드와 이미지가 모두 없으면 빈 PATCH를 거절한다", () => {
    expect(() => parseUpdateCustomerProfileInput({})).toThrow(BadRequestError);
  });

  test("중복 서비스 유형과 지원하지 않는 지역을 거절한다", () => {
    expect(() =>
      parseUpdateCustomerProfileInput({
        serviceTypes: ["HOME", "HOME"],
        region: "경기도",
      }),
    ).toThrow(BadRequestError);
  });
});
