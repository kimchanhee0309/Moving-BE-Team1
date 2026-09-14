/**
 * 받은 견적 목록의 opaque cursor를 인코딩·복원합니다.
 * 위변조해도 customerId 필터는 Service가 다시 적용하므로 다른 고객 데이터는 노출되지 않습니다.
 */
import { BadRequestError } from "../../common/errors/app-error";
import {
  isReceivedQuoteSort,
  type ReceivedQuoteCursorPayload,
  type ReceivedQuoteSort,
} from "./customer-quote.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }

  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp);
}

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

  const payload = toRecord(parsed);

  if (typeof payload.sort !== "string" || !isReceivedQuoteSort(payload.sort) || payload.sort !== sort) {
    throw new BadRequestError(
      "요청값이 올바르지 않습니다.",
      "VALIDATION_ERROR",
      [{ field: "cursor", reason: "cursor와 sort가 일치하지 않습니다." }],
    );
  }

  if (typeof payload.id !== "string" || !UUID_PATTERN.test(payload.id)) {
    throwInvalidCursor();
  }

  if (sort === "CREATED_AT_DESC" && !isIsoDateTime(payload.createdAt)) {
    throwInvalidCursor();
  }

  if (sort === "MOVE_DATE_ASC" && !isIsoDateTime(payload.moveDate)) {
    throwInvalidCursor();
  }

  let price: number | null | undefined;

  if (sort === "PRICE_ASC") {
    if (payload.price === null) {
      price = null;
    } else if (typeof payload.price === "number" && Number.isInteger(payload.price)) {
      price = payload.price;
    } else {
      throwInvalidCursor();
    }
  }

  return {
    sort,
    id: payload.id,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : undefined,
    moveDate: typeof payload.moveDate === "string" ? payload.moveDate : undefined,
    price,
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throwInvalidCursor();
  }

  return value as Record<string, unknown>;
}
