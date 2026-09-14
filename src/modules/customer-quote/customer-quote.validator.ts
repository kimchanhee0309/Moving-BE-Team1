/**
 * 받은 견적 목록 query를 런타임에 검증하고 기본값을 채웁니다.
 * HTTP query 형식만 책임지며 소유권·상태 필터는 Service와 Repository에 위임합니다.
 */
import { BadRequestError, type ErrorDetails } from "../../common/errors/app-error";
import { decodeReceivedQuoteCursor } from "./customer-quote.cursor";
import {
  RECEIVED_QUOTE_SORTS,
  SERVICE_TYPE_NAMES,
  isReceivedQuoteSort,
  isServiceTypeName,
  type ReceivedQuoteSort,
  type ReceivedQuotesQuery,
  type ServiceTypeName,
} from "./customer-quote.dto";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_KEYWORD_LENGTH = 50;

function getQueryRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(
      "요청값이 올바르지 않습니다.",
      "VALIDATION_ERROR",
      [{ field: "query", reason: "query 객체 형식이어야 합니다." }],
    );
  }

  return value as Record<string, unknown>;
}

function getOptionalSingleString(
  query: Record<string, unknown>,
  field: string,
  details: ErrorDetails,
): string | undefined {
  const value = query[field];

  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    details.push({ field, reason: "하나의 값만 허용합니다." });
    return undefined;
  }

  if (typeof value !== "string") {
    details.push({ field, reason: "문자열이어야 합니다." });
    return undefined;
  }

  return value;
}

function throwIfInvalid(details: ErrorDetails): void {
  if (details.length > 0) {
    throw new BadRequestError(
      "요청값이 올바르지 않습니다.",
      "VALIDATION_ERROR",
      details,
    );
  }
}

function parseKeyword(
  value: string | undefined,
  details: ErrorDetails,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const keyword = value.trim();

  if (keyword.length === 0) {
    return undefined;
  }

  if (keyword.length > MAX_KEYWORD_LENGTH) {
    details.push({
      field: "keyword",
      reason: `${MAX_KEYWORD_LENGTH}자 이하여야 합니다.`,
    });
    return undefined;
  }

  return keyword;
}

function parseServiceType(
  value: string | undefined,
  details: ErrorDetails,
): ServiceTypeName | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isServiceTypeName(value)) {
    return value;
  }

  details.push({
    field: "serviceType",
    reason: `${SERVICE_TYPE_NAMES.join(", ")}만 사용할 수 있습니다.`,
  });
  return undefined;
}

function parseIsDesignated(
  value: string | undefined,
  details: ErrorDetails,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  details.push({
    field: "isDesignated",
    reason: "true 또는 false여야 합니다.",
  });
  return undefined;
}

function parseSort(
  value: string | undefined,
  details: ErrorDetails,
): ReceivedQuoteSort {
  if (value === undefined || value === "") {
    return "CREATED_AT_DESC";
  }

  if (isReceivedQuoteSort(value)) {
    return value;
  }

  details.push({
    field: "sort",
    reason: `${RECEIVED_QUOTE_SORTS.join(", ")}만 사용할 수 있습니다.`,
  });
  return "CREATED_AT_DESC";
}

function parseLimit(value: string | undefined, details: ErrorDetails): number {
  if (value === undefined || value === "") {
    return DEFAULT_LIMIT;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    details.push({
      field: "limit",
      reason: "1 이상 50 이하의 정수여야 합니다.",
    });
    return DEFAULT_LIMIT;
  }

  const limit = Number(value);

  if (limit < 1 || limit > MAX_LIMIT) {
    details.push({
      field: "limit",
      reason: "1 이상 50 이하의 정수여야 합니다.",
    });
    return DEFAULT_LIMIT;
  }

  return limit;
}

/**
 * Express query를 받은 견적 목록 조회로 변환합니다.
 * @param value request.query
 * @returns 기본값이 채워진 조회 조건
 * @throws BadRequestError query 형식이 잘못된 경우 VALIDATION_ERROR
 */
export function parseReceivedQuotesQuery(value: unknown): ReceivedQuotesQuery {
  const query = getQueryRecord(value);
  const details: ErrorDetails = [];
  const keyword = parseKeyword(
    getOptionalSingleString(query, "keyword", details),
    details,
  );
  const serviceType = parseServiceType(
    getOptionalSingleString(query, "serviceType", details),
    details,
  );
  const isDesignated = parseIsDesignated(
    getOptionalSingleString(query, "isDesignated", details),
    details,
  );
  const sort = parseSort(getOptionalSingleString(query, "sort", details), details);
  const limit = parseLimit(getOptionalSingleString(query, "limit", details), details);
  const cursorValue = getOptionalSingleString(query, "cursor", details)?.trim();

  throwIfInvalid(details);

  const cursor =
    cursorValue && cursorValue.length > 0
      ? decodeReceivedQuoteCursor(cursorValue, sort)
      : undefined;

  return {
    keyword,
    serviceType,
    isDesignated,
    sort,
    cursor,
    limit,
  };
}
