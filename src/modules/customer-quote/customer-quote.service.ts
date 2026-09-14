/**
 * 고객이 받은 대기 견적 목록의 조회 범위와 응답 매핑을 담당합니다.
 * 다른 고객 견적, 반려·확정 견적, 과거 요청 견적은 목록에 넣지 않습니다.
 */
import { encodeReceivedQuoteCursor } from "./customer-quote.cursor";
import type {
  QuoteListItemDto,
  ReceivedQuoteCursorPayload,
  ReceivedQuoteSort,
  ReceivedQuotesQuery,
  ReceivedQuotesResult,
} from "./customer-quote.dto";
import {
  findMoverReviewAverages,
  findReceivedQuotes,
  type MoverReviewAverage,
  type ReceivedQuoteRecord,
} from "./customer-quote.repository";

function toAverageRating(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Math.round(value * 10) / 10;
}

function toCursorPayload(
  sort: ReceivedQuoteSort,
  record: ReceivedQuoteRecord,
): ReceivedQuoteCursorPayload {
  if (sort === "MOVE_DATE_ASC") {
    return {
      sort,
      id: record.id,
      moveDate: record.moveRequest.moveDate.toISOString(),
    };
  }

  if (sort === "PRICE_ASC") {
    return {
      sort,
      id: record.id,
      price: record.price,
    };
  }

  return {
    sort,
    id: record.id,
    createdAt: record.createdAt.toISOString(),
  };
}

function toQuoteListItem(
  record: ReceivedQuoteRecord,
  averages: Map<string, number | null>,
): QuoteListItemDto {
  return {
    id: record.id,
    price: record.price,
    comment: record.comment,
    status: record.status,
    isDesignated: record.moveRequest.designatedRequests.some(
      (designated) => designated.moverId === record.moverId,
    ),
    createdAt: record.createdAt.toISOString(),
    mover: {
      id: record.mover.id,
      nickname: record.mover.nickname,
      profileImageUrl: record.mover.profileImageUrl,
      careerYears: record.mover.careerYears,
      shortIntroduction: record.mover.shortIntroduction,
      reviewCount: record.mover._count.reviews,
      averageRating: toAverageRating(averages.get(record.mover.id)),
      favoriteCount: record.mover._count.favorites,
      isFavorite: record.mover.favorites.length > 0,
    },
    moveRequest: {
      id: record.moveRequest.id,
      serviceType: record.moveRequest.serviceType.name,
      moveDate: record.moveRequest.moveDate.toISOString(),
      fromAddress: record.moveRequest.fromAddress,
      toAddress: record.moveRequest.toAddress,
      status: record.moveRequest.status,
    },
  };
}

/**
 * 인증된 고객의 대기 견적 카드 목록과 다음 cursor를 반환합니다.
 * @param customerId Customer profile ID. client가 보낸 ID를 쓰지 않습니다.
 * @param query 검증된 필터·정렬·페이지 조건
 * @returns data.items와 cursor pagination
 */
export async function listReceivedQuotes(
  customerId: string,
  query: ReceivedQuotesQuery,
): Promise<ReceivedQuotesResult> {
  const records = await findReceivedQuotes(customerId, query);
  const hasNext = records.length > query.limit;
  const page = hasNext ? records.slice(0, query.limit) : records;
  const lastItem = page[page.length - 1];
  const moverIds = [...new Set(page.map((record) => record.mover.id))];
  const averages = new Map<string, number | null>(
    (await findMoverReviewAverages(moverIds)).map((row: MoverReviewAverage) => [
      row.moverId,
      row.averageRating,
    ]),
  );

  return {
    items: page.map((record) => toQuoteListItem(record, averages)),
    pagination: {
      nextCursor:
        hasNext && lastItem
          ? encodeReceivedQuoteCursor(toCursorPayload(query.sort, lastItem))
          : null,
      hasNext,
    },
  };
}
