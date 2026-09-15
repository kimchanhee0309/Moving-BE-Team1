/**
 * 기사님 받은 요청 API의 Path Parameter, Query Parameter, Body를 검증합니다.
 * 문자열 변환과 기본값 적용만 담당하고 DB 조회와 권한 검사는 Service에 위임합니다.
 */
import {
  BadRequestError,
  type ErrorDetails,
} from "../../common/errors/app-error";
import {
  MOVER_REQUEST_SORT_LIST,
  SERVICE_TYPE_LIST,
  type GetReceivedRequestsQuery,
  type MoverRequestSort,
  type RejectReceivedRequestInput,
  type SendQuoteInput,
  type ServiceTypeCode,
} from "./mover-request.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_KEYWORD_LENGTH = 50;
const MIN_COMMENT_LENGTH = 10;
const MAX_DATABASE_INT = 2_147_483_647;

function isServiceTypeCode(value: string): value is ServiceTypeCode {
  return SERVICE_TYPE_LIST.some((serviceType) => serviceType === value);
}

function isMoverRequestSort(value: string): value is MoverRequestSort {
  return MOVER_REQUEST_SORT_LIST.some((sort) => sort === value);
}

function getRecord(
  value: unknown,
  field: "query" | "body",
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(
      `${field === "query" ? "Query Parameter" : "요청 Body"}가 올바르지 않습니다.`,
      "VALIDATION_ERROR",
      [{ field, reason: "객체 형식이어야 합니다." }],
    );
  }

  return value as Record<string, unknown>;
}

function getOptionalQueryString(
  query: Record<string, unknown>,
  field: string,
  details: ErrorDetails,
): string | undefined {
  const value = query[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    details.push({
      field,
      reason: "하나의 문자열 값이어야 합니다.",
    });

    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function parseServiceType(
  value: string | undefined,
  details: ErrorDetails,
): ServiceTypeCode | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isServiceTypeCode(value)) {
    return value;
  }

  details.push({
    field: "serviceType",
    reason: `${SERVICE_TYPE_LIST.join(", ")} 중 하나여야 합니다.`,
  });

  return undefined;
}

function parseSort(
  value: string | undefined,
  details: ErrorDetails,
): MoverRequestSort {
  if (value === undefined) {
    return "REQUESTED_AT_DESC";
  }

  if (isMoverRequestSort(value)) {
    return value;
  }

  details.push({
    field: "sort",
    reason: `${MOVER_REQUEST_SORT_LIST.join(", ")} 중 하나여야 합니다.`,
  });

  return "REQUESTED_AT_DESC";
}

function parseOptionalBoolean(
  value: string | undefined,
  field: string,
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
    field,
    reason: "true 또는 false여야 합니다.",
  });

  return undefined;
}

function parseLimit(value: string | undefined, details: ErrorDetails): number {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  if (!/^\d+$/.test(value)) {
    details.push({
      field: "limit",
      reason: "정수여야 합니다.",
    });

    return DEFAULT_LIMIT;
  }

  const limit = Number(value);

  if (limit < 1 || limit > MAX_LIMIT) {
    details.push({
      field: "limit",
      reason: `1 이상 ${MAX_LIMIT} 이하여야 합니다.`,
    });

    return DEFAULT_LIMIT;
  }

  return limit;
}

function parseCursor(
  value: string | undefined,
  details: ErrorDetails,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!UUID_PATTERN.test(value)) {
    details.push({
      field: "cursor",
      reason: "올바른 UUID 형식이 아닙니다.",
    });

    return undefined;
  }

  return value;
}

function parseRequiredText(
  body: Record<string, unknown>,
  field: string,
  details: ErrorDetails,
): string {
  const value = body[field];

  if (typeof value !== "string") {
    details.push({
      field,
      reason: "문자열 값이 필요합니다.",
    });

    return "";
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length < MIN_COMMENT_LENGTH) {
    details.push({
      field,
      reason: `최소 ${MIN_COMMENT_LENGTH}자 이상 입력해야 합니다.`,
    });
  }

  return trimmedValue;
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

export function parseGetReceivedRequestsQuery(
  value: unknown,
): GetReceivedRequestsQuery {
  const query = getRecord(value, "query");
  const details: ErrorDetails = [];

  const keyword = getOptionalQueryString(query, "keyword", details);

  const serviceType = parseServiceType(
    getOptionalQueryString(query, "serviceType", details),
    details,
  );

  const isDesignated = parseOptionalBoolean(
    getOptionalQueryString(query, "isDesignated", details),
    "isDesignated",
    details,
  );

  const sort = parseSort(
    getOptionalQueryString(query, "sort", details),
    details,
  );

  const cursor = parseCursor(
    getOptionalQueryString(query, "cursor", details),
    details,
  );

  const limit = parseLimit(
    getOptionalQueryString(query, "limit", details),
    details,
  );

  if (keyword && keyword.length > MAX_KEYWORD_LENGTH) {
    details.push({
      field: "keyword",
      reason: `${MAX_KEYWORD_LENGTH}자 이하여야 합니다.`,
    });
  }

  throwIfInvalid(details);

  return {
    keyword,
    serviceType,
    isDesignated,
    sort,
    cursor,
    limit,
  };
}

export function parseReceivedRequestId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new BadRequestError(
      "요청 ID가 올바르지 않습니다.",
      "VALIDATION_ERROR",
      [{ field: "requestId", reason: "올바른 UUID 형식이어야 합니다." }],
    );
  }

  return value;
}

export function parseSendQuoteInput(value: unknown): SendQuoteInput {
  const body = getRecord(value, "body");
  const details: ErrorDetails = [];
  const rawPrice = body.price;

  let price = 0;

  if (
    typeof rawPrice !== "number" ||
    !Number.isSafeInteger(rawPrice) ||
    rawPrice <= 0 ||
    rawPrice > MAX_DATABASE_INT
  ) {
    details.push({
      field: "price",
      reason: `1 이상 ${MAX_DATABASE_INT} 이하의 정수여야 합니다.`,
    });
  } else {
    price = rawPrice;
  }

  const comment = parseRequiredText(body, "comment", details);

  throwIfInvalid(details);

  return {
    price,
    comment,
  };
}

export function parseRejectReceivedRequestInput(
  value: unknown,
): RejectReceivedRequestInput {
  const body = getRecord(value, "body");
  const details: ErrorDetails = [];
  const reason = parseRequiredText(body, "reason", details);

  throwIfInvalid(details);

  return {
    reason,
  };
}
