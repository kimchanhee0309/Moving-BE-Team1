jest.mock("../../src/modules/mover-mypage/mover-mypage.service", () => ({
  getMoverMyPage: jest.fn(),
  updateMoverBasicInfo: jest.fn(),
}));

jest.mock("../../src/modules/mover-mypage/mover-mypage.validator", () => ({
  parseUpdateMoverBasicInfoRequest: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import {
  getMoverMyPageController,
  updateMoverBasicInfoController,
} from "../../src/modules/mover-mypage/mover-mypage.controller";
import {
  getMoverMyPage,
  updateMoverBasicInfo,
} from "../../src/modules/mover-mypage/mover-mypage.service";
import { parseUpdateMoverBasicInfoRequest } from "../../src/modules/mover-mypage/mover-mypage.validator";

const myPage = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "홍길동",
  email: "mover@example.com",
  phone: "01012345678",
  profileImageUrl: null,
  nickname: "김코드",
  careerYears: 7,
  shortIntroduction: "안전한 이사를 돕습니다.",
  description: "설명입니다.",
  serviceTypes: ["SMALL" as const],
  regions: ["서울" as const],
  confirmedCount: 3,
  favoriteCount: 2,
  rating: 4.5,
  reviewCount: 2,
  ratingCounts: [
    { score: 5 as const, count: 1 },
    { score: 4 as const, count: 1 },
    { score: 3 as const, count: 0 },
    { score: 2 as const, count: 0 },
    { score: 1 as const, count: 0 },
  ],
};

function createRequest(): Request {
  return {
    auth: {
      userId: "user-id",
      role: "MOVER",
      profileId: myPage.id,
    },
    body: {},
  } as Request;
}

function createResponse(): Response {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  jest.mocked(response.status).mockReturnValue(response);
  return response;
}

describe("Mover My Page controller", () => {
  beforeEach(() => jest.resetAllMocks());

  test("profileId로 마이페이지를 조회하고 data.myPage로 반환한다", async () => {
    jest.mocked(getMoverMyPage).mockResolvedValue(myPage);
    const response = createResponse();

    await getMoverMyPageController(
      createRequest(),
      response,
      jest.fn() as NextFunction,
    );

    expect(getMoverMyPage).toHaveBeenCalledWith(myPage.id);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { myPage },
    });
  });

  test("검증된 기본정보를 수정하고 data.basicInfo로 반환한다", async () => {
    const input = { name: "새 이름" };
    const basicInfo = {
      name: "새 이름",
      email: myPage.email,
      phone: myPage.phone,
    };
    jest.mocked(parseUpdateMoverBasicInfoRequest).mockReturnValue(input);
    jest.mocked(updateMoverBasicInfo).mockResolvedValue(basicInfo);
    const request = createRequest();
    request.body = input;
    const response = createResponse();

    await updateMoverBasicInfoController(
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(parseUpdateMoverBasicInfoRequest).toHaveBeenCalledWith(input);
    expect(updateMoverBasicInfo).toHaveBeenCalledWith(myPage.id, input);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { basicInfo },
    });
  });
});
