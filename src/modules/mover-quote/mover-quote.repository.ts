/**
 * 인증된 기사님의 견적과 반려 기록을 Prisma로 조회
 * HTTP 입력과 응답 DTO 변환은 담당하지 않고 DB 조회 조건과 select만 관리
 */

import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type {
  GetMoverQuotesQuery,
  GetRejectedRequestsQuery,
} from "./mover-quote.dto";

/** 보낸 견적 목록 Repository 입력 */
export interface FindMoverQuotesInput extends GetMoverQuotesQuery {
  moverId: string;
}

/** 견적 상세 Repository 입력 */
export interface FindMoverQuoteByInput {
  moverId: string;
  quoteId: string;
}

/** 반려 요청 목록 Repository 입력 */
export interface FindRejectedRequestsInput extends GetRejectedRequestsQuery {
  moverId: string;
}

/**
 * 견적 목록과 상세에 필요한 필드만 조회
 * 지정 견적 여부는 현재 기사님에게 연결된 DesignatedRequest 존재 여부로 계산
 */
function createMoverQuoteSelect(moverId: string) {
  return {
    id: true,
    price: true,
    comment: true,
    status: true,
    createdAt: true,

    moveRequest: {
      select: {
        id: true,
        moveDate: true,
        fromAddress: true,
        toAddress: true,
        status: true,
        createdAt: true,

        customer: {
          select: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },

        serviceType: {
          select: {
            name: true,
          },
        },

        designatedRequests: {
          where: {
            moverId,
          },
          select: {
            id: true,
          },
          take: 1,
        },
      },
    },
  } satisfies Prisma.QuoteSelect;
}

/**
 * 반려 요청 카드에 필요한 필드만 조회
 * 지정 요청 여부를 계산하기 위해 현재 기사님의 DesignatedRequest만 확인
 */
function createRejectedRequestSelect(moverId: string) {
  return {
    id: true,
    reason: true,
    createdAt: true,

    moveRequest: {
      select: {
        id: true,
        moveDate: true,
        fromAddress: true,
        toAddress: true,

        customer: {
          select: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },

        serviceType: {
          select: {
            name: true,
          },
        },

        designatedRequests: {
          where: {
            moverId,
          },
          select: {
            id: true,
          },
          take: 1,
        },
      },
    },
  } satisfies Prisma.RequestRejectionSelect;
}

export type MoverQuoteRecord = Prisma.QuoteGetPayload<{
  select: ReturnType<typeof createMoverQuoteSelect>;
}>;

export type RejectedRequestRecord = Prisma.RequestRejectionGetPayload<{
  select: ReturnType<typeof createRejectedRequestSelect>;
}>;

/**
 * 기사님이 보낸 견적을 최근 생성 순으로 조회
 *
 * @param input 인증된 moverId, 상태 필터, cursor, limit
 * @returns limit보다 한 건 더 조회한 견적 목록
 * @sideeffect PostgreSQL 읽기 쿼리 실행
 */
export async function findMoverQuotes(
  input: FindMoverQuotesInput,
): Promise<MoverQuoteRecord[]> {
  return prisma.quote.findMany({
    where: {
      moverId: input.moverId,

      ...(input.status
        ? {
            status: input.status,
          }
        : {}),
    },

    select: createMoverQuoteSelect(input.moverId),

    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],

    take: input.limit + 1,

    ...(input.cursor
      ? {
          cursor: {
            id: input.cursor,
          },
          skip: 1,
        }
      : {}),
  });
}

/**
 * 견적 ID와 인증된 기사 ID를 함께 사용해 견적 상세를 조회
 * 다른 기사님의 견적은 조회 결과에 포함하지 않음
 *
 * @param input 인증된 moverId와 조회할 quoteId
 * @returns 소유한 견적 또는 null
 * @sideeffect PostgreSQL 읽기 쿼리 실행
 */
export async function findMoverQuoteById(
  input: FindMoverQuoteByInput,
): Promise<MoverQuoteRecord | null> {
  return prisma.quote.findFirst({
    where: {
      id: input.quoteId,
      moverId: input.moverId,
    },

    select: createMoverQuoteSelect(input.moverId),
  });
}

/**
 * 기사님이 반려한 요청을 최근 반려 순으로 조회
 * Quote의 REJECTED 상태가 아니라 RequestRejection 테이블을 조회
 *
 * @param input 인증된 moverId, cursor, limit
 * @returns limit보다 한 건 더 조회한 반려 기록 목록
 * @sideeffect PostgreSQL 읽기 쿼리 실행
 */
export async function findRejectedRequests(
  input: FindRejectedRequestsInput,
): Promise<RejectedRequestRecord[]> {
  return prisma.requestRejection.findMany({
    where: {
      moverId: input.moverId,
    },

    select: createRejectedRequestSelect(input.moverId),

    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],

    take: input.limit + 1,

    ...(input.cursor
      ? {
          cursor: {
            id: input.cursor,
          },
          skip: 1,
        }
      : {}),
  });
}
