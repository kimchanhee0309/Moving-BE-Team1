/**
 * 받은 견적 목록 Service가 고객 profile 기준으로 매핑·페이지를 만드는지 검증합니다.
 * 실제 DB 대신 Repository를 mock하여 소유권 필터 전달과 DTO 변환만 확인합니다.
 */
jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback({}),
    ),
  },
}));

jest.mock("../../src/modules/customer-quote/customer-quote.repository", () => ({
  applyQuoteConfirmation: jest.fn(),
  createQuoteConfirmedNotifications: jest.fn(),
  findMoverReviewAverages: jest.fn(),
  findOwnedQuoteDetailAfterConfirm: jest.fn(),
  findOwnedQuoteForConfirm: jest.fn(),
  findReceivedQuoteDetail: jest.fn(),
  findReceivedQuoteHistory: jest.fn(),
  findReceivedQuoteHistoryDetail: jest.fn(),
  findReceivedQuotes: jest.fn(),
  lockMoveRequestForConfirm: jest.fn(),
}));

import {
  decodeReceivedQuoteCursor,
  decodeReceivedQuoteHistoryCursor,
} from "../../src/modules/customer-quote/customer-quote.cursor";
import {
  BadRequestError,
  NotFoundError,
} from "../../src/common/errors/app-error";
import type {
  OwnedQuoteForConfirm,
  ReceivedQuoteDetailRecord,
  ReceivedQuoteRecord,
} from "../../src/modules/customer-quote/customer-quote.repository";
import {
  applyQuoteConfirmation,
  createQuoteConfirmedNotifications,
  findMoverReviewAverages,
  findOwnedQuoteDetailAfterConfirm,
  findOwnedQuoteForConfirm,
  findReceivedQuoteDetail,
  findReceivedQuoteHistory,
  findReceivedQuoteHistoryDetail,
  findReceivedQuotes,
  lockMoveRequestForConfirm,
} from "../../src/modules/customer-quote/customer-quote.repository";
import {
  confirmReceivedQuote,
  getReceivedQuoteDetail,
  getReceivedQuoteHistoryDetail,
  listReceivedQuoteHistory,
  listReceivedQuotes,
} from "../../src/modules/customer-quote/customer-quote.service";
import { prisma } from "../../src/lib/prisma";

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
    updatedAt: new Date("2026-09-11T03:00:00.000Z"),
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
      createdAt: new Date("2026-09-10T02:00:00.000Z"),
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
            createdAt: "2026-09-10T02:00:00.000Z",
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
          createdAt: new Date("2026-09-10T02:00:00.000Z"),
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

function createDetailRecord(): ReceivedQuoteDetailRecord {
  const listRecord = createRecord();

  return {
    ...listRecord,
    updatedAt: new Date("2026-09-11T03:00:00.000Z"),
    mover: {
      ...listRecord.mover,
      description: "소형·가정이사 전문입니다.",
      serviceTypes: [
        { serviceType: { name: "SMALL" } },
        { serviceType: { name: "HOME" } },
      ],
      regions: [{ region: { name: "서울" } }, { region: { name: "경기" } }],
    },
  };
}

