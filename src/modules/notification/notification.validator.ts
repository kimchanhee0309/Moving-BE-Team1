/**
 * 알림 목록 query와 읽음 처리 path를 Zod로 검증합니다.
 * HTTP 입력 형식만 책임지며 소유권 필터는 Service와 Repository에 위임합니다.
 *
 * DEFAULT_LIMIT/MAX_LIMIT은 팀이 승인한 Swagger에 아직 확정되지 않아 customer-quote
 * 모듈과 같은 기본값(10, 최대 50)을 잠정 적용했습니다. 확정 명세가 나오면 함께 갱신해야 합니다.
 */
import { z } from "zod";

import { parseWithZod } from "../../common/validation/zod-parser";
import { decodeNotificationCursor } from "./notification.cursor";
import type { NotificationListQuery } from "./notification.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Express query는 같은 키가 반복되면 배열이 되므로 목록 API는 값 1개만 받습니다.
 * 실패 시 입력 원문은 남기지 않고 field/reason만 채웁니다.
 */
const optionalQueryStringSchema = z.unknown().transform((value, ctx) => {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    ctx.addIssue({
      code: "custom",
      message: "하나의 값만 허용합니다.",
    });
    return z.NEVER;
  }

  if (typeof value !== "string") {
    ctx.addIssue({
      code: "custom",
      message: "문자열이어야 합니다.",
    });
    return z.NEVER;
  }

  return value;
});

const limitSchema = optionalQueryStringSchema.transform((value, ctx) => {
  if (value === undefined || value === "") {
    return DEFAULT_LIMIT;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    ctx.addIssue({
      code: "custom",
      message: "1 이상 50 이하의 정수여야 합니다.",
    });
    return z.NEVER;
  }

  const limit = Number(value);

  if (limit < 1 || limit > MAX_LIMIT) {
    ctx.addIssue({
      code: "custom",
      message: "1 이상 50 이하의 정수여야 합니다.",
    });
    return z.NEVER;
  }

  return limit;
});

const unreadOnlySchema = optionalQueryStringSchema.transform((value, ctx) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  ctx.addIssue({
    code: "custom",
    message: "true 또는 false여야 합니다.",
  });
  return z.NEVER;
});

const notificationListQuerySchema = z.object({
  cursor: optionalQueryStringSchema.optional(),
  limit: limitSchema.optional().default(DEFAULT_LIMIT),
  unreadOnly: unreadOnlySchema.optional(),
});

const notificationIdParamsSchema = z.object({
  notificationId: z.unknown().transform((value, ctx) => {
    if (Array.isArray(value)) {
      ctx.addIssue({
        code: "custom",
        message: "하나의 값만 허용합니다.",
      });
      return z.NEVER;
    }

    if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "UUID 형식이어야 합니다.",
      });
      return z.NEVER;
    }

    return value;
  }),
});

/**
 * Express query를 알림 목록 조회 조건으로 변환합니다.
 * @param value request.query
 * @returns 기본값이 채워진 조회 조건
 * @throws BadRequestError query 형식이 잘못된 경우 VALIDATION_ERROR
 */
export function parseNotificationListQuery(
  value: unknown,
): NotificationListQuery {
  const query = parseWithZod(notificationListQuerySchema, value, {
    fallbackField: "query",
  });
  const cursorValue = query.cursor?.trim();

  return {
    cursor:
      cursorValue && cursorValue.length > 0
        ? decodeNotificationCursor(cursorValue)
        : undefined,
    limit: query.limit,
    unreadOnly: query.unreadOnly,
  };
}

/**
 * 알림 읽음 처리 path의 notificationId를 UUID로 검증합니다.
 * @param value request.params
 * @returns 정규화된 notificationId
 * @throws BadRequestError UUID가 아니면 VALIDATION_ERROR
 */
export function parseNotificationIdParams(value: unknown): string {
  const params = parseWithZod(notificationIdParamsSchema, value, {
    fallbackField: "notificationId",
  });

  return params.notificationId;
}
