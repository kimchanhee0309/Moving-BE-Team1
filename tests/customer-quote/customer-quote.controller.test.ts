/**
 * 받은 견적 목록 Controller가 profile ID만 Service에 넘기고 data.items로 응답하는지 검증합니다.
 */
jest.mock("../../src/modules/customer-quote/customer-quote.validator", () => ({
  parseQuoteIdParams: jest.fn(),
  parseReceivedQuoteHistoryQuery: jest.fn(),
  parseReceivedQuotesQuery: jest.fn(),
}));

jest.mock("../../src/modules/customer-quote/customer-quote.service", () => ({
  confirmReceivedQuote: jest.fn(),
  getReceivedQuoteDetail: jest.fn(),
  getReceivedQuoteHistoryDetail: jest.fn(),
  listReceivedQuoteHistory: jest.fn(),
  listReceivedQuotes: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import { ForbiddenError } from "../../src/common/errors/app-error";
import {
  confirmReceivedQuoteController,
  getReceivedQuoteDetailController,
  getReceivedQuoteHistoryDetailController,
  listReceivedQuoteHistoryController,
  listReceivedQuotesController,
} from "../../src/modules/customer-quote/customer-quote.controller";
import {
  confirmReceivedQuote,
  getReceivedQuoteDetail,
  getReceivedQuoteHistoryDetail,
  listReceivedQuoteHistory,
  listReceivedQuotes,
} from "../../src/modules/customer-quote/customer-quote.service";
import {
  parseQuoteIdParams,
  parseReceivedQuoteHistoryQuery,
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
          createdAt: "2026-09-10T02:00:00.000Z",
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

describe("history controllers", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("과거 목록은 history query와 profileId를 전달한다", async () => {
    const historyQuery = {
      sort: "UPDATED_AT_DESC" as const,
      limit: 10,
    };
    jest.mocked(parseReceivedQuoteHistoryQuery).mockReturnValue(historyQuery);
    jest.mocked(listReceivedQuoteHistory).mockResolvedValue(result);
    const response = createResponse();

    await listReceivedQuoteHistoryController(
      {
        query: {},
        auth: {
          userId: "user-id",
          role: "CUSTOMER",
          profileId: "customer-profile-id",
        },
      } as unknown as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(listReceivedQuoteHistory).toHaveBeenCalledWith(
      "customer-profile-id",
      historyQuery,
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });

  test("과거 상세는 quoteId와 profileId로 data.quote를 반환한다", async () => {
    const quoteId = "44444444-4444-4444-8444-444444444444";
    const historyDetail = {
      quote: {
        id: quoteId,
        price: 180000,
        comment: "선택해 주셔서 감사합니다.",
        status: "CONFIRMED" as const,
        isDesignated: false,
        createdAt: "2026-08-01T03:00:00.000Z",
        updatedAt: "2026-08-02T05:00:00.000Z",
        mover: {
          id: "22222222-2222-4222-8222-222222222222",
          nickname: "김코드",
          profileImageUrl: null,
          careerYears: 7,
          shortIntroduction: "안전하고 빠른 이사",
          reviewCount: 128,
          averageRating: 4.8,
          favoriteCount: 56,
          isFavorite: false,
          description: "소형·가정이사 전문입니다.",
          serviceTypes: ["HOME"],
          regions: ["서울"],
        },
        moveRequest: {
          id: "55555555-5555-4555-8555-555555555555",
          serviceType: "HOME",
          moveDate: "2026-08-10T01:00:00.000Z",
          fromAddress: "서울시 강남구",
          toAddress: "서울시 마포구",
          status: "COMPLETED" as const,
          createdAt: "2026-08-01T02:00:00.000Z",
        },
      },
    };
    jest.mocked(parseQuoteIdParams).mockReturnValue(quoteId);
    jest.mocked(getReceivedQuoteHistoryDetail).mockResolvedValue(historyDetail);
    const response = createResponse();

    await getReceivedQuoteHistoryDetailController(
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

    expect(getReceivedQuoteHistoryDetail).toHaveBeenCalledWith(
      "customer-profile-id",
      quoteId,
    );
  });
});

describe("confirmReceivedQuoteController", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("quoteId와 profileId로 확정하고 data.quote를 반환한다", async () => {
    const quoteId = "11111111-1111-4111-8111-111111111111";
    const confirmed = {
      quote: {
        id: quoteId,
        status: "CONFIRMED" as const,
      },
    };
    jest.mocked(parseQuoteIdParams).mockReturnValue(quoteId);
    jest.mocked(confirmReceivedQuote).mockResolvedValue(confirmed as never);
    const response = createResponse();

    await confirmReceivedQuoteController(
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

    expect(confirmReceivedQuote).toHaveBeenCalledWith(
      "customer-profile-id",
      quoteId,
    );
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: confirmed,
    });
  });
});
