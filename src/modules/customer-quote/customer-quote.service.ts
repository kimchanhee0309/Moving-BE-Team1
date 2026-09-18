/**
 * 고객이 받은 대기·과거 견적 목록·상세와 견적 확정의 조회 범위·상태 전이를 담당합니다.
 * 대기 API는 PROPOSED+WAITING만, 과거 API는 CONFIRMED 견적만 다룹니다.
 */
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../common/errors/app-error";
import { prisma } from "../../lib/prisma";
import { encodeReceivedQuoteCursor, encodeReceivedQuoteHistoryCursor } from "./customer-quote.cursor";
import type {
  QuoteDetailDto,
  QuoteListItemDto,
  ReceivedQuoteCursorPayload,
  ReceivedQuoteDetailResult,
  ReceivedQuoteHistoryCursorPayload,
  ReceivedQuoteHistoryQuery,
  ReceivedQuoteHistorySort,
  ReceivedQuoteSort,
  ReceivedQuotesQuery,
  ReceivedQuotesResult,
} from "./customer-quote.dto";
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
  type MoverReviewAverage,
  type ReceivedQuoteDetailRecord,
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
      createdAt: record.moveRequest.createdAt.toISOString(),
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

  return toPagedQuoteItems(records, query.limit, (lastItem) =>
    encodeReceivedQuoteCursor(toCursorPayload(query.sort, lastItem)),
  );
}

function toQuoteDetail(
  record: ReceivedQuoteDetailRecord,
  averages: Map<string, number | null>,
): QuoteDetailDto {
  const item = toQuoteListItem(record, averages);

  return {
    ...item,
    updatedAt: record.updatedAt.toISOString(),
    mover: {
      ...item.mover,
      description: record.mover.description,
      serviceTypes: record.mover.serviceTypes.map(
        (entry) => entry.serviceType.name,
      ),
      regions: record.mover.regions.map((entry) => entry.region.name),
    },
  };
}

/**
 * 인증된 고객의 대기 견적 상세를 반환합니다.
 * 다른 고객 견적과 과거 견적은 존재 여부를 구분하지 않고 같은 404를 사용합니다.
 * @param customerId Customer profile ID
 * @param quoteId 검증된 Quote UUID
 * @returns data.quote
 * @throws NotFoundError 없거나 대기 견적이 아닌 경우 QUOTE_NOT_FOUND
 */
export async function getReceivedQuoteDetail(
  customerId: string,
  quoteId: string,
): Promise<ReceivedQuoteDetailResult> {
  const record = await findReceivedQuoteDetail(customerId, quoteId);

  if (!record) {
    throw new NotFoundError("견적을 찾을 수 없습니다.", "QUOTE_NOT_FOUND");
  }

  const averages = new Map<string, number | null>(
    (await findMoverReviewAverages([record.mover.id])).map(
      (row: MoverReviewAverage) => [row.moverId, row.averageRating],
    ),
  );

  return {
    quote: toQuoteDetail(record, averages),
  };
}

function toHistoryCursorPayload(
  sort: ReceivedQuoteHistorySort,
  record: ReceivedQuoteRecord,
): ReceivedQuoteHistoryCursorPayload {
  if (sort === "MOVE_DATE_DESC") {
    return {
      sort,
      id: record.id,
      moveDate: record.moveRequest.moveDate.toISOString(),
    };
  }

  return {
    sort,
    id: record.id,
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function toPagedQuoteItems(
  records: ReceivedQuoteRecord[],
  limit: number,
  encodeNextCursor: (lastItem: ReceivedQuoteRecord) => string,
): Promise<ReceivedQuotesResult> {
  const hasNext = records.length > limit;
  const page = hasNext ? records.slice(0, limit) : records;
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
        hasNext && lastItem ? encodeNextCursor(lastItem) : null,
      hasNext,
    },
  };
}

/**
 * 내가 확정한 과거 견적 카드 목록과 다음 cursor를 반환합니다.
 * @param customerId Customer profile ID
 * @param query 검증된 과거 목록 조건
 */
export async function listReceivedQuoteHistory(
  customerId: string,
  query: ReceivedQuoteHistoryQuery,
): Promise<ReceivedQuotesResult> {
  const records = await findReceivedQuoteHistory(customerId, query);

  return toPagedQuoteItems(records, query.limit, (lastItem) =>
    encodeReceivedQuoteHistoryCursor(toHistoryCursorPayload(query.sort, lastItem)),
  );
}

