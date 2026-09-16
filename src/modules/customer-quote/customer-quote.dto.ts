/**
 * 고객이 받은 대기·과거 견적 목록·상세 API의 입력·응답 DTO를 정의합니다.
 * 입력 검증 스키마는 validator의 Zod에 두고, 이 파일은 검증된 타입과 응답 형태만 담당합니다.
 */
import type { MoveRequestStatus, QuoteStatus } from "../../generated/prisma/enums";

/** 이사 서비스 유형 이름이며 API와 seed 계약의 SMALL/HOME/OFFICE만 허용합니다. */
export const SERVICE_TYPE_NAMES = ["SMALL", "HOME", "OFFICE"] as const;

export type ServiceTypeName = (typeof SERVICE_TYPE_NAMES)[number];

/** 이사 서비스 유형 이름이 API 허용값인지 확인합니다. */
export function isServiceTypeName(value: string): value is ServiceTypeName {
  return value === "SMALL" || value === "HOME" || value === "OFFICE";
}

/** 대기 견적 목록 정렬. 기본값은 견적 생성 최신순입니다. */
export const RECEIVED_QUOTE_SORTS = [
  "CREATED_AT_DESC",
  "MOVE_DATE_ASC",
  "PRICE_ASC",
] as const;

export type ReceivedQuoteSort = (typeof RECEIVED_QUOTE_SORTS)[number];

/** 대기 견적 목록 정렬 값이 허용 enum인지 확인합니다. */
export function isReceivedQuoteSort(value: string): value is ReceivedQuoteSort {
  return (
    value === "CREATED_AT_DESC" ||
    value === "MOVE_DATE_ASC" ||
    value === "PRICE_ASC"
  );
}

/** 과거 확정 견적 목록 정렬. 기본값은 확정 시각 최신순입니다. */
export const RECEIVED_QUOTE_HISTORY_SORTS = [
  "UPDATED_AT_DESC",
  "MOVE_DATE_DESC",
] as const;

export type ReceivedQuoteHistorySort =
  (typeof RECEIVED_QUOTE_HISTORY_SORTS)[number];

/** 과거 목록 정렬 값이 허용 enum인지 확인합니다. */
export function isReceivedQuoteHistorySort(
  value: string,
): value is ReceivedQuoteHistorySort {
  return value === "UPDATED_AT_DESC" || value === "MOVE_DATE_DESC";
}

/** 과거 목록에서 요청 상태를 좁힐 때 쓰는 값입니다. Quote enum COMPLETED는 없습니다. */
export const HISTORY_MOVE_REQUEST_STATUSES = ["CONFIRMED", "COMPLETED"] as const;

export type HistoryMoveRequestStatus =
  (typeof HISTORY_MOVE_REQUEST_STATUSES)[number];

/** 검증된 목록 조회 조건입니다. status query는 URI가 PROPOSED+WAITING으로 고정하므로 받지 않습니다. */
export interface ReceivedQuotesQuery {
  keyword?: string;
  serviceType?: ServiceTypeName;
  isDesignated?: boolean;
  sort: ReceivedQuoteSort;
  cursor?: ReceivedQuoteCursorPayload;
  limit: number;
}

/**
 * opaque cursor를 복원한 키셋 값입니다.
 * sort별로 비교 필드가 다르므로 다음 페이지는 같은 sort와만 사용할 수 있습니다.
 */
export interface ReceivedQuoteCursorPayload {
  sort: ReceivedQuoteSort;
  id: string;
  createdAt?: string;
  moveDate?: string;
  price?: number | null;
}

/** 견적을 보낸 기사님 카드 요약입니다. */
export interface QuoteListMoverDto {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  careerYears: number;
  shortIntroduction: string;
  reviewCount: number;
  averageRating: number | null;
  favoriteCount: number;
  isFavorite: boolean;
}

/** 견적이 속한 이사 요청 카드 요약입니다. serviceType은 UUID가 아니라 유형 이름입니다. */
export interface QuoteListMoveRequestDto {
  id: string;
  /** API 허용값은 SMALL, HOME, OFFICE이며 DB 이름은 그대로 전달합니다. */
  serviceType: string;
  moveDate: string;
  fromAddress: string;
  toAddress: string;
  status: MoveRequestStatus;
}

/** 목록 한 건입니다. 상세의 updatedAt·기사 소개·가능 지역은 포함하지 않습니다. */
export interface QuoteListItemDto {
  id: string;
  price: number | null;
  comment: string | null;
  status: QuoteStatus;
  isDesignated: boolean;
  createdAt: string;
  mover: QuoteListMoverDto;
  moveRequest: QuoteListMoveRequestDto;
}

/** Cursor 페이지 정보이며 전체 개수(totalCount)는 제공하지 않습니다. */
export interface CursorPaginationDto {
  nextCursor: string | null;
  hasNext: boolean;
}

export interface ReceivedQuotesResult {
  items: QuoteListItemDto[];
  pagination: CursorPaginationDto;
}

/** 상세에서만 추가로 내려주는 기사님 소개와 가능 유형·지역입니다. */
export interface QuoteDetailMoverDto extends QuoteListMoverDto {
  description: string;
  serviceTypes: string[];
  regions: string[];
}

/** 대기 견적 상세입니다. 목록 필드에 updatedAt과 기사 상세를 더합니다. */
export interface QuoteDetailDto {
  id: string;
  price: number | null;
  comment: string | null;
  status: QuoteStatus;
  isDesignated: boolean;
  createdAt: string;
  updatedAt: string;
  mover: QuoteDetailMoverDto;
  moveRequest: QuoteListMoveRequestDto;
}

export interface ReceivedQuoteDetailResult {
  quote: QuoteDetailDto;
}

/** 검증된 과거 견적 목록 조회 조건입니다. Quote는 CONFIRMED만 포함합니다. */
export interface ReceivedQuoteHistoryQuery {
  keyword?: string;
  serviceType?: ServiceTypeName;
  moveRequestStatus?: HistoryMoveRequestStatus;
  sort: ReceivedQuoteHistorySort;
  cursor?: ReceivedQuoteHistoryCursorPayload;
  limit: number;
}

/**
 * 과거 목록 opaque cursor입니다.
 * UPDATED_AT_DESC는 확정 시각, MOVE_DATE_DESC는 이사일을 키로 씁니다.
 */
export interface ReceivedQuoteHistoryCursorPayload {
  sort: ReceivedQuoteHistorySort;
  id: string;
  updatedAt?: string;
  moveDate?: string;
}
