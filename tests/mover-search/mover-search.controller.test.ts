/**
 * 기사님 찾기 목록 Controller가 인증 없이 검증된 query만 Service에 넘기는지 검증합니다.
 */
jest.mock("../../src/modules/mover-search/mover-search.validator", () => ({
  parseMoverSearchQuery: jest.fn(),
}));

jest.mock("../../src/modules/mover-search/mover-search.service", () => ({
  listMovers: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import { listMoversController } from "../../src/modules/mover-search/mover-search.controller";
import { listMovers } from "../../src/modules/mover-search/mover-search.service";
import { parseMoverSearchQuery } from "../../src/modules/mover-search/mover-search.validator";

const query = {
  regions: [],
  services: [],
  sort: "reviewCount" as const,
  page: 1,
  pageSize: 5,
};

const result = {
  items: [],
  nextPage: null,
  totalCount: 0,
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
    jest.mocked(listMovers).mockResolvedValue(result);
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
      data: result,
    });
  });
});
