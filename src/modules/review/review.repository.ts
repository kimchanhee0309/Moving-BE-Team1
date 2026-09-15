/**
 * Review Service가 필요한 Prisma 조회·생성만 수행합니다.
 * HTTP 객체와 권한 판단은 받지 않으며, 목록은 N+1을 피하도록 관계와 집계를 한 번에 가져옵니다.
 *
 * 담당하지 않는 범위: 역할 검사, DTO 조립, cookie/token 처리
 */

import type { Prisma } from "../../generated/prisma/client";
import { MoveRequestStatus, QuoteStatus } from "../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";

const moverCardSelect = {
  id: true,
  nickname: true,
  profileImageUrl: true,
} satisfies Prisma.MoverSelect;

const customerCardSelect = {
  id: true,
  profileImageUrl: true,
  user: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.CustomerSelect;

const moveRequestCardSelect = {
  id: true,
  moveDate: true,
  fromAddress: true,
  toAddress: true,
  serviceType: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.MoveRequestSelect;

/** 작성 응답과 고객 WRITTEN 목록에 필요한 리뷰·기사님·요청 요약입니다. */
const writtenReviewSelect = {
  id: true,
  moveRequestId: true,
  moverId: true,
  rating: true,
  content: true,
  createdAt: true,
  mover: {
    select: moverCardSelect,
  },
  moveRequest: {
    select: moveRequestCardSelect,
  },
} satisfies Prisma.ReviewSelect;

/** 공개/기사님 받은 리뷰에는 고객 주소가 필요 없어 서비스 유형만 붙입니다. */
const receivedReviewSelect = {
  id: true,
  rating: true,
  content: true,
  createdAt: true,
  customer: {
    select: customerCardSelect,
  },
  moveRequest: {
    select: {
      serviceType: {
        select: {
          name: true,
        },
      },
    },
  },
} satisfies Prisma.ReviewSelect;

/**
 * CONFIRMED가 둘 이상이면 최신 1건만 고릅니다.
 * Quote unique는 (moveRequestId, moverId)라서, 확정 트랜잭션이 깨져도 리뷰 대상이 요청마다 바뀌지 않게 합니다.
 */
const confirmedQuoteOrderBy = [
  { createdAt: "desc" },
  { id: "desc" },
] as const satisfies Prisma.QuoteOrderByWithRelationInput[];

/** 작성 가능 목록은 Review가 없으므로 완료 요청과 확정 견적의 기사님만 가져옵니다. */
const writableMoveRequestSelect = {
  ...moveRequestCardSelect,
  quotes: {
    where: {
      status: QuoteStatus.CONFIRMED,
    },
    orderBy: confirmedQuoteOrderBy,
    take: 1,
    select: {
      mover: {
        select: moverCardSelect,
      },
    },
  },
} satisfies Prisma.MoveRequestSelect;

/** 리뷰 작성 전에 소유권·완료 상태·확정 기사님·기존 리뷰를 한 번에 확인합니다. */
const moveRequestForCreateSelect = {
  id: true,
  customerId: true,
  status: true,
  review: {
    select: {
      id: true,
    },
  },
  quotes: {
    where: {
      status: QuoteStatus.CONFIRMED,
    },
    orderBy: confirmedQuoteOrderBy,
    take: 1,
    select: {
      moverId: true,
    },
  },
} satisfies Prisma.MoveRequestSelect;

/**
 * 작성 가능 목록의 count와 findMany가 서로 다른 조건을 쓰지 않도록 한 객체로 고정합니다.
 * 조건이 갈라지면 pagination.totalCount와 items 길이가 어긋납니다.
 */
function writableMoveRequestWhere(customerId: string): Prisma.MoveRequestWhereInput {
  return {
    customerId,
    status: MoveRequestStatus.COMPLETED,
    review: null,
    quotes: {
      some: {
        status: QuoteStatus.CONFIRMED,
      },
    },
  };
}

export type WrittenReviewRecord = Prisma.ReviewGetPayload<{
  select: typeof writtenReviewSelect;
}>;

export type ReceivedReviewRecord = Prisma.ReviewGetPayload<{
  select: typeof receivedReviewSelect;
}>;

export type WritableMoveRequestRecord = Prisma.MoveRequestGetPayload<{
  select: typeof writableMoveRequestSelect;
}>;

export type MoveRequestForCreateRecord = Prisma.MoveRequestGetPayload<{
  select: typeof moveRequestForCreateSelect;
}>;

export interface MoverReviewStats {
  reviewCount: number;
  averageRating: number | null;
}

/** Prisma AVG 결과를 JS number로 바꿉니다. 리뷰가 없으면 null입니다. */
function toNullableAverage(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Number(value);
}

/**
 * 리뷰 대상 기사님이 실제로 존재하는지 확인합니다.
 * 없는 moverId로 공개 목록을 비워 주면 삭제된 프로필과 리뷰 없음이 구분되지 않습니다.
 */
export function findMoverId(moverId: string): Promise<{ id: string } | null> {
  return prisma.mover.findUnique({
    where: { id: moverId },
    select: { id: true },
  });
}

/**
 * 리뷰 작성에 필요한 이사 요청 상태와 확정 견적만 조회합니다.
 * 다른 고객 요청인지는 Service가 customerId를 비교해 404로 숨깁니다.
 */
export function findMoveRequestForCreate(
  moveRequestId: string,
): Promise<MoveRequestForCreateRecord | null> {
  return prisma.moveRequest.findUnique({
    where: { id: moveRequestId },
    select: moveRequestForCreateSelect,
  });
}

/**
 * 리뷰를 생성하고 고객 화면에 필요한 기사님·요청 요약을 함께 반환합니다.
 * 동시 작성이 unique moveRequestId를 어기면 Prisma P2002가 나며 Service가 409로 변환합니다.
 */
export function createReviewRecord(input: {
  customerId: string;
  moveRequestId: string;
  moverId: string;
  rating: number;
  content: string;
}): Promise<WrittenReviewRecord> {
  return prisma.review.create({
    data: input,
    select: writtenReviewSelect,
  });
}

/**
 * 고객이 이미 쓴 리뷰를 최신순으로 페이지 조회합니다.
 * 다른 고객 리뷰는 where.customerId로 제외합니다.
 */
export function findWrittenReviewsByCustomer(
  customerId: string,
  skip: number,
  take: number,
): Promise<WrittenReviewRecord[]> {
  return prisma.review.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: writtenReviewSelect,
  });
}

