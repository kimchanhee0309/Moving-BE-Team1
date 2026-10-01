/**
 * SSE 연결 허브가 사용자당 여러 연결을 유지하고, 등록되지 않은 사용자는 조용히 무시하며,
 * 연결이 끊어지면 정확히 제거하는지 검증합니다.
 */
import type { Response } from "express";

import {
  closeAllNotificationConnections,
  getNotificationConnectionCount,
  publishNotificationToUser,
  registerNotificationConnection,
  unregisterNotificationConnection,
} from "../../src/modules/notification/notification.hub";
import type { NotificationStreamPayload } from "../../src/modules/notification/notification.dto";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function createMockResponse(): Response {
  return { write: jest.fn(), end: jest.fn() } as unknown as Response;
}

const payload: NotificationStreamPayload = {
  type: "NEW_QUOTE",
  title: "새로운 견적이 도착했습니다.",
  content: "기사님이 새로운 이사 견적을 보냈습니다.",
  params: null,
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

  describe("registerNotificationConnection 연결 수 상한", () => {
    const LIMIT_USER_ID = "55555555-5555-4555-8555-555555555555";
    const ANOTHER_LIMIT_USER_ID = "66666666-6666-4666-8666-666666666666";

    test("상한(5개)까지는 모두 유지되고 기존 연결은 end()되지 않는다", () => {
      const connections = Array.from({ length: 5 }, () =>
        createMockResponse(),
      );

      connections.forEach((connection) =>
        registerNotificationConnection(LIMIT_USER_ID, connection),
      );

      expect(getNotificationConnectionCount(LIMIT_USER_ID)).toBe(5);
      connections.forEach((connection) =>
        expect(connection.end).not.toHaveBeenCalled(),
      );

      connections.forEach((connection) =>
        unregisterNotificationConnection(LIMIT_USER_ID, connection),
      );
    });

    test("상한을 넘기면 가장 오래된 연결을 종료하고 최신 연결만 남긴다", () => {
      const oldestConnection = createMockResponse();
      const remainingConnections = Array.from({ length: 5 }, () =>
        createMockResponse(),
      );

      registerNotificationConnection(LIMIT_USER_ID, oldestConnection);
      remainingConnections.forEach((connection) =>
        registerNotificationConnection(LIMIT_USER_ID, connection),
      );

      // 1번째(가장 오래된) 연결만 end()되고 나머지(2~6번째)는 그대로 유지된다.
      expect(oldestConnection.end).toHaveBeenCalledTimes(1);
      remainingConnections.forEach((connection) =>
        expect(connection.end).not.toHaveBeenCalled(),
      );
      expect(getNotificationConnectionCount(LIMIT_USER_ID)).toBe(5);

      publishNotificationToUser(LIMIT_USER_ID, payload);
      expect(oldestConnection.write).not.toHaveBeenCalled();
      remainingConnections.forEach((connection) =>
        expect(connection.write).toHaveBeenCalledTimes(1),
      );

      remainingConnections.forEach((connection) =>
        unregisterNotificationConnection(LIMIT_USER_ID, connection),
      );
    });

    test("사용자별로 독립적으로 상한이 적용된다", () => {
      const overLimitUserConnections = Array.from({ length: 6 }, () =>
        createMockResponse(),
      );
      const otherUserConnection = createMockResponse();

      registerNotificationConnection(ANOTHER_LIMIT_USER_ID, otherUserConnection);
      overLimitUserConnections.forEach((connection) =>
        registerNotificationConnection(LIMIT_USER_ID, connection),
      );

      // 한 사용자가 상한을 넘겨 오래된 연결이 정리되어도 다른 사용자의 연결은 영향받지 않는다.
      expect(otherUserConnection.end).not.toHaveBeenCalled();
      expect(getNotificationConnectionCount(ANOTHER_LIMIT_USER_ID)).toBe(1);

      unregisterNotificationConnection(
        ANOTHER_LIMIT_USER_ID,
        otherUserConnection,
      );
      overLimitUserConnections
        .slice(1)
        .forEach((connection) =>
          unregisterNotificationConnection(LIMIT_USER_ID, connection),
        );
    });

    test("강제 종료 대상 연결의 end()가 예외를 던져도 새 연결 등록은 계속된다", () => {
      const broken = {
        write: jest.fn(),
        end: jest.fn(() => {
          throw new Error("이미 끊어진 연결입니다.");
        }),
      } as unknown as Response;
      const healthyConnections = Array.from({ length: 4 }, () =>
        createMockResponse(),
      );
      const newConnection = createMockResponse();

      registerNotificationConnection(LIMIT_USER_ID, broken);
      healthyConnections.forEach((connection) =>
        registerNotificationConnection(LIMIT_USER_ID, connection),
      );

      expect(() =>
        registerNotificationConnection(LIMIT_USER_ID, newConnection),
      ).not.toThrow();

      expect(getNotificationConnectionCount(LIMIT_USER_ID)).toBe(5);

      healthyConnections.forEach((connection) =>
        unregisterNotificationConnection(LIMIT_USER_ID, connection),
      );
      unregisterNotificationConnection(LIMIT_USER_ID, newConnection);
    });
  });

  describe("closeAllNotificationConnections", () => {
    const OTHER_USER_ID = "44444444-4444-4444-8444-444444444444";

    test("여러 사용자·여러 연결(같은 사용자 다중 탭 포함) 모두에 end()를 호출한다", () => {
      const firstTab = createMockResponse();
      const secondTab = createMockResponse();
      const otherUserConnection = createMockResponse();
      registerNotificationConnection(USER_ID, firstTab);
      registerNotificationConnection(USER_ID, secondTab);
      registerNotificationConnection(OTHER_USER_ID, otherUserConnection);

      closeAllNotificationConnections();

      expect(firstTab.end).toHaveBeenCalledTimes(1);
      expect(secondTab.end).toHaveBeenCalledTimes(1);
      expect(otherUserConnection.end).toHaveBeenCalledTimes(1);
    });

    test("호출 이후에는 Map이 비워져 publishNotificationToUser가 아무 연결에도 write하지 않는다", () => {
      const response = createMockResponse();
      registerNotificationConnection(USER_ID, response);

      closeAllNotificationConnections();
      publishNotificationToUser(USER_ID, payload);

      expect(response.write).not.toHaveBeenCalled();
    });

    test("일부 연결의 end()가 예외를 던져도 나머지 연결 정리가 멈추지 않는다", () => {
      const broken = {
        write: jest.fn(),
        end: jest.fn(() => {
          throw new Error("이미 끊어진 연결입니다.");
        }),
      } as unknown as Response;
      const healthy = createMockResponse();
      registerNotificationConnection(USER_ID, broken);
      registerNotificationConnection(OTHER_USER_ID, healthy);

      expect(() => closeAllNotificationConnections()).not.toThrow();
      expect(healthy.end).toHaveBeenCalledTimes(1);

      // Map이 완전히 비워졌는지(일부 실패가 clear()를 막지 않는지)도 함께 검증한다.
      publishNotificationToUser(OTHER_USER_ID, payload);
      expect(healthy.write).not.toHaveBeenCalled();
    });
  });
});
