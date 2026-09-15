/**
 * 받은 견적 목록 Controller가 profile ID만 Service에 넘기고 data.items로 응답하는지 검증합니다.
 */
jest.mock("../../src/modules/customer-quote/customer-quote.validator", () => ({
  parseQuoteIdParams: jest.fn(),
  parseReceivedQuotesQuery: jest.fn(),
}));

jest.mock("../../src/modules/customer-quote/customer-quote.service", () => ({
  getReceivedQuoteDetail: jest.fn(),
  listReceivedQuotes: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import { ForbiddenError } from "../../src/common/errors/app-error";
import {
  getReceivedQuoteDetailController,
  listReceivedQuotesController,
} from "../../src/modules/customer-quote/customer-quote.controller";
import {
  getReceivedQuoteDetail,
  listReceivedQuotes,
} from "../../src/modules/customer-quote/customer-quote.service";
import {
  parseQuoteIdParams,
  parseReceivedQuotesQuery,
} from "../../src/modules/customer-quote/customer-quote.validator";

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

describe("getReceivedQuoteDetailController", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("검증된 quoteId와 profileId로 상세를 조회하고 data.quote를 반환한다", async () => {
    const quoteId = "11111111-1111-4111-8111-111111111111";
    const detail = {
      quote: {
        id: quoteId,
        price: 150000,
        comment: "안전하게 이사를 도와드리겠습니다.",
        status: "PROPOSED" as const,
        isDesignated: true,
        createdAt: "2026-09-11T03:00:00.000Z",
        updatedAt: "2026-09-11T03:00:00.000Z",
        mover: {
          id: "22222222-2222-4222-8222-222222222222",
          nickname: "김코드",
          profileImageUrl: null,
          careerYears: 7,
          shortIntroduction: "안전하고 빠른 이사",
          reviewCount: 128,
          averageRating: 4.8,
          favoriteCount: 56,
          isFavorite: true,
          description: "소형·가정이사 전문입니다.",
          serviceTypes: ["SMALL", "HOME"],
          regions: ["서울", "경기"],
        },
        moveRequest: {
          id: "33333333-3333-4333-8333-333333333333",
          serviceType: "SMALL",
          moveDate: "2026-09-20T01:00:00.000Z",
          fromAddress: "서울시 중구",
          toAddress: "경기도 수원시",
          status: "WAITING" as const,
        },
      },
    };
    jest.mocked(parseQuoteIdParams).mockReturnValue(quoteId);
    jest.mocked(getReceivedQuoteDetail).mockResolvedValue(detail);
    const response = createResponse();

    await getReceivedQuoteDetailController(
      {
        params: { quoteId },
        auth: {
          userId: "user-id",
          role: "CUSTOMER",
          profileId: "customer-profile-id",
        },
      } as unknown as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(getReceivedQuoteDetail).toHaveBeenCalledWith(
      "customer-profile-id",
      quoteId,
    );
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: detail,
    });
  });
});
