/**
 * 받은 요청 Controller가 인증된 기사님의 profileId와
 * 검증된 Query를 Service에 전달하고 공통 응답을 반환하는지 검증합니다.
 */
jest.mock("../../src/modules/mover-request/mover-request.validator", () => ({
  parseGetReceivedRequestsQuery: jest.fn(),
  parseReceivedRequestId: jest.fn(),
}));

jest.mock("../../src/modules/mover-request/mover-request.service", () => ({
  getReceivedRequests: jest.fn(),
  getReceivedRequestDetail: jest.fn(),
}));

jest.mock("../../src/common/utils/auth-context", () => ({
  getProfileAuthContext: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import { getProfileAuthContext } from "../../src/common/utils/auth-context";
import type {
  GetReceivedRequestsQuery,
  ReceivedRequestListDto,
} from "../../src/modules/mover-request/mover-request.dto";
import { getReceivedRequestsController } from "../../src/modules/mover-request/mover-request.controller";
import { getReceivedRequests } from "../../src/modules/mover-request/mover-request.service";
import { parseGetReceivedRequestsQuery } from "../../src/modules/mover-request/mover-request.validator";

function createResponse(): Response {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;

  jest.mocked(response.status).mockReturnValue(response);

  return response;
}

describe("Mover request controller", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("인증된 기사님의 profileId와 검증된 Query를 Service에 전달한다", async () => {
    const query: GetReceivedRequestsQuery = {
      keyword: "김인서",
      serviceType: "HOME",
      isDesignated: false,
      sort: "MOVE_DATE_ASC",
      cursor: undefined,
      limit: 10,
    };

    const result: ReceivedRequestListDto = {
      items: [
        {
          requestId: "550e8400-e29b-41d4-a716-446655440001",
          customerName: "김인서",
          serviceType: "HOME",
          isDesignated: false,
          moveDate: "2026-09-20T01:00:00.000Z",
          fromAddress: "서울특별시 중구 세종대로 110",
          toAddress: "경기도 수원시 팔달구 효원로 241",
          requestedAt: "2026-09-14T03:00:00.000Z",
        },
      ],

      pagination: {
        nextCursor: null,
        hasNext: false,
      },
    };

    jest.mocked(getProfileAuthContext).mockReturnValue({
      userId: "550e8400-e29b-41d4-a716-446655440010",
      role: "MOVER",
      profileId: "550e8400-e29b-41d4-a716-446655440020",
    });

    jest.mocked(parseGetReceivedRequestsQuery).mockReturnValue(query);
    jest.mocked(getReceivedRequests).mockResolvedValue(result);

    const request = {
      query: {
        keyword: "김인서",
        serviceType: "HOME",
        isDesignated: "false",
        sort: "MOVE_DATE_ASC",
        limit: "10",
      },
    } as unknown as Request;

    const response = createResponse();

    await getReceivedRequestsController(
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(parseGetReceivedRequestsQuery).toHaveBeenCalledWith(request.query);

    expect(getReceivedRequests).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440020",
      query,
    );

    expect(response.status).toHaveBeenCalledWith(200);

    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: result,
    });
  });

  test("목록이 비어 있어도 공통 성공 응답을 반환한다", async () => {
    const query: GetReceivedRequestsQuery = {
      keyword: undefined,
      serviceType: undefined,
      isDesignated: undefined,
      sort: "REQUESTED_AT_DESC",
      cursor: undefined,
      limit: 10,
    };

    const result: ReceivedRequestListDto = {
      items: [],
      pagination: {
        nextCursor: null,
        hasNext: false,
      },
    };

    jest.mocked(getProfileAuthContext).mockReturnValue({
      userId: "550e8400-e29b-41d4-a716-446655440010",
      role: "MOVER",
      profileId: "550e8400-e29b-41d4-a716-446655440020",
    });

    jest.mocked(parseGetReceivedRequestsQuery).mockReturnValue(query);
    jest.mocked(getReceivedRequests).mockResolvedValue(result);

    const request = {
      query: {},
    } as Request;

    const response = createResponse();

    await getReceivedRequestsController(
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(response.status).toHaveBeenCalledWith(200);

    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: {
        items: [],
        pagination: {
          nextCursor: null,
          hasNext: false,
        },
      },
    });
  });
});
