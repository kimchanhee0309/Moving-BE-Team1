/**
 * Mover Quote Controller가 인증된 기사 profileId와 검증된 입력을
 * Service에 전달하고 공통 성공 응답을 반환하는지 검증합니다.
 */
jest.mock("../../src/modules/mover-quote/mover-quote.validator", () => ({
  parseGetMoverQuotesQuery: jest.fn(),
  parseGetRejectedRequestsQuery: jest.fn(),
  parseMoverQuoteId: jest.fn(),
}));

jest.mock("../../src/modules/mover-quote/mover-quote.service", () => ({
  getMoverQuotes: jest.fn(),
  getMoverQuoteDetail: jest.fn(),
  getRejectedRequests: jest.fn(),
}));

jest.mock("../../src/common/utils/auth-context", () => ({
  getProfileAuthContext: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import { getProfileAuthContext } from "../../src/common/utils/auth-context";
import {
  getMoverQuoteDetailController,
  getMoverQuotesController,
  getRejectedRequestsController,
} from "../../src/modules/mover-quote/mover-quote.controller";
import type {
  GetMoverQuotesQuery,
  GetRejectedRequestsQuery,
  MoverQuoteDetailDto,
  MoverQuoteListDto,
  RejectedRequestListDto,
} from "../../src/modules/mover-quote/mover-quote.dto";
import {
  getMoverQuoteDetail,
  getMoverQuotes,
  getRejectedRequests,
} from "../../src/modules/mover-quote/mover-quote.service";
import {
  parseGetMoverQuotesQuery,
  parseGetRejectedRequestsQuery,
  parseMoverQuoteId,
} from "../../src/modules/mover-quote/mover-quote.validator";

const MOVER_ID = "550e8400-e29b-41d4-a716-446655440000";

const QUOTE_ID = "550e8400-e29b-41d4-a716-446655440001";

function createResponse(): Response {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;

  jest.mocked(response.status).mockReturnValue(response);

  return response;
}

describe("Mover quote controller", () => {
  beforeEach(() => {
    jest.resetAllMocks();

    jest.mocked(getProfileAuthContext).mockReturnValue({
      userId: "550e8400-e29b-41d4-a716-446655440010",
      role: "MOVER",
      profileId: MOVER_ID,
    });
  });

  test("보낸 견적 목록에 profileId와 검증된 Query를 전달한다", async () => {
    const query: GetMoverQuotesQuery = {
      status: "CONFIRMED",
      cursor: undefined,
      limit: 10,
    };

    const result: MoverQuoteListDto = {
      items: [],
      pagination: {
        nextCursor: null,
        hasNext: false,
      },
    };

    jest.mocked(parseGetMoverQuotesQuery).mockReturnValue(query);

    jest.mocked(getMoverQuotes).mockResolvedValue(result);

    const request = {
      query: {
        status: "CONFIRMED",
        limit: "10",
      },
    } as unknown as Request;

    const response = createResponse();

    await getMoverQuotesController(
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(parseGetMoverQuotesQuery).toHaveBeenCalledWith(request.query);

    expect(getMoverQuotes).toHaveBeenCalledWith(MOVER_ID, query);

    expect(response.status).toHaveBeenCalledWith(200);

    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: result,
    });
  });

  test("견적 상세를 data.quote로 반환한다", async () => {
    const quote: MoverQuoteDetailDto = {
      quoteId: QUOTE_ID,
      requestId: "550e8400-e29b-41d4-a716-446655440020",
      customerName: "김인서",
      serviceType: "HOME",
      isDesignated: true,
      fromAddress: "서울특별시 중구 세종대로 110",
      toAddress: "경기도 수원시 팔달구 효원로 241",
      moveDate: "2026-09-20T01:00:00.000Z",
      requestedAt: "2026-09-13T03:00:00.000Z",
      price: 180000,
      comment: "안전하고 신속하게 이사를 진행해 드리겠습니다.",
      quoteStatus: "CONFIRMED",
      moveRequestStatus: "CONFIRMED",
    };

    jest.mocked(parseMoverQuoteId).mockReturnValue(QUOTE_ID);

    jest.mocked(getMoverQuoteDetail).mockResolvedValue(quote);

    const request = {
      params: {
        quoteId: QUOTE_ID,
      },
    } as unknown as Request;

    const response = createResponse();

    await getMoverQuoteDetailController(
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(parseMoverQuoteId).toHaveBeenCalledWith(QUOTE_ID);

    expect(getMoverQuoteDetail).toHaveBeenCalledWith(MOVER_ID, QUOTE_ID);

    expect(response.status).toHaveBeenCalledWith(200);

    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: {
        quote,
      },
    });
  });

  test("반려 요청 목록에 profileId와 검증된 Query를 전달한다", async () => {
    const query: GetRejectedRequestsQuery = {
      cursor: undefined,
      limit: 10,
    };

    const result: RejectedRequestListDto = {
      items: [],
      pagination: {
        nextCursor: null,
        hasNext: false,
      },
    };

    jest.mocked(parseGetRejectedRequestsQuery).mockReturnValue(query);

    jest.mocked(getRejectedRequests).mockResolvedValue(result);

    const request = {
      query: {
        limit: "10",
      },
    } as unknown as Request;

    const response = createResponse();

    await getRejectedRequestsController(
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(parseGetRejectedRequestsQuery).toHaveBeenCalledWith(request.query);

    expect(getRejectedRequests).toHaveBeenCalledWith(MOVER_ID, query);

    expect(response.status).toHaveBeenCalledWith(200);

    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: result,
    });
  });
});
