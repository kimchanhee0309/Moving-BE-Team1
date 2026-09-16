/**
 * 고객 소유 대기·과거 견적 목록과 상세를 Prisma로 조회합니다.
 * HTTP·cookie는 다루지 않고 응답에 필요한 column과 집계만 선택합니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type {
  ReceivedQuoteHistoryQuery,
  ReceivedQuotesQuery,
} from "./customer-quote.dto";

function createReceivedQuoteSelect(customerId: string) {
  return {
    id: true,
    price: true,
    comment: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    moverId: true,
    mover: {
      select: {
        id: true,
        nickname: true,
        profileImageUrl: true,
        careerYears: true,
        shortIntroduction: true,
        _count: {
          select: {
            reviews: true,
            favorites: true,
          },
        },
        favorites: {
          where: { customerId },
          select: { id: true },
          take: 1,
        },
      },
    },
    moveRequest: {
      select: {
        id: true,
        moveDate: true,
        fromAddress: true,
        toAddress: true,
        status: true,
        serviceType: {
          select: { name: true },
        },
        designatedRequests: {
          select: { moverId: true },
        },
      },
    },
  } satisfies Prisma.QuoteSelect;
}

export type ReceivedQuoteRecord = Prisma.QuoteGetPayload<{
  select: ReturnType<typeof createReceivedQuoteSelect>;
}>;

function createReceivedQuoteDetailSelect(customerId: string) {
  return {
    ...createReceivedQuoteSelect(customerId),
    updatedAt: true,
    mover: {
      select: {
        ...createReceivedQuoteSelect(customerId).mover.select,
        description: true,
        serviceTypes: {
          select: {
            serviceType: {
              select: { name: true },
            },
          },
        },
        regions: {
          select: {
            region: {
              select: { name: true },
            },
          },
        },
      },
    },
  } satisfies Prisma.QuoteSelect;
}

export type ReceivedQuoteDetailRecord = Prisma.QuoteGetPayload<{
  select: ReturnType<typeof createReceivedQuoteDetailSelect>;
}>;

export interface MoverReviewAverage {
  moverId: string;
  averageRating: number | null;
}

function createCursorWhere(
  query: ReceivedQuotesQuery,
): Prisma.QuoteWhereInput | undefined {
  const cursor = query.cursor;

  if (!cursor) {
    return undefined;
  }

  // 키셋은 정렬 필드와 id를 함께 비교해야 같은 시각·같은 금액의 다음 행을 빠뜨리지 않습니다.
  if (query.sort === "CREATED_AT_DESC" && cursor.createdAt) {
    const createdAt = new Date(cursor.createdAt);

    return {
      OR: [
        { createdAt: { lt: createdAt } },
        { AND: [{ createdAt }, { id: { lt: cursor.id } }] },
      ],
    };
  }

  if (query.sort === "MOVE_DATE_ASC" && cursor.moveDate) {
    const moveDate = new Date(cursor.moveDate);

    return {
      OR: [
        { moveRequest: { moveDate: { gt: moveDate } } },
        {
          AND: [
            { moveRequest: { moveDate } },
            { id: { gt: cursor.id } },
          ],
        },
      ],
    };
  }

  if (query.sort === "PRICE_ASC") {
    if (cursor.price === null) {
      return {
        AND: [{ price: null }, { id: { gt: cursor.id } }],
      };
    }

    if (typeof cursor.price === "number") {
      return {
        OR: [
          { price: { gt: cursor.price } },
          { AND: [{ price: cursor.price }, { id: { gt: cursor.id } }] },
          { price: null },
        ],
      };
    }
  }

  return undefined;
}

function createOrderBy(
  sort: ReceivedQuotesQuery["sort"],
): Prisma.QuoteOrderByWithRelationInput[] {
  if (sort === "MOVE_DATE_ASC") {
    return [{ moveRequest: { moveDate: "asc" } }, { id: "asc" }];
  }

  if (sort === "PRICE_ASC") {
    return [{ price: "asc" }, { id: "asc" }];
  }

  return [{ createdAt: "desc" }, { id: "desc" }];
}

function createHistoryCursorWhere(
  query: ReceivedQuoteHistoryQuery,
): Prisma.QuoteWhereInput | undefined {
  const cursor = query.cursor;

  if (!cursor) {
    return undefined;
  }

  if (query.sort === "UPDATED_AT_DESC" && cursor.updatedAt) {
    const updatedAt = new Date(cursor.updatedAt);

    return {
      OR: [
        { updatedAt: { lt: updatedAt } },
        { AND: [{ updatedAt }, { id: { lt: cursor.id } }] },
      ],
    };
  }

  if (query.sort === "MOVE_DATE_DESC" && cursor.moveDate) {
    const moveDate = new Date(cursor.moveDate);

    return {
      OR: [
        { moveRequest: { moveDate: { lt: moveDate } } },
        {
          AND: [
            { moveRequest: { moveDate } },
            { id: { lt: cursor.id } },
          ],
        },
      ],
    };
  }

  return undefined;
}

function createHistoryOrderBy(
  sort: ReceivedQuoteHistoryQuery["sort"],
): Prisma.QuoteOrderByWithRelationInput[] {
  if (sort === "MOVE_DATE_DESC") {
    return [{ moveRequest: { moveDate: "desc" } }, { id: "desc" }];
  }

  return [{ updatedAt: "desc" }, { id: "desc" }];
}

/**
 * 지정 견적 여부는 (moveRequestId, moverId) 쌍으로만 판정합니다.
 * 요청에 지정 기사가 있다는 사실만으로는 다른 일반 견적이 지정으로 섞이지 않습니다.
 */
