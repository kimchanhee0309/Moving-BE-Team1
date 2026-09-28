/**
 * SSE 연결 허브가 사용자당 여러 연결을 유지하고, 등록되지 않은 사용자는 조용히 무시하며,
 * 연결이 끊어지면 정확히 제거하는지 검증합니다.
 */
import type { Response } from "express";

import {
  publishNotificationToUser,
  registerNotificationConnection,
  unregisterNotificationConnection,
} from "../../src/modules/notification/notification.hub";
import type { NotificationStreamPayload } from "../../src/modules/notification/notification.dto";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function createMockResponse(): Response {
  return { write: jest.fn() } as unknown as Response;
}

const payload: NotificationStreamPayload = {
  type: "NEW_QUOTE",
  title: "새로운 견적이 도착했습니다.",
  content: "기사님이 새로운 이사 견적을 보냈습니다.",
  moveRequestId: "22222222-2222-4222-8222-222222222222",
  quoteId: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-09-11T03:00:00.000Z",
};

describe("notification hub", () => {
  test("연결이 없는 사용자에게 push해도 예외를 던지지 않는다", () => {
    expect(() => publishNotificationToUser(USER_ID, payload)).not.toThrow();
  });

  test("등록된 연결에 SSE notification 이벤트를 write한다", () => {
    const response = createMockResponse();
    registerNotificationConnection(USER_ID, response);

    publishNotificationToUser(USER_ID, payload);

    expect(response.write).toHaveBeenCalledTimes(1);
    expect(response.write).toHaveBeenCalledWith(
      expect.stringContaining("event: notification"),
    );
    expect(response.write).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify(payload)),
    );

    unregisterNotificationConnection(USER_ID, response);
  });

  test("같은 사용자의 여러 연결(다른 탭) 모두에 push한다", () => {
    const first = createMockResponse();
    const second = createMockResponse();
    registerNotificationConnection(USER_ID, first);
    registerNotificationConnection(USER_ID, second);

    publishNotificationToUser(USER_ID, payload);

    expect(first.write).toHaveBeenCalledTimes(1);
    expect(second.write).toHaveBeenCalledTimes(1);

    unregisterNotificationConnection(USER_ID, first);
    unregisterNotificationConnection(USER_ID, second);
  });

  test("연결 해제 후에는 더 이상 push하지 않는다", () => {
    const response = createMockResponse();
    registerNotificationConnection(USER_ID, response);
    unregisterNotificationConnection(USER_ID, response);

    publishNotificationToUser(USER_ID, payload);

    expect(response.write).not.toHaveBeenCalled();
  });

  test("등록되지 않은 연결을 해제해도 예외를 던지지 않는다", () => {
    const response = createMockResponse();

    expect(() =>
      unregisterNotificationConnection("no-such-user", response),
    ).not.toThrow();
  });

  test("한 연결의 write 실패가 다른 연결의 push를 막지 않는다", () => {
    const broken = {
      write: jest.fn(() => {
        throw new Error("연결이 이미 끊어졌습니다.");
      }),
    } as unknown as Response;
    const healthy = createMockResponse();
    registerNotificationConnection(USER_ID, broken);
    registerNotificationConnection(USER_ID, healthy);

    expect(() => publishNotificationToUser(USER_ID, payload)).not.toThrow();
    expect(healthy.write).toHaveBeenCalledTimes(1);

    unregisterNotificationConnection(USER_ID, broken);
    unregisterNotificationConnection(USER_ID, healthy);
  });
});
