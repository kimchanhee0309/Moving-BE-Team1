/**
 * 기사님이 받은 요청 목록과 상세 조회 API의 입출력 계약을 정의
 * HTTP 및 Prisma 객체에 의존하지 않으며 Controller와 Service 사이에서 사용
 */
import type { MoveRequestStatus } from "../../generated/prisma/enums";

/** API에서 사용하는 이사 서비스 코드 */
export const SERVICE_TYPE_LIST = ["SMALL", "HOME", "OFFICE"] as const;

export type ServiceTypeCode = (typeof SERVICE_TYPE_LIST)[number];

/** 받은 요청 목록에서 지원하는 정렬 방식 */
export const MOVER_REQUEST_SORT_LIST = [
  "REQUESTED_AT_DESC",
  "MOVE_DATE_ASC",
] as const;

export type MoverRequestSort = (typeof MOVER_REQUEST_SORT_LIST)[number];

/** 받은 요청 목록 조회 Query */
export interface GetReceivedRequestsQuery {
  keyword?: string;
  serviceType?: ServiceTypeCode;
  isDesignated?: boolean;
  sort: MoverRequestSort;
  cursor?: string;
  limit: number;
}

/** 받은 요청 카드 한 건에 필요한 응답 */
export interface ReceivedRequestItemDto {
  requestId: string;
  customerName: string;
  serviceType: string;
  isDesignated: boolean;
  moveDate: string;
  fromAddress: string;
  toAddress: string;
  requestedAt: string;
}

/** Cursor pagination 정보 */
export interface CursorPaginationDto {
  nextCursor: string | null;
  hasNext: boolean;
}

/** 받은 요청 목록 API의 data */
export interface ReceivedRequestListDto {
  items: ReceivedRequestItemDto[];
  pagination: CursorPaginationDto;
}

/** 받은 요청 상세 API의 이사 요청 정보 */
export interface ReceivedRequestDetailDto extends ReceivedRequestItemDto {
  status: MoveRequestStatus;
}
