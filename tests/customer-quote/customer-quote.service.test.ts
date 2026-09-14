/**
 * 받은 견적 목록 Service가 고객 profile 기준으로 매핑·페이지를 만드는지 검증합니다.
 * 실제 DB 대신 Repository를 mock하여 소유권 필터 전달과 DTO 변환만 확인합니다.
 */
jest.mock("../../src/modules/customer-quote/customer-quote.repository", () => ({
  findMoverReviewAverages: jest.fn(),
  findReceivedQuotes: jest.fn(),
}));

import { decodeReceivedQuoteCursor } from "../../src/modules/customer-quote/customer-quote.cursor";
import type { ReceivedQuoteRecord } from "../../src/modules/customer-quote/customer-quote.repository";
import {
  findMoverReviewAverages,
  findReceivedQuotes,
} from "../../src/modules/customer-quote/customer-quote.repository";
import { listReceivedQuotes } from "../../src/modules/customer-quote/customer-quote.service";

const customerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherCustomerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createRecord(
  overrides: Partial<ReceivedQuoteRecord> = {},
): ReceivedQuoteRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    price: 150000,
    comment: "안전하게 이사를 도와드리겠습니다.",
    status: "PROPOSED",
    createdAt: new Date("2026-09-11T03:00:00.000Z"),
    moverId: "22222222-2222-4222-8222-222222222222",
    mover: {
      id: "22222222-2222-4222-8222-222222222222",
      nickname: "김코드",
      profileImageUrl: "https://cdn.example.com/movers/kim.png",
      careerYears: 7,
      shortIntroduction: "안전하고 빠른 이사",
      _count: {
        reviews: 128,
        favorites: 56,
      },
      favorites: [{ id: "favorite-id" }],
    },
    moveRequest: {
      id: "33333333-3333-4333-8333-333333333333",
      moveDate: new Date("2026-09-20T01:00:00.000Z"),
      fromAddress: "서울시 중구",
      toAddress: "경기도 수원시",
      status: "WAITING",
      serviceType: { name: "SMALL" },
      designatedRequests: [{ moverId: "22222222-2222-4222-8222-222222222222" }],
    },
    ...overrides,
  };
}

describe("listReceivedQuotes", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("대기 견적 카드를 data.items 형식으로 매핑한다", async () => {
    jest.mocked(findReceivedQuotes).mockResolvedValue([createRecord()]);
    jest.mocked(findMoverReviewAverages).mockResolvedValue([
      { moverId: "22222222-2222-4222-8222-222222222222", averageRating: 4.76 },
    ]);

    const result = await listReceivedQuotes(customerId, {
      sort: "CREATED_AT_DESC",
      limit: 10,
    });

    expect(findReceivedQuotes).toHaveBeenCalledWith(customerId, {
      sort: "CREATED_AT_DESC",
      limit: 10,
    });
    expect(findReceivedQuotes).not.toHaveBeenCalledWith(
      otherCustomerId,
      expect.anything(),
    );
    expect(result).toEqual({
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          price: 150000,
          comment: "안전하게 이사를 도와드리겠습니다.",
          status: "PROPOSED",
          isDesignated: true,
          createdAt: "2026-09-11T03:00:00.000Z",
          mover: {
            id: "22222222-2222-4222-8222-222222222222",
            nickname: "김코드",
            profileImageUrl: "https://cdn.example.com/movers/kim.png",
            careerYears: 7,
            shortIntroduction: "안전하고 빠른 이사",
            reviewCount: 128,
            averageRating: 4.8,
            favoriteCount: 56,
            isFavorite: true,
          },
          moveRequest: {
            id: "33333333-3333-4333-8333-333333333333",
            serviceType: "SMALL",
            moveDate: "2026-09-20T01:00:00.000Z",
            fromAddress: "서울시 중구",
            toAddress: "경기도 수원시",
            status: "WAITING",
          },
        },
      ],
      pagination: {
        nextCursor: null,
        hasNext: false,
      },
    });
  });

  test("지정 요청이 다른 기사님에게만 있으면 isDesignated는 false다", async () => {
    jest.mocked(findReceivedQuotes).mockResolvedValue([
      createRecord({
        moveRequest: {
          id: "33333333-3333-4333-8333-333333333333",
          moveDate: new Date("2026-09-20T01:00:00.000Z"),
          fromAddress: "서울시 중구",
          toAddress: "경기도 수원시",
          status: "WAITING",
          serviceType: { name: "SMALL" },
          designatedRequests: [{ moverId: "99999999-9999-4999-8999-999999999999" }],
        },
        mover: {
          id: "22222222-2222-4222-8222-222222222222",
          nickname: "김코드",
          profileImageUrl: null,
          careerYears: 7,
          shortIntroduction: "안전하고 빠른 이사",
          _count: { reviews: 0, favorites: 0 },
          favorites: [],
        },
      }),
    ]);
    jest.mocked(findMoverReviewAverages).mockResolvedValue([]);

    const result = await listReceivedQuotes(customerId, {
      sort: "CREATED_AT_DESC",
      limit: 10,
    });

    expect(result.items[0]?.isDesignated).toBe(false);
    expect(result.items[0]?.mover.averageRating).toBeNull();
    expect(result.items[0]?.mover.isFavorite).toBe(false);
  });

  test("limit보다 많이 조회되면 다음 cursor를 만든다", async () => {
    const first = createRecord();
    const second = createRecord({
      id: "44444444-4444-4444-8444-444444444444",
      createdAt: new Date("2026-09-10T03:00:00.000Z"),
    });
    jest.mocked(findReceivedQuotes).mockResolvedValue([first, second]);
    jest.mocked(findMoverReviewAverages).mockResolvedValue([]);

    const result = await listReceivedQuotes(customerId, {
      sort: "CREATED_AT_DESC",
      limit: 1,
    });

    expect(result.items).toHaveLength(1);
    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.nextCursor).toEqual(expect.any(String));

    const cursor = decodeReceivedQuoteCursor(
      result.pagination.nextCursor ?? "",
      "CREATED_AT_DESC",
    );
    expect(cursor.id).toBe(first.id);
    expect(cursor.createdAt).toBe("2026-09-11T03:00:00.000Z");
  });

  test("결과가 없으면 빈 목록과 hasNext false를 반환한다", async () => {
    jest.mocked(findReceivedQuotes).mockResolvedValue([]);
    jest.mocked(findMoverReviewAverages).mockResolvedValue([]);

    const result = await listReceivedQuotes(customerId, {
      sort: "CREATED_AT_DESC",
      limit: 10,
    });

    expect(result).toEqual({
      items: [],
      pagination: { nextCursor: null, hasNext: false },
    });
    expect(findMoverReviewAverages).toHaveBeenCalledWith([]);
  });
});