/**
 * 내가 확정한 과거 견적 상세를 반환합니다.
 * 대기 견적 ID를 이 API로 조회하면 QUOTE_NOT_FOUND입니다.
 * @param customerId Customer profile ID
 * @param quoteId 검증된 Quote UUID
 * @throws NotFoundError 없거나 확정 견적이 아닌 경우 QUOTE_NOT_FOUND
 */
export async function getReceivedQuoteHistoryDetail(
  customerId: string,
  quoteId: string,
): Promise<ReceivedQuoteDetailResult> {
  const record = await findReceivedQuoteHistoryDetail(customerId, quoteId);

  if (!record) {
    throw new NotFoundError("견적을 찾을 수 없습니다.", "QUOTE_NOT_FOUND");
  }

  const averages = new Map<string, number | null>(
    (await findMoverReviewAverages([record.mover.id])).map(
      (row: MoverReviewAverage) => [row.moverId, row.averageRating],
    ),
  );

  return {
    quote: toQuoteDetail(record, averages),
  };
}

/**
 * 내 활성 요청의 PROPOSED 견적 1건을 확정합니다.
 * 같은 요청의 다른 PROPOSED 견적은 REJECTED, 요청은 CONFIRMED로 바꿉니다.
 * @param customerId requireProfile이 보장한 Customer.id
 * @param quoteId 검증된 Quote UUID
 * @returns 확정된 견적 상세 data.quote
 * @throws NotFoundError 없거나 내 요청이 아니면 QUOTE_NOT_FOUND
 * @throws ConflictError 견적이 PROPOSED가 아니면 QUOTE_NOT_CONFIRMABLE
 * @throws ConflictError 요청이 이미 확정·완료면 REQUEST_ALREADY_CONFIRMED
 * @throws BadRequestError 금액이 없으면 INVALID_REQUEST
 * @remarks Quote·MoveRequest·Notification을 한 트랜잭션에서 변경합니다.
 */
export async function confirmReceivedQuote(
  customerId: string,
  quoteId: string,
): Promise<ReceivedQuoteDetailResult> {
  const confirmed = await prisma.$transaction(async (tx) => {
    const owned = await findOwnedQuoteForConfirm(customerId, quoteId, tx);

    if (!owned) {
      throw new NotFoundError("견적을 찾을 수 없습니다.", "QUOTE_NOT_FOUND");
    }

    // 같은 요청의 다른 견적 확정과 겹치지 않도록 요청 행을 잠근 뒤 상태를 다시 읽습니다.
    await lockMoveRequestForConfirm(owned.moveRequest.id, tx);
    const locked = await findOwnedQuoteForConfirm(customerId, quoteId, tx);

    if (!locked) {
      throw new NotFoundError("견적을 찾을 수 없습니다.", "QUOTE_NOT_FOUND");
    }

    if (locked.status !== "PROPOSED") {
      throw new ConflictError(
        "확정할 수 없는 견적입니다.",
        "QUOTE_NOT_CONFIRMABLE",
      );
    }

    if (locked.moveRequest.status !== "WAITING") {
      throw new ConflictError(
        "이미 확정된 견적 요청입니다.",
        "REQUEST_ALREADY_CONFIRMED",
      );
    }

    if (locked.price === null) {
      throw new BadRequestError(
        "금액이 없는 견적은 확정할 수 없습니다.",
        "INVALID_REQUEST",
        [{ field: "price", reason: "확정하려면 견적 금액이 필요합니다." }],
      );
    }

    await applyQuoteConfirmation(locked.id, locked.moveRequest.id, tx);
    await createQuoteConfirmedNotifications(
      {
        customerUserId: locked.moveRequest.customer.userId,
        customerName: locked.moveRequest.customer.user.name,
        moverUserId: locked.mover.userId,
        moverNickname: locked.mover.nickname,
        moveRequestId: locked.moveRequest.id,
        quoteId: locked.id,
      },
      tx,
    );

    const detail = await findOwnedQuoteDetailAfterConfirm(
      customerId,
      quoteId,
      tx,
    );

    if (!detail) {
      throw new NotFoundError("견적을 찾을 수 없습니다.", "QUOTE_NOT_FOUND");
    }

    return detail;
  });

  const averages = new Map<string, number | null>(
    (await findMoverReviewAverages([confirmed.mover.id])).map(
      (row: MoverReviewAverage) => [row.moverId, row.averageRating],
    ),
  );

  return {
    quote: toQuoteDetail(confirmed, averages),
  };
}