async function createDesignatedPairFilter(
  customerId: string,
  isDesignated: boolean | undefined,
): Promise<Prisma.QuoteWhereInput | undefined> {
  if (isDesignated === undefined) {
    return undefined;
  }

  const pairs = await prisma.designatedRequest.findMany({
    where: {
      moveRequest: {
        customerId,
        status: "WAITING",
      },
    },
    select: {
      moveRequestId: true,
      moverId: true,
    },
  });

  if (isDesignated) {
    if (pairs.length === 0) {
      return { id: { in: [] } };
    }

    return {
      OR: pairs.map((pair) => ({
        moveRequestId: pair.moveRequestId,
        moverId: pair.moverId,
      })),
    };
  }

  if (pairs.length === 0) {
    return undefined;
  }

  return {
    NOT: {
      OR: pairs.map((pair) => ({
        moveRequestId: pair.moveRequestId,
        moverId: pair.moverId,
      })),
    },
  };
}

/**
 * 로그인한 고객의 WAITING 요청에 달린 PROPOSED 견적을 limit+1개 조회합니다.
 * +1은 다음 페이지 존재 여부를 한 번의 조회로 확인하기 위함입니다.
 * @param customerId requireProfile이 보장한 Customer.id
 * @param query 검증된 필터·정렬·커서
 */
export async function findReceivedQuotes(
  customerId: string,
  query: ReceivedQuotesQuery,
): Promise<ReceivedQuoteRecord[]> {
  const designatedFilter = await createDesignatedPairFilter(
    customerId,
    query.isDesignated,
  );
  const cursorWhere = createCursorWhere(query);
  const extraFilters = [designatedFilter, cursorWhere].filter(
    (filter): filter is Prisma.QuoteWhereInput => filter !== undefined,
  );

  return prisma.quote.findMany({
    where: {
      status: "PROPOSED",
      moveRequest: {
        customerId,
        status: "WAITING",
        ...(query.serviceType
          ? { serviceType: { name: query.serviceType } }
          : {}),
      },
      ...(query.keyword
        ? {
            mover: {
              nickname: {
                contains: query.keyword,
                mode: "insensitive",
              },
            },
          }
        : {}),
      // OR 조건을 가진 지정 필터와 커서를 펼치면 한쪽이 덮어쓰이므로 AND로 결합합니다.
      ...(extraFilters.length > 0 ? { AND: extraFilters } : {}),
    },
    orderBy: createOrderBy(query.sort),
    take: query.limit + 1,
    select: createReceivedQuoteSelect(customerId),
  });
}

/**
 * 내 활성 요청의 대기 견적 1건을 조회합니다.
 * 없거나 소유하지 않거나 PROPOSED/WAITING이 아니면 null을 반환해 존재 여부를 구분하지 않습니다.
 * @param customerId requireProfile이 보장한 Customer.id
 * @param quoteId 검증된 Quote UUID
 */
export function findReceivedQuoteDetail(
  customerId: string,
  quoteId: string,
): Promise<ReceivedQuoteDetailRecord | null> {
  return prisma.quote.findFirst({
    where: {
      id: quoteId,
      status: "PROPOSED",
      moveRequest: {
        customerId,
        status: "WAITING",
      },
    },
    select: createReceivedQuoteDetailSelect(customerId),
  });
}

/**
 * 내가 확정한 과거 견적을 limit+1개 조회합니다.
 * Quote는 CONFIRMED만 포함하고 요청 상태는 CONFIRMED 또는 COMPLETED입니다.
 */
export async function findReceivedQuoteHistory(
  customerId: string,
  query: ReceivedQuoteHistoryQuery,
): Promise<ReceivedQuoteRecord[]> {
  const cursorWhere = createHistoryCursorWhere(query);
  const requestStatuses: Array<"CONFIRMED" | "COMPLETED"> =
    query.moveRequestStatus
      ? [query.moveRequestStatus]
      : ["CONFIRMED", "COMPLETED"];

  return prisma.quote.findMany({
    where: {
      status: "CONFIRMED",
      moveRequest: {
        customerId,
        status: { in: requestStatuses },
        ...(query.serviceType
          ? { serviceType: { name: query.serviceType } }
          : {}),
      },
      ...(query.keyword
        ? {
            mover: {
              nickname: {
                contains: query.keyword,
                mode: "insensitive",
              },
            },
          }
        : {}),
      ...(cursorWhere ? { AND: [cursorWhere] } : {}),
    },
    orderBy: createHistoryOrderBy(query.sort),
    take: query.limit + 1,
    select: createReceivedQuoteSelect(customerId),
  });
}

/**
 * 내가 확정한 과거 견적 1건을 조회합니다.
 * 대기 견적이거나 내 요청이 아니면 null을 반환해 존재 여부를 구분하지 않습니다.
 */
export function findReceivedQuoteHistoryDetail(
  customerId: string,
  quoteId: string,
): Promise<ReceivedQuoteDetailRecord | null> {
  return prisma.quote.findFirst({
    where: {
      id: quoteId,
      status: "CONFIRMED",
      moveRequest: {
        customerId,
        status: { in: ["CONFIRMED", "COMPLETED"] },
      },
    },
    select: createReceivedQuoteDetailSelect(customerId),
  });
}

/**
 * 목록에 나온 기사님의 평균 별점만 모아 조회합니다.
 * 리뷰가 없는 기사님은 결과에 없으며 Service가 null로 채웁니다.
 */
export async function findMoverReviewAverages(
  moverIds: string[],
): Promise<MoverReviewAverage[]> {
  if (moverIds.length === 0) {
    return [];
  }

  const grouped = await prisma.review.groupBy({
    by: ["moverId"],
    where: { moverId: { in: moverIds } },
    _avg: { rating: true },
  });

  return grouped.map((row) => ({
    moverId: row.moverId,
    averageRating: row._avg.rating,
  }));
}
