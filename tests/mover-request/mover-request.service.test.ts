/**
 * 받은 요청 Service가 Repository 결과를 API DTO로 변환하고
 * cursor pagination을 계산하는지 검증합니다.
 */
jest.mock("../../src/modules/mover-request/mover-request.repository", () => ({
  findReceivedRequests: jest.fn(),
  findReceivedRequestById: jest.fn(),
}));

import type { GetReceivedRequestsQuery } from "../../src/modules/mover-request/mover-request.dto";
import {
  findReceivedRequests,
  type ReceivedRequestRecord,
} from "../../src/modules/mover-request/mover-request.repository";
import { getReceivedRequests } from "../../src/modules/mover-request/mover-request.service";

const FIRST_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440001";
const SECOND_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440002";
const THIRD_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440003";

function createReceivedRequestRecord(
  id: string,
  designated = false,
): ReceivedRequestRecord {
  return {
    id,
    moveDate: new Date("2026-09-20T01:00:00.000Z"),
    fromAddress: "서울특별시 중구 세종대로 110",
    toAddress: "경기도 수원시 팔달구 효원로 241",
    status: "WAITING",
    createdAt: new Date("2026-09-14T03:00:00.000Z"),

    customer: {
      user: {
        name: "김인서",
      },
    },

    serviceType: {
      name: "HOME",
    },

    designatedRequests: designated
      ? [
          {
            id: "550e8400-e29b-41d4-a716-446655440010",
          },
        ]
      : [],
  };
}

const defaultQuery: GetReceivedRequestsQuery = {
  keyword: undefined,
  serviceType: undefined,
  isDesignated: undefined,
  sort: "REQUESTED_AT_DESC",
  cursor: undefined,
  limit: 2,
};

describe("Mover request service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("Repository 결과를 받은 요청 카드 DTO로 변환한다", async () => {
    jest
      .mocked(findReceivedRequests)
      .mockResolvedValue([createReceivedRequestRecord(FIRST_REQUEST_ID, true)]);

    const result = await getReceivedRequests(
      "550e8400-e29b-41d4-a716-446655440000",
      defaultQuery,
      new Date("2026-09-14T00:00:00.000Z"),
    );

    expect(result).toEqual({
      items: [
        {
          requestId: FIRST_REQUEST_ID,
          customerName: "김인서",
          serviceType: "HOME",
          isDesignated: true,
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
    });
  });

  test("limit보다 한 건 더 조회되면 다음 cursor를 반환한다", async () => {
    jest
      .mocked(findReceivedRequests)
      .mockResolvedValue([
        createReceivedRequestRecord(FIRST_REQUEST_ID),
        createReceivedRequestRecord(SECOND_REQUEST_ID),
        createReceivedRequestRecord(THIRD_REQUEST_ID),
      ]);

    const result = await getReceivedRequests(
      "550e8400-e29b-41d4-a716-446655440000",
      defaultQuery,
      new Date("2026-09-14T00:00:00.000Z"),
    );

    expect(result.items).toHaveLength(2);

    expect(result.pagination).toEqual({
      nextCursor: SECOND_REQUEST_ID,
      hasNext: true,
    });
  });

  test("Repository에 인증된 기사 ID와 조회 조건을 전달한다", async () => {
    jest.mocked(findReceivedRequests).mockResolvedValue([]);

    const moverId = "550e8400-e29b-41d4-a716-446655440000";
    const now = new Date("2026-09-14T00:00:00.000Z");

    await getReceivedRequests(moverId, defaultQuery, now);

    expect(findReceivedRequests).toHaveBeenCalledWith({
      moverId,
      now,
      ...defaultQuery,
    });
  });

  test("조회 결과가 없으면 빈 목록을 반환한다", async () => {
    jest.mocked(findReceivedRequests).mockResolvedValue([]);

    const result = await getReceivedRequests(
      "550e8400-e29b-41d4-a716-446655440000",
      defaultQuery,
      new Date("2026-09-14T00:00:00.000Z"),
    );

    expect(result).toEqual({
      items: [],
      pagination: {
        nextCursor: null,
        hasNext: false,
      },
    });
  });
});
