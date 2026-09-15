/**
 * 기사님의 보낸 견적·견적 상세·반려 요청 조회 규칙을 처리합니다.
 * Repository 결과를 API DTO로 변환하고 소유권에 맞지 않는 상세 조회를 숨깁니다.
 */
import { NotFoundError } from "../../common/errors/app-error";
import type {
  GetMoverQuotesQuery,
  GetRejectedRequestsQuery,
  MoverQuoteDetailDto,
  MoverQuoteItemDto,
  MoverQuoteListDto,
  MoverQuoteServiceType,
  RejectedRequestItemDto,
  RejectedRequestListDto,
} from "./mover-quote.dto";
import {
  findMoverQuoteById,
  findMoverQuotes,
  findRejectedRequests,
  type MoverQuoteRecord,
  type RejectedRequestRecord,
} from "./mover-quote.repository";

/**
 * DB의 ServiceType.name을 API enum으로 변환합니다.
 * DB 기준 데이터가 API 계약 밖의 값이면 잘못된 데이터를 외부에 반환하지 않습니다.
 */
function toMoverQuoteServiceType(value: string): MoverQuoteServiceType {
  switch (value) {
    case "SMALL":
    case "HOME":
    case "OFFICE":
      return value;

    default:
      throw new Error("지원하지 않는 서비스 유형이 DB에 저장되어 있습니다.");
  }
}

/**
 * nullable로 선언된 Quote 필드가 정상 견적 조회에 필요한 값을 갖는지 확인합니다.
 * RequestRejection과 달리 실제로 전송된 Quote에는 가격과 코멘트가 있어야 합니다.
 */
function assertQuoteHasRequiredFields(
  record: MoverQuoteRecord,
): asserts record is MoverQuoteRecord & {
  price: number;
  comment: string;
} {
  if (record.price === null || record.comment === null) {
    throw new Error("견적의 가격 또는 코멘트가 저장되어 있지 않습니다.");
  }
}

/** Prisma 견적 레코드를 카드 DTO로 변환합니다. */
function toMoverQuoteItemDto(record: MoverQuoteRecord): MoverQuoteItemDto {
  assertQuoteHasRequiredFields(record);

  return {
    quoteId: record.id,
    customerName: record.moveRequest.customer.user.name,
    serviceType: toMoverQuoteServiceType(record.moveRequest.serviceType.name),
    isDesignated: record.moveRequest.designatedRequests.length > 0,
    fromAddress: record.moveRequest.fromAddress,
    toAddress: record.moveRequest.toAddress,
    moveDate: record.moveRequest.moveDate.toISOString(),
    price: record.price,
    quoteStatus: record.status,
    moveRequestStatus: record.moveRequest.status,
  };
}

/** Prisma 반려 레코드를 반려 요청 카드 DTO로 변환합니다. */
function toRejectedRequestItemDto(
  record: RejectedRequestRecord,
): RejectedRequestItemDto {
  return {
    rejectionId: record.id,
    requestId: record.moveRequest.id,
    customerName: record.moveRequest.customer.user.name,
    serviceType: toMoverQuoteServiceType(record.moveRequest.serviceType.name),
    isDesignated: record.moveRequest.designatedRequests.length > 0,
    fromAddress: record.moveRequest.fromAddress,
    toAddress: record.moveRequest.toAddress,
    moveDate: record.moveRequest.moveDate.toISOString(),
    reason: record.reason,
    rejectedAt: record.createdAt.toISOString(),
  };
}

/**
 * 기사님이 보낸 견적 목록을 조회합니다.
 *
 * @param moverId 인증된 기사 프로필 UUID
 * @param query 상태 필터와 cursor pagination 조건
 * @returns 견적 카드와 다음 cursor
 * @sideeffect Repository를 통해 PostgreSQL을 조회합니다.
 */
export async function getMoverQuotes(
  moverId: string,
  query: GetMoverQuotesQuery,
): Promise<MoverQuoteListDto> {
  const records = await findMoverQuotes({
    moverId,
    ...query,
  });

  const hasNext = records.length > query.limit;
  const pageRecords = records.slice(0, query.limit);
  const items = pageRecords.map(toMoverQuoteItemDto);
  const lastItem = items.at(-1);

  return {
    items,
    pagination: {
      nextCursor: hasNext && lastItem ? lastItem.quoteId : null,
      hasNext,
    },
  };
}

/**
 * 인증된 기사님이 소유한 견적 상세를 조회합니다.
 *
 * @param moverId 인증된 기사 프로필 UUID
 * @param quoteId 조회할 견적 UUID
 * @returns 견적 상세 DTO
 * @throws NotFoundError 견적이 없거나 다른 기사님의 견적인 경우
 * @sideeffect Repository를 통해 PostgreSQL을 조회합니다.
 */
export async function getMoverQuoteDetail(
  moverId: string,
  quoteId: string,
): Promise<MoverQuoteDetailDto> {
  const record = await findMoverQuoteById({
    moverId,
    quoteId,
  });

  // 다른 기사님의 견적 존재 여부도 노출하지 않기 위해 동일한 404를 반환합니다.
  if (!record) {
    throw new NotFoundError(
      "견적을 찾을 수 없습니다.",
      "MOVER_QUOTE_NOT_FOUND",
    );
  }

  assertQuoteHasRequiredFields(record);

  return {
    ...toMoverQuoteItemDto(record),
    requestId: record.moveRequest.id,
    requestedAt: record.moveRequest.createdAt.toISOString(),
    comment: record.comment,
  };
}

/**
 * 기사님이 직접 반려한 견적 요청 목록을 조회합니다.
 *
 * @param moverId 인증된 기사 프로필 UUID
 * @param query cursor pagination 조건
 * @returns 반려 요청 카드와 다음 cursor
 * @sideeffect Repository를 통해 PostgreSQL을 조회합니다.
 */
export async function getRejectedRequests(
  moverId: string,
  query: GetRejectedRequestsQuery,
): Promise<RejectedRequestListDto> {
  const records = await findRejectedRequests({
    moverId,
    ...query,
  });

  const hasNext = records.length > query.limit;
  const pageRecords = records.slice(0, query.limit);
  const items = pageRecords.map(toRejectedRequestItemDto);
  const lastItem = items.at(-1);

  return {
    items,
    pagination: {
      nextCursor: hasNext && lastItem ? lastItem.rejectionId : null,
      hasNext,
    },
  };
}