describe("getReceivedQuoteDetail", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("대기 견적 상세를 data.quote로 매핑한다", async () => {
    const record = createDetailRecord();
    jest.mocked(findReceivedQuoteDetail).mockResolvedValue(record);
    jest.mocked(findMoverReviewAverages).mockResolvedValue([
      { moverId: record.mover.id, averageRating: 4.8 },
    ]);

    const result = await getReceivedQuoteDetail(customerId, record.id);

    expect(findReceivedQuoteDetail).toHaveBeenCalledWith(customerId, record.id);
    expect(result.quote).toMatchObject({
      id: record.id,
      status: "PROPOSED",
      updatedAt: "2026-09-11T03:00:00.000Z",
      mover: {
        description: "소형·가정이사 전문입니다.",
        serviceTypes: ["SMALL", "HOME"],
        regions: ["서울", "경기"],
        averageRating: 4.8,
      },
    });
  });

  test("없거나 내 대기 견적이 아니면 QUOTE_NOT_FOUND를 던진다", async () => {
    jest.mocked(findReceivedQuoteDetail).mockResolvedValue(null);

    await expect(
      getReceivedQuoteDetail(customerId, "11111111-1111-4111-8111-111111111111"),
    ).rejects.toMatchObject({
      name: "AppError",
      code: "QUOTE_NOT_FOUND",
    });
    expect(findMoverReviewAverages).not.toHaveBeenCalled();
  });

  test("다른 고객 ID로는 조회하지 않는다", async () => {
    jest.mocked(findReceivedQuoteDetail).mockResolvedValue(null);

    await expect(
      getReceivedQuoteDetail(
        otherCustomerId,
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(findReceivedQuoteDetail).toHaveBeenCalledWith(
      otherCustomerId,
      "11111111-1111-4111-8111-111111111111",
    );
  });
});

describe("listReceivedQuoteHistory", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("확정 견적만 고객 ID로 조회하고 목록으로 매핑한다", async () => {
    const record = createRecord({
      status: "CONFIRMED",
      moveRequest: {
        id: "55555555-5555-4555-8555-555555555555",
        moveDate: new Date("2026-08-10T01:00:00.000Z"),
        fromAddress: "서울시 강남구",
        toAddress: "서울시 마포구",
        status: "COMPLETED",
        createdAt: new Date("2026-08-01T02:00:00.000Z"),
        serviceType: { name: "HOME" },
        designatedRequests: [],
      },
    });
    jest.mocked(findReceivedQuoteHistory).mockResolvedValue([record]);
    jest.mocked(findMoverReviewAverages).mockResolvedValue([]);

    const query = {
      sort: "UPDATED_AT_DESC" as const,
      limit: 10,
    };
    const result = await listReceivedQuoteHistory(customerId, query);

    expect(findReceivedQuoteHistory).toHaveBeenCalledWith(customerId, query);
    expect(result.items[0]?.status).toBe("CONFIRMED");
    expect(result.items[0]?.moveRequest.status).toBe("COMPLETED");
    expect(result.pagination.hasNext).toBe(false);
  });

  test("limit보다 많으면 history cursor로 다음 페이지를 이어간다", async () => {
    const first = createRecord({
      status: "CONFIRMED",
      updatedAt: new Date("2026-08-12T05:00:00.000Z"),
    });
    const second = createRecord({
      id: "44444444-4444-4444-8444-444444444444",
      status: "CONFIRMED",
      updatedAt: new Date("2026-08-11T05:00:00.000Z"),
    });
    const third = createRecord({
      id: "55555555-5555-4555-8555-555555555555",
      status: "CONFIRMED",
      updatedAt: new Date("2026-08-10T05:00:00.000Z"),
    });
    jest
      .mocked(findReceivedQuoteHistory)
      .mockResolvedValueOnce([first, second, third])
      .mockResolvedValueOnce([third]);
    jest.mocked(findMoverReviewAverages).mockResolvedValue([]);

    const firstPage = await listReceivedQuoteHistory(customerId, {
      sort: "UPDATED_AT_DESC",
      limit: 2,
    });

    expect(firstPage.items.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(firstPage.pagination.hasNext).toBe(true);

    const cursor = decodeReceivedQuoteHistoryCursor(
      firstPage.pagination.nextCursor ?? "",
      "UPDATED_AT_DESC",
    );
    expect(cursor.id).toBe(second.id);
    expect(cursor.updatedAt).toBe("2026-08-11T05:00:00.000Z");

    const secondPage = await listReceivedQuoteHistory(customerId, {
      sort: "UPDATED_AT_DESC",
      limit: 2,
      cursor,
    });

    expect(findReceivedQuoteHistory).toHaveBeenLastCalledWith(customerId, {
      sort: "UPDATED_AT_DESC",
      limit: 2,
      cursor,
    });
    expect(secondPage.items.map((item) => item.id)).toEqual([third.id]);
    expect(secondPage.pagination).toEqual({
      nextCursor: null,
      hasNext: false,
    });
  });
});

describe("getReceivedQuoteHistoryDetail", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("대기 견적이 아니면 QUOTE_NOT_FOUND를 던진다", async () => {
    jest.mocked(findReceivedQuoteHistoryDetail).mockResolvedValue(null);

    await expect(
      getReceivedQuoteHistoryDetail(
        customerId,
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toMatchObject({
      code: "QUOTE_NOT_FOUND",
    });
  });
});

function createOwnedQuote(
  overrides: Partial<OwnedQuoteForConfirm> = {},
): OwnedQuoteForConfirm {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    price: 150000,
    status: "PROPOSED",
    moverId: "22222222-2222-4222-8222-222222222222",
    mover: {
      userId: "mover-user-id",
      nickname: "김코드",
    },
    moveRequest: {
      id: "33333333-3333-4333-8333-333333333333",
      status: "WAITING",
      customer: {
        userId: "customer-user-id",
        user: { name: "홍길동" },
      },
    },
    ...overrides,
  };
}

describe("confirmReceivedQuote", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      (callback as unknown as (tx: object) => Promise<unknown>)({}),
    );
  });

  test("없거나 내 요청이 아니면 QUOTE_NOT_FOUND를 던진다", async () => {
    jest.mocked(findOwnedQuoteForConfirm).mockResolvedValue(null);

    await expect(
      confirmReceivedQuote(
        customerId,
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toMatchObject({
      code: "QUOTE_NOT_FOUND",
    });
    expect(lockMoveRequestForConfirm).not.toHaveBeenCalled();
  });

  test("PROPOSED가 아니면 QUOTE_NOT_CONFIRMABLE이다", async () => {
    const owned = createOwnedQuote({ status: "REJECTED" });
    jest.mocked(findOwnedQuoteForConfirm).mockResolvedValue(owned);

    await expect(confirmReceivedQuote(customerId, owned.id)).rejects.toMatchObject({
      code: "QUOTE_NOT_CONFIRMABLE",
    });
    expect(applyQuoteConfirmation).not.toHaveBeenCalled();
  });

  test("요청이 이미 확정·완료면 REQUEST_ALREADY_CONFIRMED이다", async () => {
    const owned = createOwnedQuote({
      moveRequest: {
        id: "33333333-3333-4333-8333-333333333333",
        status: "CONFIRMED",
        customer: {
          userId: "customer-user-id",
          user: { name: "홍길동" },
        },
      },
    });
    jest.mocked(findOwnedQuoteForConfirm).mockResolvedValue(owned);

    await expect(confirmReceivedQuote(customerId, owned.id)).rejects.toMatchObject({
      code: "REQUEST_ALREADY_CONFIRMED",
    });
    expect(applyQuoteConfirmation).not.toHaveBeenCalled();
  });

  test("금액이 없으면 INVALID_REQUEST다", async () => {
    const owned = createOwnedQuote({ price: null });
    jest.mocked(findOwnedQuoteForConfirm).mockResolvedValue(owned);

    await expect(confirmReceivedQuote(customerId, owned.id)).rejects.toBeInstanceOf(
      BadRequestError,
    );
    await expect(confirmReceivedQuote(customerId, owned.id)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(applyQuoteConfirmation).not.toHaveBeenCalled();
  });

  test("확정하면 경쟁 견적 반려·알림 생성 후 CONFIRMED 상세를 반환한다", async () => {
    const owned = createOwnedQuote();
    const confirmedDetail = {
      ...createDetailRecord(),
      status: "CONFIRMED" as const,
      moveRequest: {
        ...createDetailRecord().moveRequest,
        status: "CONFIRMED" as const,
      },
    };
    jest.mocked(findOwnedQuoteForConfirm).mockResolvedValue(owned);
    jest.mocked(lockMoveRequestForConfirm).mockResolvedValue(undefined);
    jest.mocked(applyQuoteConfirmation).mockResolvedValue(undefined);
    jest.mocked(createQuoteConfirmedNotifications).mockResolvedValue(undefined);
    jest.mocked(findOwnedQuoteDetailAfterConfirm).mockResolvedValue(confirmedDetail);
    jest.mocked(findMoverReviewAverages).mockResolvedValue([
      { moverId: owned.moverId, averageRating: 4.76 },
    ]);

    const result = await confirmReceivedQuote(customerId, owned.id);

    expect(lockMoveRequestForConfirm).toHaveBeenCalledWith(
      owned.moveRequest.id,
      {},
    );
    expect(applyQuoteConfirmation).toHaveBeenCalledWith(
      owned.id,
      owned.moveRequest.id,
      {},
    );
    expect(createQuoteConfirmedNotifications).toHaveBeenCalledWith(
      {
        customerUserId: "customer-user-id",
        customerName: "홍길동",
        moverUserId: "mover-user-id",
        moverNickname: "김코드",
        moveRequestId: owned.moveRequest.id,
        quoteId: owned.id,
      },
      {},
    );
    expect(result.quote.status).toBe("CONFIRMED");
    expect(result.quote.moveRequest.status).toBe("CONFIRMED");
    expect(result.quote.mover.averageRating).toBe(4.8);
  });
});
