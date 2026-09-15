/**
 * Mover Quote Service의 DTO 변환, pagination, 상세 소유권 오류와
 * RequestRejection 변환을 Repository mock으로 검증합니다.
 */
jest.mock("../../src/modules/mover-quote/mover-quote.repository", () => ({
  findMoverQuotes: jest.fn(),
  findMoverQuoteById: jest.fn(),
  findRejectedRequests: jest.fn(),
}));

import {
  findMoverQuoteById,
  findMoverQuotes,
  findRejectedRequests,
  type MoverQuoteRecord,
  type RejectedRequestRecord,
} from "../../src/modules/mover-quote/mover-quote.repository";
import {
  getMoverQuoteDetail,
  getMoverQuotes,
  getRejectedRequests,
} from "../../src/modules/mover-quote/mover-quote.service";

const MOVER_ID = "550e8400-e29b-41d4-a716-446655440000";

const FIRST_QUOTE_ID = "550e8400-e29b-41d4-a716-446655440001";

const SECOND_QUOTE_ID = "550e8400-e29b-41d4-a716-446655440002";

const THIRD_QUOTE_ID = "550e8400-e29b-41d4-a716-446655440003";

function createMoverQuoteRecord(
  id: string,
  isDesignated = false,
): MoverQuoteRecord {
  return {
    id,
    price: 180000,
    comment: "안전하고 신속하게 이사를 진행해 드리겠습니다.",
    status: "CONFIRMED",
    createdAt: new Date("2026-09-14T03:00:00.000Z"),

    moveRequest: {
      id: "550e8400-e29b-41d4-a716-446655440010",
      moveDate: new Date("2026-09-20T01:00:00.000Z"),
      fromAddress: "서울특별시 중구 세종대로 110",
      toAddress: "경기도 수원시 팔달구 효원로 241",
      status: "CONFIRMED",
      createdAt: new Date("2026-09-13T03:00:00.000Z"),

      customer: {
        user: {
          name: "김인서",
        },
      },

      serviceType: {
        name: "HOME",
      },

      designatedRequests: isDesignated
        ? [
            {
              id: "550e8400-e29b-41d4-a716-446655440020",
            },
          ]
        : [],
    },
  };
}

function createRejectedRequestRecord(): RejectedRequestRecord {
  return {
    id: "550e8400-e29b-41d4-a716-446655440030",
    reason: "해당 날짜에는 기존 일정이 있어 진행하기 어렵습니다.",
    createdAt: new Date("2026-09-14T04:00:00.000Z"),

    moveRequest: {
      id: "550e8400-e29b-41d4-a716-446655440040",
      moveDate: new Date("2026-09-21T01:00:00.000Z"),
      fromAddress: "서울특별시 강남구 테헤란로 1",
      toAddress: "인천광역시 연수구 센트럴로 1",

      customer: {
        user: {
          name: "박무빙",
        },
      },

      serviceType: {
        name: "OFFICE",
      },

      designatedRequests: [],
    },
  };
}

describe("Mover quote service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("견적 레코드를 카드 DTO로 변환한다", async () => {
    jest
      .mocked(findMoverQuotes)
      .mockResolvedValue([createMoverQuoteRecord(FIRST_QUOTE_ID, true)]);

    const result = await getMoverQuotes(MOVER_ID, {
      status: undefined,
      cursor: undefined,
      limit: 10,
    });

    expect(result).toEqual({
      items: [
        {
          quoteId: FIRST_QUOTE_ID,
          customerName: "김인서",
          serviceType: "HOME",
          isDesignated: true,
          fromAddress: "서울특별시 중구 세종대로 110",
          toAddress: "경기도 수원시 팔달구 효원로 241",
          moveDate: "2026-09-20T01:00:00.000Z",
          price: 180000,
          quoteStatus: "CONFIRMED",
          moveRequestStatus: "CONFIRMED",
        },
      ],

      pagination: {
        nextCursor: null,
        hasNext: false,
      },
    });
  });

  test("limit보다 한 건 더 있으면 마지막 응답 견적을 cursor로 반환한다", async () => {
    jest
      .mocked(findMoverQuotes)
      .mockResolvedValue([
        createMoverQuoteRecord(FIRST_QUOTE_ID),
        createMoverQuoteRecord(SECOND_QUOTE_ID),
        createMoverQuoteRecord(THIRD_QUOTE_ID),
      ]);

    const result = await getMoverQuotes(MOVER_ID, {
      status: undefined,
      cursor: undefined,
      limit: 2,
    });

    expect(result.items).toHaveLength(2);

    expect(result.pagination).toEqual({
      nextCursor: SECOND_QUOTE_ID,
      hasNext: true,
    });
  });

  test("상태 필터를 Repository에 전달한다", async () => {
    jest.mocked(findMoverQuotes).mockResolvedValue([]);

    await getMoverQuotes(MOVER_ID, {
      status: "CONFIRMED",
      cursor: undefined,
      limit: 10,
    });

    expect(findMoverQuotes).toHaveBeenCalledWith({
      moverId: MOVER_ID,
      status: "CONFIRMED",
      cursor: undefined,
      limit: 10,
    });
  });

  test("소유한 견적 상세를 변환한다", async () => {
    jest
      .mocked(findMoverQuoteById)
      .mockResolvedValue(createMoverQuoteRecord(FIRST_QUOTE_ID, true));

    const result = await getMoverQuoteDetail(MOVER_ID, FIRST_QUOTE_ID);

    expect(result).toEqual(
      expect.objectContaining({
        quoteId: FIRST_QUOTE_ID,
        requestId: "550e8400-e29b-41d4-a716-446655440010",
        customerName: "김인서",
        requestedAt: "2026-09-13T03:00:00.000Z",
        comment: "안전하고 신속하게 이사를 진행해 드리겠습니다.",
      }),
    );
  });

  test("견적이 없거나 다른 기사님의 견적이면 404를 반환한다", async () => {
    jest.mocked(findMoverQuoteById).mockResolvedValue(null);

    await expect(
      getMoverQuoteDetail(MOVER_ID, FIRST_QUOTE_ID),
    ).rejects.toMatchObject({
      status: 404,
      code: "MOVER_QUOTE_NOT_FOUND",
    });
  });

  test("RequestRejection을 반려 요청 DTO로 변환한다", async () => {
    jest
      .mocked(findRejectedRequests)
      .mockResolvedValue([createRejectedRequestRecord()]);

    const result = await getRejectedRequests(MOVER_ID, {
      cursor: undefined,
      limit: 10,
    });

    expect(result).toEqual({
      items: [
        {
          rejectionId: "550e8400-e29b-41d4-a716-446655440030",
          requestId: "550e8400-e29b-41d4-a716-446655440040",
          customerName: "박무빙",
          serviceType: "OFFICE",
          isDesignated: false,
          fromAddress: "서울특별시 강남구 테헤란로 1",
          toAddress: "인천광역시 연수구 센트럴로 1",
          moveDate: "2026-09-21T01:00:00.000Z",
          reason: "해당 날짜에는 기존 일정이 있어 진행하기 어렵습니다.",
          rejectedAt: "2026-09-14T04:00:00.000Z",
        },
      ],

      pagination: {
        nextCursor: null,
        hasNext: false,
      },
    });
  });
});
