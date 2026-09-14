/**
 * 받은 견적 목록 Controller가 profile ID만 Service에 넘기고 data.items로 응답하는지 검증합니다.
 */
jest.mock("../../src/modules/customer-quote/customer-quote.validator", () => ({
  parseReceivedQuotesQuery: jest.fn(),
}));

jest.mock("../../src/modules/customer-quote/customer-quote.service", () => ({
  listReceivedQuotes: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import { ForbiddenError } from "../../src/common/errors/app-error";
import { listReceivedQuotesController } from "../../src/modules/customer-quote/customer-quote.controller";
import { listReceivedQuotes } from "../../src/modules/customer-quote/customer-quote.service";
import { parseReceivedQuotesQuery } from "../../src/modules/customer-quote/customer-quote.validator";

const query = {
  sort: "CREATED_AT_DESC" as const,
  limit: 10,
};

const result = {
  items: [],
  pagination: {
    nextCursor: null,
    hasNext: false,
  },
};

function createResponse(): Response {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  jest.mocked(response.status).mockReturnValue(response);
  return response;
}

describe("listReceivedQuotesController", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("검증된 query와 profileId로 목록을 조회하고 data.items를 반환한다", async () => {
    jest.mocked(parseReceivedQuotesQuery).mockReturnValue(query);
    jest.mocked(listReceivedQuotes).mockResolvedValue(result);
    const response = createResponse();

    await listReceivedQuotesController(
      {
        query: { limit: "10" },
        auth: {
          userId: "user-id",
          role: "CUSTOMER",
          profileId: "customer-profile-id",
        },
      } as unknown as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(listReceivedQuotes).toHaveBeenCalledWith("customer-profile-id", query);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: result,
    });
  });

  test("프로필이 없으면 PROFILE_REQUIRED를 던진다", async () => {
    jest.mocked(parseReceivedQuotesQuery).mockReturnValue(query);

    await expect(
      listReceivedQuotesController(
        {
          query: {},
          auth: { userId: "user-id", role: "CUSTOMER" },
        } as Request,
        createResponse(),
        jest.fn() as NextFunction,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(listReceivedQuotes).not.toHaveBeenCalled();
  });
});
