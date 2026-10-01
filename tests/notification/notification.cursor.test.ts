/**
 * 알림 목록 opaque cursor가 정렬 키를 왕복하고 잘못된 값을 거절하는지 검증합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from "../../src/modules/notification/notification.cursor";

describe("Notification cursor", () => {
  test("id와 createdAt을 그대로 왕복한다", () => {
    const encoded = encodeNotificationCursor({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-09-11T03:00:00.000Z",
    });

    expect(decodeNotificationCursor(encoded)).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-09-11T03:00:00.000Z",
    });
  });

  test("base64url로 디코딩할 수 없는 문자열은 VALIDATION_ERROR다", () => {
    expect(() => decodeNotificationCursor("not-a-cursor")).toThrow(
      BadRequestError,
    );
  });

  test("id가 UUID 형식이 아니면 VALIDATION_ERROR다", () => {
    const encoded = Buffer.from(
      JSON.stringify({ id: "not-a-uuid", createdAt: "2026-09-11T03:00:00.000Z" }),
      "utf8",
    ).toString("base64url");

    expect(() => decodeNotificationCursor(encoded)).toThrow(BadRequestError);
  });

  test("날짜만 있는 createdAt은 거절한다", () => {
    const encoded = Buffer.from(
      JSON.stringify({
        id: "11111111-1111-4111-8111-111111111111",
        createdAt: "2026-09-11",
      }),
      "utf8",
    ).toString("base64url");

    expect(() => decodeNotificationCursor(encoded)).toThrow(BadRequestError);
  });
});
