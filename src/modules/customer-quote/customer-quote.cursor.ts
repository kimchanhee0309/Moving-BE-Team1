/**
 * 받은 견적 목록의 opaque cursor를 인코딩·복원합니다.
 * JSON 형태는 Zod로 검사하고, 위변조해도 customerId 필터는 Service가 다시 적용합니다.
 */
import { z } from "zod";

import { BadRequestError } from "../../common/errors/app-error";
import { parseWithZod } from "../../common/validation/zod-parser";
import {
  isReceivedQuoteHistorySort,
  isReceivedQuoteSort,
  type ReceivedQuoteCursorPayload,
  type ReceivedQuoteHistoryCursorPayload,
  type ReceivedQuoteHistorySort,
  type ReceivedQuoteSort,
} from "./customer-quote.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isoDateTimeSchema = z.string().refine((value) => {
  return value.trim() !== "" && !Number.isNaN(Date.parse(value));
});

const receivedQuoteCursorSchema = z.object({
  sort: z.string(),
  id: z.string().regex(UUID_PATTERN),
  createdAt: z.string().optional(),
  moveDate: z.string().optional(),
  price: z.union([z.number().int(), z.null()]).optional(),
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
export function encodeReceivedQuoteCursor(
  payload: ReceivedQuoteCursorPayload,
): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * query cursor를 키셋 값으로 복원하고 현재 sort와 일치하는지 확인합니다.
 * 실패 시 존재 여부를 구분하지 않고 동일한 VALIDATION_ERROR를 반환합니다.
 * @param value 클라이언트가 보낸 cursor 문자열
 * @param sort 이번 요청의 정렬
 */
export function decodeReceivedQuoteCursor(
  value: string,
  sort: ReceivedQuoteSort,
): ReceivedQuoteCursorPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throwInvalidCursor();
  }

  let payload: z.infer<typeof receivedQuoteCursorSchema>;

  try {
    payload = parseWithZod(receivedQuoteCursorSchema, parsed, {
      fallbackField: "cursor",
    });
  } catch {
    throwInvalidCursor();
  }

  if (!isReceivedQuoteSort(payload.sort) || payload.sort !== sort) {
    throw new BadRequestError(
      "요청값이 올바르지 않습니다.",
      "VALIDATION_ERROR",
      [{ field: "cursor", reason: "cursor와 sort가 일치하지 않습니다." }],
    );
  }

  if (sort === "CREATED_AT_DESC" && !isoDateTimeSchema.safeParse(payload.createdAt).success) {
    throwInvalidCursor();
  }

  if (sort === "MOVE_DATE_ASC" && !isoDateTimeSchema.safeParse(payload.moveDate).success) {
    throwInvalidCursor();
  }

  if (sort === "PRICE_ASC" && payload.price === undefined) {
    throwInvalidCursor();
  }

  return {
    sort,
    id: payload.id,
    createdAt: payload.createdAt,
    moveDate: payload.moveDate,
    price: payload.price,
  };
}

const receivedQuoteHistoryCursorSchema = z.object({
  sort: z.string(),
  id: z.string().regex(UUID_PATTERN),
  updatedAt: z.string().optional(),
  moveDate: z.string().optional(),
});

/**
 * 과거 목록 마지막 항목의 정렬 키를 opaque cursor로 만듭니다.
 * @param payload 다음 페이지 키셋에 필요한 최소 필드
 */
export function encodeReceivedQuoteHistoryCursor(
  payload: ReceivedQuoteHistoryCursorPayload,
): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * 과거 목록 cursor를 복원하고 현재 sort와 일치하는지 확인합니다.
 * @param value 클라이언트가 보낸 cursor 문자열
 * @param sort 이번 요청의 정렬
 */
export function decodeReceivedQuoteHistoryCursor(
  value: string,
  sort: ReceivedQuoteHistorySort,
): ReceivedQuoteHistoryCursorPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throwInvalidCursor();
  }

  let payload: z.infer<typeof receivedQuoteHistoryCursorSchema>;

  try {
    payload = parseWithZod(receivedQuoteHistoryCursorSchema, parsed, {
      fallbackField: "cursor",
    });
  } catch {
    throwInvalidCursor();
  }

  if (!isReceivedQuoteHistorySort(payload.sort) || payload.sort !== sort) {
    throw new BadRequestError(
      "요청값이 올바르지 않습니다.",
      "VALIDATION_ERROR",
      [{ field: "cursor", reason: "cursor와 sort가 일치하지 않습니다." }],
    );
  }

  if (sort === "UPDATED_AT_DESC" && !isoDateTimeSchema.safeParse(payload.updatedAt).success) {
    throwInvalidCursor();
  }

  if (sort === "MOVE_DATE_DESC" && !isoDateTimeSchema.safeParse(payload.moveDate).success) {
    throwInvalidCursor();
  }

  return {
    sort,
    id: payload.id,
    updatedAt: payload.updatedAt,
    moveDate: payload.moveDate,
  };
}
