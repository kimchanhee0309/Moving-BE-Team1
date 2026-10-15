/**
 * 알림 목록의 opaque cursor를 인코딩·복원합니다.
 * 정렬은 createdAt desc, id desc 하나뿐이라 customer-quote.cursor.ts와 달리 sort 구분
 * 필드는 두지 않습니다. 위변조해도 userId 필터는 Service가 항상 다시 적용합니다.
 */
import { z } from "zod";

import { BadRequestError } from "../../common/errors/app-error";
import { parseWithZod } from "../../common/validation/zod-parser";
import type { NotificationCursorPayload } from "./notification.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 서버가 만드는 cursor는 Date.toISOString()이므로 날짜만 있는 값은 거절합니다.
 * Date.parse만 쓰면 "2026-08-02"가 자정으로 해석되어 키셋 페이지가 어긋납니다.
 */
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const notificationCursorSchema = z.object({
  id: z.string().regex(UUID_PATTERN),
  createdAt: z.string().regex(ISO_DATE_TIME_PATTERN),
});

function throwInvalidCursor(): never {
  throw new BadRequestError(
    "요청값이 올바르지 않습니다.",
    "VALIDATION_ERROR",
    [{ field: "cursor", reason: "올바른 목록 커서가 아닙니다." }],
  );
}

/**
 * 마지막 목록 항목의 정렬 키를 opaque cursor 문자열로 만듭니다.
 * @param payload 다음 페이지 키셋에 필요한 최소 필드
 * @returns URL-safe base64 cursor
 */
export function encodeNotificationCursor(
  payload: NotificationCursorPayload,
): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * query cursor를 키셋 값으로 복원합니다.
 * 실패 시 존재 여부를 구분하지 않고 동일한 VALIDATION_ERROR를 반환합니다.
 * @param value 클라이언트가 보낸 cursor 문자열
 */
export function decodeNotificationCursor(
  value: string,
): NotificationCursorPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throwInvalidCursor();
  }

  try {
    return parseWithZod(notificationCursorSchema, parsed, {
      fallbackField: "cursor",
    });
  } catch {
    throwInvalidCursor();
  }
}
