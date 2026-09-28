/**
 * 알림 목록 query와 읽음 처리 path 검증이 기본값·경계값·잘못된 입력을 올바르게 처리하는지 확인합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import { encodeNotificationCursor } from "../../src/modules/notification/notification.cursor";
import {
  parseNotificationIdParams,
  parseNotificationListQuery,
} from "../../src/modules/notification/notification.validator";

describe("parseNotificationListQuery", () => {
  test("값이 없으면 기본 limit 10을 채운다", () => {
    expect(parseNotificationListQuery({})).toEqual({
      cursor: undefined,
      limit: 10,
      unreadOnly: undefined,
    });
  });

  test("unreadOnly=true를 boolean으로 변환한다", () => {
    const result = parseNotificationListQuery({ unreadOnly: "true" });

    expect(result.unreadOnly).toBe(true);
  });

  test("잘못된 unreadOnly 값은 VALIDATION_ERROR다", () => {
    expect(() => parseNotificationListQuery({ unreadOnly: "yes" })).toThrow(
      BadRequestError,
    );
  });

  test("limit이 50을 초과하면 VALIDATION_ERROR다", () => {
    expect(() => parseNotificationListQuery({ limit: "51" })).toThrow(
      BadRequestError,
    );
  });

  test("limit이 0 이하이면 VALIDATION_ERROR다", () => {
    expect(() => parseNotificationListQuery({ limit: "0" })).toThrow(
      BadRequestError,
    );
  });

  test("유효한 cursor는 복원해서 담는다", () => {
    const cursor = encodeNotificationCursor({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-09-11T03:00:00.000Z",
    });

    const result = parseNotificationListQuery({ cursor });

    expect(result.cursor).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-09-11T03:00:00.000Z",
    });
  });

  test("배열로 들어온 query 값은 VALIDATION_ERROR다", () => {
    expect(() =>
      parseNotificationListQuery({ limit: ["10", "20"] }),
    ).toThrow(BadRequestError);
  });
});

describe("parseNotificationIdParams", () => {
  test("UUID면 그대로 반환한다", () => {
    expect(
      parseNotificationIdParams({
        notificationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("UUID가 아니면 VALIDATION_ERROR다", () => {
    expect(() =>
      parseNotificationIdParams({ notificationId: "not-a-uuid" }),
    ).toThrow(BadRequestError);
  });
});
