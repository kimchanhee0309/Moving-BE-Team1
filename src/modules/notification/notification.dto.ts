/**
 * 알림 목록 조회·읽음 처리·SSE push의 요청·응답 DTO를 정의합니다.
 * 입력 검증 스키마는 notification.validator.ts의 Zod에 두고, 이 파일은 검증된 타입과
 * 응답 형태만 담당합니다.
 *
 * 이 module이 다루지 않는 범위:
 * - NEW_QUOTE/QUOTE_CONFIRMED/NEW_MOVE_REQUEST/MOVE_DAY 알림 생성 트리거 자체(각각
 *   mover-request/customer-quote/move-request 모듈과 notification.hub의 move-day
 *   스케줄러가 담당하며, 이 파일은 그 결과를 담는 DTO만 정의합니다)
 * - 목록 query의 cursor/limit 기본값·unreadOnly, 읽음 처리 단건/전체 여부는 아직 팀이
 *   승인한 Swagger에 확정되지 않아 customer-quote 모듈의 cursor pagination 관례를 따른
 *   잠정 구현이며, 확정 명세가 나오면 함께 갱신해야 합니다.
 */
import type { NotificationType } from "../../generated/prisma/enums";

/**
 * 검증된 알림 목록 조회 조건입니다.
 * 정렬은 생성 최신순(createdAt desc, id desc) 하나만 제공하므로 sort 필드는 두지 않습니다.
 */
export interface NotificationListQuery {
  cursor?: NotificationCursorPayload;
  limit: number;
  /** true면 읽지 않은(readAt이 null인) 알림만 반환합니다. */
  unreadOnly?: boolean;
}

/** opaque cursor를 복원한 키셋 값입니다. */
export interface NotificationCursorPayload {
  id: string;
  createdAt: string;
}

/**
 * 알림 목록·읽음 처리 응답 한 건입니다.
 * Prisma Notification row를 그대로 노출하지 않고 화면에 필요한 필드만 선택합니다.
 */
export interface NotificationListItemDto {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  /** 관련 이사 요청이 삭제되면 Prisma가 SetNull로 처리하므로 null일 수 있습니다. */
  moveRequestId: string | null;
  /** 관련 견적이 삭제되면 Prisma가 SetNull로 처리하므로 null일 수 있습니다. */
  quoteId: string | null;
  /** 아직 읽지 않았으면 null입니다. */
  readAt: string | null;
  createdAt: string;
}

/** Cursor 페이지 정보이며 전체 개수(totalCount)는 제공하지 않습니다. */
export interface CursorPaginationDto {
  nextCursor: string | null;
  hasNext: boolean;
}

export interface NotificationListResult {
  items: NotificationListItemDto[];
  pagination: CursorPaginationDto;
}

export interface NotificationReadResult {
  notification: NotificationListItemDto;
}

/**
 * SSE로 push하는 최소 payload입니다.
 * Notification row 전체(id, readAt 등)를 담지 않고 화면이 toast를 띄우거나 알림 목록
 * 캐시를 무효화(invalidate)하는 트리거로 쓰기에 필요한 정보만 담습니다.
 * createdAt은 push 시점에 계산한 값이라 DB row의 createdAt과 밀리초 단위로 다를 수 있습니다.
 * 최신 정확한 상태(id 포함)가 필요하면 클라이언트가 GET /notifications를 다시 호출해야 합니다.
 */
export interface NotificationStreamPayload {
  type: NotificationType;
  title: string;
  content: string;
  moveRequestId: string | null;
  quoteId: string | null;
  createdAt: string;
}
