/**
 * 기사님 찾기 목록·상세 Controller가 인증 없이 검증된 입력만 Service에 넘기는지 검증합니다.
 */
jest.mock("../../src/modules/mover-search/mover-search.validator", () => ({
  parseMoverSearchQuery: jest.fn(),
  parseMoverSearchIdParams: jest.fn(),
}));

jest.mock("../../src/modules/mover-search/mover-search.service", () => ({
  listMovers: jest.fn(),
  getMoverById: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import {
  getMoverByIdController,
  listMoversController,
} from "../../src/modules/mover-search/mover-search.controller";
import {
  getMoverById,
  listMovers,
} from "../../src/modules/mover-search/mover-search.service";
import {
  parseMoverSearchIdParams,
  parseMoverSearchQuery,
} from "../../src/modules/mover-search/mover-search.validator";

const query = {
  regions: [],
  services: [],
  sort: "reviewCount" as const,
  page: 1,
  pageSize: 5,
};

const listResult = {
  items: [],
  nextPage: null,
  totalCount: 0,
};

const moverId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const mover = {
  id: moverId,
  serviceType: "SMALL" as const,
  region: "서울",
  serviceTypes: ["SMALL" as const, "HOME" as const],
  regions: ["서울" as const, "경기" as const],
  moverName: "김코드",
  introduction: "소개",
  description: "상세",
  profileImageUrl: null,
  rating: 4.5,
  reviewCount: 2,
  careerYears: 8,
  confirmedCount: 1,
  favoriteCount: 4,
};

function createResponse(): Response {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  jest.mocked(response.status).mockReturnValue(response);
  return response;
}

describe("listMoversController", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("검증된 query로 목록을 조회하고 data.items를 반환한다", async () => {
    jest.mocked(parseMoverSearchQuery).mockReturnValue(query);
    jest.mocked(listMovers).mockResolvedValue(listResult);
    const response = createResponse();

    await listMoversController(
      { query: {} } as unknown as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(listMovers).toHaveBeenCalledWith(query);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: listResult,
    });
  });
});

describe("getMoverByIdController", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("검증된 id로 상세를 조회하고 data.mover를 반환한다", async () => {
    jest.mocked(parseMoverSearchIdParams).mockReturnValue({ id: moverId });
    jest.mocked(getMoverById).mockResolvedValue(mover);
    const response = createResponse();

    await getMoverByIdController(
      { params: { id: moverId } } as unknown as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(getMoverById).toHaveBeenCalledWith(moverId);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { mover },
    });
  });
});
