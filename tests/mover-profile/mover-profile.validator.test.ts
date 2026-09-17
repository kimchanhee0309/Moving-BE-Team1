/**
 * Mover Profile multipart body의 생성·수정 정규화와 계약 위반 거절을 검증합니다.
 * 실제 파일과 DB 없이 문자열 기반 요청 DTO만 확인합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  parseCreateMoverProfileRequest,
  parseUpdateMoverProfileRequest,
} from "../../src/modules/mover-profile/mover-profile.validator";

const validCreateBody = {
  nickname: " 김코드 ",
  careerYears: "8",
  shortIntroduction: " 꼼꼼한 이사 ",
  description: " 안전하게 운송합니다. ",
  serviceTypes: ["SMALL", "HOME"],
  regions: ["서울", "경기"],
};

describe("Mover Profile validator", () => {
  test("생성 요청 문자열을 정규화된 Request DTO로 변환한다", () => {
    expect(
      parseCreateMoverProfileRequest(
        validCreateBody,
        "/uploads/mover-profiles/image.jpg",
      ),
    ).toEqual({
      nickname: "김코드",
      careerYears: 8,
      shortIntroduction: "꼼꼼한 이사",
      description: "안전하게 운송합니다.",
      serviceTypes: ["SMALL", "HOME"],
      regions: ["서울", "경기"],
      profileImageUrl: "/uploads/mover-profiles/image.jpg",
    });
  });

  test("Swagger가 쉼표 문자열로 보낸 복수 서비스 유형과 지역을 배열로 변환한다", () => {
    expect(
      parseCreateMoverProfileRequest(
        {
          ...validCreateBody,
          serviceTypes: " SMALL,HOME ",
          regions: " 서울,경기 ",
        },
        null,
      ),
    ).toMatchObject({
      serviceTypes: ["SMALL", "HOME"],
      regions: ["서울", "경기"],
    });
  });

  test("client가 보낸 userId, moverId, role을 거절한다", () => {
    expect(() =>
      parseCreateMoverProfileRequest(
        { ...validCreateBody, userId: "other-user", moverId: "other-mover" },
        null,
      ),
    ).toThrow(BadRequestError);
  });

  test.each([
    ["음수 경력", { careerYears: "-1" }],
    ["상한 초과 경력", { careerYears: "51" }],
    ["소수 경력", { careerYears: "1.5" }],
    ["빈 닉네임", { nickname: " " }],
    ["한 줄 소개 길이 초과", { shortIntroduction: "가".repeat(256) }],
    ["상세 설명 길이 초과", { description: "가".repeat(1_001) }],
  ])("%s를 거절한다", (_scenario, override) => {
    expect(() =>
      parseCreateMoverProfileRequest({ ...validCreateBody, ...override }, null),
    ).toThrow(BadRequestError);
  });

  test("중복·허용되지 않은 서비스 유형과 지역을 거절한다", () => {
    expect(() =>
      parseCreateMoverProfileRequest(
        {
          ...validCreateBody,
          serviceTypes: ["HOME", "HOME"],
          regions: ["서울", "경기도"],
        },
        null,
      ),
    ).toThrow(BadRequestError);
  });

  test("쉼표 문자열 안의 중복 서비스 유형과 지역도 거절한다", () => {
    expect(() =>
      parseCreateMoverProfileRequest(
        {
          ...validCreateBody,
          serviceTypes: "HOME,HOME",
          regions: "서울,서울",
        },
        null,
      ),
    ).toThrow(BadRequestError);
  });

  test("PATCH는 전달된 필드만 반환하고 빈 요청을 거절한다", () => {
    expect(
      parseUpdateMoverProfileRequest({
        careerYears: "10",
        serviceTypes: "SMALL,OFFICE",
        regions: "제주,부산",
      }),
    ).toEqual({
      careerYears: 10,
      serviceTypes: ["SMALL", "OFFICE"],
      regions: ["제주", "부산"],
    });
    expect(() => parseUpdateMoverProfileRequest({})).toThrow(BadRequestError);
  });
});
