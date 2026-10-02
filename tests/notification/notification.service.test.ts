/**
 * 알림 목록·읽음 처리 Service가 소유권 필터를 그대로 Repository에 전달하고
 * 페이지·idempotent 규칙을 올바르게 적용하는지 검증합니다.
 */
jest.mock("../../src/modules/notification/notification.repository", () => ({
  findNotificationByIdForUser: jest.fn(),
  findNotifications: jest.fn(),
  markNotificationAsRead: jest.fn(),
}));

import { NotFoundError } from "../../src/common/errors/app-error";
import { decodeNotificationCursor } from "../../src/modules/notification/notification.cursor";
import type { NotificationRecord } from "../../src/modules/notification/notification.repository";
import {
  findNotificationByIdForUser,
  findNotifications,
  markNotificationAsRead as markNotificationAsReadInDb,
} from "../../src/modules/notification/notification.repository";
import {
  listNotifications,
  markNotificationAsRead,
} from "../../src/modules/notification/notification.service";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createRecord(
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "NEW_QUOTE",
    title: "새로운 견적이 도착했습니다.",
    content: "기사님이 새로운 이사 견적을 보냈습니다.",
    params: null,
    moveRequestId: "22222222-2222-4222-8222-222222222222",
    quoteId: "33333333-3333-4333-8333-333333333333",
    readAt: null,
    createdAt: new Date("2026-09-11T03:00:00.000Z"),
    ...overrides,
  };
}

describe("listNotifications", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("알림을 data.items 형식으로 매핑한다", async () => {
    jest.mocked(findNotifications).mockResolvedValue([createRecord()]);

    const result = await listNotifications(USER_ID, { limit: 10 });

    expect(findNotifications).toHaveBeenCalledWith(USER_ID, { limit: 10 });
    expect(findNotifications).not.toHaveBeenCalledWith(
      OTHER_USER_ID,
      expect.anything(),
    );
    expect(result).toEqual({
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          type: "NEW_QUOTE",
          title: "새로운 견적이 도착했습니다.",
          content: "기사님이 새로운 이사 견적을 보냈습니다.",
          params: null,
          moveRequestId: "22222222-2222-4222-8222-222222222222",
          quoteId: "33333333-3333-4333-8333-333333333333",
          readAt: null,
          createdAt: "2026-09-11T03:00:00.000Z",
        },
      ],
      pagination: { nextCursor: null, hasNext: false },
    });
  });

  test("읽은 알림은 readAt을 ISO 문자열로 내려준다", async () => {
    jest.mocked(findNotifications).mockResolvedValue([
      createRecord({ readAt: new Date("2026-09-12T00:00:00.000Z") }),
    ]);

    const result = await listNotifications(USER_ID, { limit: 10 });

    expect(result.items[0]?.readAt).toBe("2026-09-12T00:00:00.000Z");
  });

  test("limit보다 많이 조회되면 마지막 항목 기준 다음 cursor를 만든다", async () => {
    const first = createRecord();
    const second = createRecord({
      id: "44444444-4444-4444-8444-444444444444",
      createdAt: new Date("2026-09-10T03:00:00.000Z"),
    });
    jest.mocked(findNotifications).mockResolvedValue([first, second]);

    const result = await listNotifications(USER_ID, { limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.pagination.hasNext).toBe(true);

    const cursor = decodeNotificationCursor(result.pagination.nextCursor ?? "");
    expect(cursor.id).toBe(first.id);
    expect(cursor.createdAt).toBe("2026-09-11T03:00:00.000Z");
  });

  test("결과가 없으면 빈 목록과 hasNext false를 반환한다", async () => {
    jest.mocked(findNotifications).mockResolvedValue([]);

    const result = await listNotifications(USER_ID, { limit: 10 });

    expect(result).toEqual({
      items: [],
      pagination: { nextCursor: null, hasNext: false },
    });
  });
});

describe("markNotificationAsRead", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("없거나 다른 사용자 소유면 NOTIFICATION_NOT_FOUND를 던진다", async () => {
    jest.mocked(findNotificationByIdForUser).mockResolvedValue(null);

    await expect(
      markNotificationAsRead(USER_ID, "11111111-1111-4111-8111-111111111111"),
    ).rejects.toMatchObject({
      code: "NOTIFICATION_NOT_FOUND",
    });
    await expect(
      markNotificationAsRead(USER_ID, "11111111-1111-4111-8111-111111111111"),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(markNotificationAsReadInDb).not.toHaveBeenCalled();
  });

  test("이미 읽은 알림은 다시 갱신하지 않고 현재 상태를 그대로 반환한다", async () => {
    const alreadyRead = createRecord({
      readAt: new Date("2026-09-12T00:00:00.000Z"),
    });
    jest.mocked(findNotificationByIdForUser).mockResolvedValue(alreadyRead);

    const result = await markNotificationAsRead(USER_ID, alreadyRead.id);

    expect(markNotificationAsReadInDb).not.toHaveBeenCalled();
    expect(result.notification.readAt).toBe("2026-09-12T00:00:00.000Z");
  });

  test("처음 읽는 알림은 readAt을 갱신한다", async () => {
    const unread = createRecord({ readAt: null });
    jest.mocked(findNotificationByIdForUser).mockResolvedValue(unread);
    jest.mocked(markNotificationAsReadInDb).mockResolvedValue({
      ...unread,
      readAt: new Date("2026-09-13T00:00:00.000Z"),
    });

    const result = await markNotificationAsRead(USER_ID, unread.id);

    expect(markNotificationAsReadInDb).toHaveBeenCalledWith(
      unread.id,
      expect.any(Date),
    );
    expect(result.notification.readAt).toBe("2026-09-13T00:00:00.000Z");
  });
});
