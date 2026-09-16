/**
 * Mover Quote Repository가 인증된 기사님의 데이터만 조회하도록
 * Prisma where, cursor, status 필터를 구성하는지 검증합니다.
 */
const mockQuoteFindMany = jest.fn();
const mockQuoteFindFirst = jest.fn();
const mockRequestRejectionFindMany = jest.fn();

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    quote: {
      findMany: (...args: unknown[]) => mockQuoteFindMany(...args),
      findFirst: (...args: unknown[]) => mockQuoteFindFirst(...args),
    },

    requestRejection: {
      findMany: (...args: unknown[]) => mockRequestRejectionFindMany(...args),
    },
  },
}));

import {
  findMoverQuoteById,
  findMoverQuotes,
  findRejectedRequests,
} from "../../src/modules/mover-quote/mover-quote.repository";

const MOVER_ID = "550e8400-e29b-41d4-a716-446655440000";

const QUOTE_ID = "550e8400-e29b-41d4-a716-446655440001";

const CURSOR_ID = "550e8400-e29b-41d4-a716-446655440002";

describe("Mover quote repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockQuoteFindMany.mockResolvedValue([]);
    mockQuoteFindFirst.mockResolvedValue(null);
    mockRequestRejectionFindMany.mockResolvedValue([]);
  });

  test("인증된 기사님의 모든 보낸 견적을 조회한다", async () => {
    await findMoverQuotes({
      moverId: MOVER_ID,
      status: undefined,
      cursor: undefined,
      limit: 10,
    });

    expect(mockQuoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          moverId: MOVER_ID,
        },

        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],

        take: 11,
      }),
    );

    expect(mockQuoteFindMany.mock.calls[0]?.[0]).not.toHaveProperty("cursor");

    expect(mockQuoteFindMany.mock.calls[0]?.[0]).not.toHaveProperty("skip");
  });

  test("CONFIRMED 견적 필터를 적용한다", async () => {
    await findMoverQuotes({
      moverId: MOVER_ID,
      status: "CONFIRMED",
      cursor: undefined,
      limit: 10,
    });

    expect(mockQuoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          moverId: MOVER_ID,
          status: "CONFIRMED",
        },
      }),
    );
  });

  test("cursor 이후의 견적을 조회한다", async () => {
    await findMoverQuotes({
      moverId: MOVER_ID,
      status: undefined,
      cursor: CURSOR_ID,
      limit: 5,
    });

    expect(mockQuoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: {
          id: CURSOR_ID,
        },
        skip: 1,
        take: 6,
      }),
    );
  });

  test("견적 상세는 quoteId와 moverId를 함께 검사한다", async () => {
    await findMoverQuoteById({
      moverId: MOVER_ID,
      quoteId: QUOTE_ID,
    });

    expect(mockQuoteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: QUOTE_ID,
          moverId: MOVER_ID,
        },
      }),
    );
  });

  test("반려 목록은 RequestRejection에서 현재 기사님 기록만 조회한다", async () => {
    await findRejectedRequests({
      moverId: MOVER_ID,
      cursor: undefined,
      limit: 10,
    });

    expect(mockRequestRejectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          moverId: MOVER_ID,
        },

        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],

        take: 11,
      }),
    );
  });
});
