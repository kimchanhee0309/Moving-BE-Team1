/**
 * 기사님의 보낸 견적 목록·견적 상세·반려한 요청 목록 API 계약을 정의합니다.
 * HTTP 객체와 Prisma 모델을 직접 노출하지 않고 API에서 사용하는 필드만 선언합니다.
 */

/** 견적 상태 필터에서 허용하는 값입니다. */
export const MOVER_QUOTE_STATUS_LIST = [
  "PROPOSED",
  "CONFIRMED",
  "REJECTED",
] as const;

export type MoverQuoteStatus = (typeof MOVER_QUOTE_STATUS_LIST)[number];

/** 견적에 연결된 이사 요청의 상태입니다. */
export type MoverQuoteMoveRequestStatus = "WAITING" | "CONFIRMED" | "COMPLETED";

/** 견적 카드에서 사용하는 서비스 유형입니다. */
export type MoverQuoteServiceType = "SMALL" | "HOME" | "OFFICE";

/** cursor pagination 공통 응답입니다. */
export interface MoverQuotePaginationDto {
  nextCursor: string | null;
  hasNext: boolean;
}

/** 보낸 견적 목록 조회 Query입니다. */
export interface GetMoverQuotesQuery {
  status?: MoverQuoteStatus;
  cursor?: string;
  limit: number;
}

/** 반려한 요청 목록 조회 Query입니다. */
export interface GetRejectedRequestsQuery {
  cursor?: string;
  limit: number;
}

/** 기사님이 보낸 견적 카드 한 건입니다. */
export interface MoverQuoteItemDto {
  quoteId: string;
  customerName: string;
  serviceType: MoverQuoteServiceType;
  isDesignated: boolean;
  fromAddress: string;
  toAddress: string;
  moveDate: string;
  price: number;
  quoteStatus: MoverQuoteStatus;
  moveRequestStatus: MoverQuoteMoveRequestStatus;
}

/** 보낸 견적 목록 API의 data입니다. */
export interface MoverQuoteListDto {
  items: MoverQuoteItemDto[];
  pagination: MoverQuotePaginationDto;
}

/** 기사님 견적 상세 응답입니다. */
export interface MoverQuoteDetailDto extends MoverQuoteItemDto {
  requestId: string;
  requestedAt: string;
  comment: string;
}

/** 기사님이 반려한 견적 요청 카드 한 건입니다. */
export interface RejectedRequestItemDto {
  rejectionId: string;
  requestId: string;
  customerName: string;
  serviceType: MoverQuoteServiceType;
  isDesignated: boolean;
  fromAddress: string;
  toAddress: string;
  moveDate: string;
  reason: string;
  rejectedAt: string;
}

/** 반려한 견적 요청 목록 API의 data입니다. */
export interface RejectedRequestListDto {
  items: RejectedRequestItemDto[];
  pagination: MoverQuotePaginationDto;
}
