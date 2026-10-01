/**
 * 인증된 사용자(User.id) 소유의 알림 조회·읽음 처리를 Prisma로 수행합니다.
 * HTTP·cookie는 다루지 않고 응답에 필요한 column만 선택합니다.
 * Customer/Mover profile ID가 아니라 Notification.userId(User.id) 기준으로 소유권을 거릅니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { NotificationListQuery } from "./notification.dto";

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  content: true,
  moveRequestId: true,
  quoteId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationRecord = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

/**
 * 알림 목록의 키셋 cursor where 조건을 만듭니다.
 * createdAt만으로는 같은 시각에 생성된 여러 알림을 구분할 수 없어 id를 함께 비교합니다.
 */
function createCursorWhere(
  query: NotificationListQuery,
): Prisma.NotificationWhereInput | undefined {
  const cursor = query.cursor;

  if (!cursor) {
    return undefined;
  }

  const createdAt = new Date(cursor.createdAt);

  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { AND: [{ createdAt }, { id: { lt: cursor.id } }] },
    ],
  };
}

/**
 * 로그인한 사용자의 알림을 생성 최신순으로 limit+1개 조회합니다.
 * +1은 다음 페이지 존재 여부를 한 번의 조회로 확인하기 위함입니다.
 * @param userId 인증된 User.id (Customer/Mover profile ID가 아님)
 * @param query 검증된 필터·커서
 * @sideeffect PostgreSQL 읽기 쿼리를 실행합니다.
 */
export async function findNotifications(
  userId: string,
  query: NotificationListQuery,
): Promise<NotificationRecord[]> {
  const cursorWhere = createCursorWhere(query);

  return prisma.notification.findMany({
    where: {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
      ...(cursorWhere ? { AND: [cursorWhere] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    select: notificationSelect,
  });
}

/**
 * 인증된 사용자 소유의 알림 1건을 조회합니다.
 * 다른 사용자의 알림이거나 없으면 null을 반환해 존재 여부를 구분하지 않습니다.
 * @param userId 인증된 User.id
 * @param notificationId 검증된 Notification UUID
 */
export function findNotificationByIdForUser(
  userId: string,
  notificationId: string,
): Promise<NotificationRecord | null> {
  return prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: notificationSelect,
  });
}

/**
 * 알림을 읽음 처리합니다.
 * 이미 읽은 알림을 다시 읽음 처리해도 되는지(멱등 여부)는 이 함수가 아니라
 * notification.service.ts가 호출 전에 판단합니다. 이 함수는 항상 readAt을 덮어씁니다.
 * @param notificationId 소유권 검증이 끝난 Notification UUID
 * @param readAt 읽음 처리 시각
 * @sideeffect Notification.readAt을 갱신합니다.
 */
export function markNotificationAsRead(
  notificationId: string,
  readAt: Date,
): Promise<NotificationRecord> {
  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt },
    select: notificationSelect,
  });
}