/**
 * 작성한 리뷰 목록 pagination의 totalCount를 계산합니다.
 * findWrittenReviewsByCustomer와 같은 customerId 조건을 써야 페이지 수가 맞습니다.
 */
export function countWrittenReviewsByCustomer(customerId: string): Promise<number> {
  return prisma.review.count({
    where: { customerId },
  });
}

/**
 * 완료됐지만 아직 리뷰가 없는 본인 요청만 조회합니다.
 * 확정 견적이 있어야 대상 기사님을 알 수 있어 CONFIRMED Quote를 함께 가져옵니다.
 */
export function findWritableMoveRequestsByCustomer(
  customerId: string,
  skip: number,
  take: number,
): Promise<WritableMoveRequestRecord[]> {
  return prisma.moveRequest.findMany({
    where: writableMoveRequestWhere(customerId),
    orderBy: [{ moveDate: "desc" }, { createdAt: "desc" }],
    skip,
    take,
    select: writableMoveRequestSelect,
  });
}

/**
 * 작성 가능 목록 pagination의 totalCount를 계산합니다.
 * findWritableMoveRequestsByCustomer와 같은 where를 써서 items와 건수가 어긋나지 않게 합니다.
 */
export function countWritableMoveRequestsByCustomer(
  customerId: string,
): Promise<number> {
  return prisma.moveRequest.count({
    where: writableMoveRequestWhere(customerId),
  });
}

/**
 * 특정 기사님이 받은 리뷰를 최신순으로 페이지 조회합니다.
 * 고객 주소는 공개 목록에 넣지 않도록 select에서 제외합니다.
 */
export function findReceivedReviewsByMover(
  moverId: string,
  skip: number,
  take: number,
): Promise<ReceivedReviewRecord[]> {
  return prisma.review.findMany({
    where: { moverId },
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: receivedReviewSelect,
  });
}

/**
 * 기사님 받은 리뷰의 COUNT/AVG만 DB에서 집계합니다.
 * 개별 Review 행을 모두 읽어 평균을 내면 목록 페이지와 무관하게 비용이 커집니다.
 */
export async function aggregateMoverReviewStats(
  moverId: string,
): Promise<MoverReviewStats> {
  const stats = await prisma.review.aggregate({
    where: { moverId },
    _count: {
      _all: true,
    },
    _avg: {
      rating: true,
    },
  });

  return {
    reviewCount: stats._count._all,
    averageRating: toNullableAverage(stats._avg.rating),
  };
}
