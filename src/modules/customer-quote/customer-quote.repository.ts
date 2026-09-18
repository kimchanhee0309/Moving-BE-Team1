/**
 * 고객 소유 대기·과거 견적 조회와 견적 확정 쓰기를 Prisma로 처리합니다.
 * HTTP·cookie는 다루지 않고 응답에 필요한 column과 집계만 선택합니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import type { MoveRequestStatus, QuoteStatus } from "../../generated/prisma/enums";
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
        createdAt: true,
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

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

/**
 * 확정 전 소유권·상태 검사를 위한 최소 조회입니다.
 * 다른 고객 견적은 제외하고 Quote 상태는 걸지 않아 404와 409를 구분합니다.
 */
const ownedQuoteForConfirmSelect = {
  id: true,
  price: true,
  status: true,
  moverId: true,
  mover: {
    select: {
      userId: true,
      nickname: true,
    },
  },
  moveRequest: {
    select: {
      id: true,
      status: true,
      customer: {
        select: {
          userId: true,
          user: {
            select: { name: true },
          },
        },
      },
    },
  },
} satisfies Prisma.QuoteSelect;

export type OwnedQuoteForConfirm = Prisma.QuoteGetPayload<{
  select: typeof ownedQuoteForConfirmSelect;
}>;

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

/**
 * 내 요청에 속한 견적 1건을 상태와 무관하게 조회합니다.
 * 없으면 null을 반환해 다른 고객 견적과 존재 여부를 구분하지 않습니다.
 */
export function findOwnedQuoteForConfirm(
  customerId: string,
  quoteId: string,
  client: PrismaClientOrTx = prisma,
): Promise<OwnedQuoteForConfirm | null> {
  return client.quote.findFirst({
    where: {
      id: quoteId,
      moveRequest: { customerId },
    },
    select: ownedQuoteForConfirmSelect,
  });
}

/**
 * 같은 요청에 대한 동시 확정을 직렬화하려고 MoveRequest 행을 FOR UPDATE로 잠급니다.
 * 잠금은 transaction 안에서만 의미가 있으므로 tx로만 호출해야 합니다.
 */
export async function lockMoveRequestForConfirm(
  moveRequestId: string,
  client: Prisma.TransactionClient,
): Promise<void> {
  await client.$queryRaw`
    SELECT id FROM "MoveRequest" WHERE id = ${moveRequestId} FOR UPDATE
  `;
}

/**
 * 대상 견적을 CONFIRMED로 바꾸고 같은 요청의 다른 PROPOSED 견적은 REJECTED로 바꿉니다.
 * 요청 상태는 WAITING → CONFIRMED입니다.
 */
export async function applyQuoteConfirmation(
  quoteId: string,
  moveRequestId: string,
  client: Prisma.TransactionClient,
): Promise<void> {
  await client.quote.update({
    where: { id: quoteId },
    data: { status: "CONFIRMED" satisfies QuoteStatus },
  });

  await client.quote.updateMany({
    where: {
      moveRequestId,
      id: { not: quoteId },
      status: "PROPOSED",
    },
    data: { status: "REJECTED" satisfies QuoteStatus },
  });

  await client.moveRequest.update({
    where: { id: moveRequestId },
    data: { status: "CONFIRMED" satisfies MoveRequestStatus },
  });
}

/**
 * 고객과 확정된 기사님에게 QUOTE_CONFIRMED 알림을 같은 트랜잭션에서 만듭니다.
 * 문구는 seed의 확정 알림과 같게 맞춰 화면이 다른 카피를 받지 않게 합니다.
 */
export async function createQuoteConfirmedNotifications(
  input: {
    customerUserId: string;
    customerName: string;
    moverUserId: string;
    moverNickname: string;
    moveRequestId: string;
    quoteId: string;
  },
  client: Prisma.TransactionClient,
): Promise<void> {
  await client.notification.createMany({
    data: [
      {
        userId: input.customerUserId,
        moveRequestId: input.moveRequestId,
        quoteId: input.quoteId,
        type: "QUOTE_CONFIRMED",
        title: "견적이 확정되었습니다.",
        content: `${input.moverNickname} 기사님의 견적이 확정되었습니다.`,
      },
      {
        userId: input.moverUserId,
        moveRequestId: input.moveRequestId,
        quoteId: input.quoteId,
        type: "QUOTE_CONFIRMED",
        title: "고객님이 견적을 확정했습니다.",
        content: `${input.customerName} 고객님이 견적을 확정했습니다.`,
      },
    ],
  });
}

/**
 * 확정 직후 상세 응답용 견적을 다시 조회합니다.
 * 트랜잭션 안에서 호출하면 방금 바꾼 CONFIRMED 상태를 읽습니다.
 */
export function findOwnedQuoteDetailAfterConfirm(
  customerId: string,
  quoteId: string,
  client: PrismaClientOrTx = prisma,
): Promise<ReceivedQuoteDetailRecord | null> {
  return client.quote.findFirst({
    where: {
      id: quoteId,
      moveRequest: { customerId },
    },
    select: createReceivedQuoteDetailSelect(customerId),
  });
}
