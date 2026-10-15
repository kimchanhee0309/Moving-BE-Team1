/**
 * 알림 목록 조회와 읽음 처리의 조회 범위·멱등 규칙을 담당합니다.
 * 소유권 검증은 Notification.userId(User.id) 기준이며 Customer/Mover profile ID는 사용하지
 * 않습니다. SSE push(notification.hub.ts)는 이 Service가 아니라 알림을 발생시키는 각 도메인
 * Service(mover-request, customer-quote)가 트랜잭션 커밋 이후 직접 호출합니다.
 */
import { NotFoundError } from "../../common/errors/app-error";
import { encodeNotificationCursor } from "./notification.cursor";
import type {
  NotificationListItemDto,
  NotificationParams,
  NotificationListQuery,
  NotificationListResult,
  NotificationReadResult,
} from "./notification.dto";
import {
  findNotificationByIdForUser,
  findNotifications,
  markNotificationAsRead as markNotificationAsReadInDb,
  type NotificationRecord,
} from "./notification.repository";

/** Repository record를 응답 DTO로 변환합니다. Prisma row를 그대로 노출하지 않습니다. */
/**
 * DB Json 값을 문자열 값만 가진 params 객체로 좁힙니다.
 * 객체가 아니거나 문자열이 아닌 값이 섞이면 클라이언트가 잘못 조립하지 않도록 null을 반환합니다.
 *
 * @param value Notification.params 원본(Json | null)
 * @returns 문자열 맵 또는 null
 */
function toNotificationParams(value: unknown): NotificationParams | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([, item]) => typeof item === "string")
    ? Object.fromEntries(entries.map(([key, item]) => [key, String(item)]))
    : null;
}

function toNotificationListItem(
  record: NotificationRecord,
): NotificationListItemDto {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    content: record.content,
    params: toNotificationParams(record.params),
    moveRequestId: record.moveRequestId,
    quoteId: record.quoteId,
    readAt: record.readAt ? record.readAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * 인증된 사용자의 알림 목록과 다음 cursor를 반환합니다.
 * @param userId requireProfile이 보장한 인증 주체의 User.id
 * @param query 검증된 필터·페이지 조건
 * @sideeffect Repository를 통해 PostgreSQL을 조회합니다.
 */
export async function listNotifications(
  userId: string,
  query: NotificationListQuery,
): Promise<NotificationListResult> {
  const records = await findNotifications(userId, query);
  const hasNext = records.length > query.limit;
  const page = hasNext ? records.slice(0, query.limit) : records;
  const lastItem = page[page.length - 1];

  return {
    items: page.map(toNotificationListItem),
    pagination: {
      nextCursor:
        hasNext && lastItem
          ? encodeNotificationCursor({
              id: lastItem.id,
              createdAt: lastItem.createdAt.toISOString(),
            })
          : null,
      hasNext,
    },
  };
}

/**
 * 알림 1건을 읽음 처리합니다.
 *
 * 다른 사용자의 알림이거나 없으면 존재 여부를 구분하지 않고 같은 404를 반환합니다.
 * 이미 읽은 알림은 readAt을 다시 갱신하지 않고 현재 상태를 그대로 반환해 재호출해도
 * 결과가 바뀌지 않도록(idempotent) 합니다.
 * @param userId 인증된 User.id
 * @param notificationId 검증된 Notification UUID
 * @returns 읽음 처리된(또는 이미 읽은) 알림
 * @throws NotFoundError 없거나 다른 사용자 소유면 NOTIFICATION_NOT_FOUND
 * @sideeffect 처음 읽는 경우에만 Notification.readAt을 갱신합니다.
 */
export async function markNotificationAsRead(
  userId: string,
  notificationId: string,
): Promise<NotificationReadResult> {
  const owned = await findNotificationByIdForUser(userId, notificationId);

  if (!owned) {
    throw new NotFoundError(
      "알림을 찾을 수 없습니다.",
      "NOTIFICATION_NOT_FOUND",
    );
  }

  if (owned.readAt) {
    return { notification: toNotificationListItem(owned) };
  }

  const updated = await markNotificationAsReadInDb(notificationId, new Date());

  return { notification: toNotificationListItem(updated) };
}
