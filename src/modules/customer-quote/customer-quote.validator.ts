/**
 * 받은 견적 대기·과거 목록 query와 상세·확정 path를 Zod로 검증합니다.
 * HTTP 입력 형식만 책임지며 소유권·상태 필터는 Service와 Repository에 위임합니다.
 */
import { z } from "zod";

import { parseWithZod } from "../../common/validation/zod-parser";
import { decodeReceivedQuoteCursor, decodeReceivedQuoteHistoryCursor } from "./customer-quote.cursor";
import {
  HISTORY_MOVE_REQUEST_STATUSES,
  RECEIVED_QUOTE_HISTORY_SORTS,
  RECEIVED_QUOTE_SORTS,
  SERVICE_TYPE_NAMES,
  type ReceivedQuoteHistoryQuery,
  type ReceivedQuotesQuery,
} from "./customer-quote.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_KEYWORD_LENGTH = 50;

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

const keywordSchema = optionalQueryStringSchema.transform((value, ctx) => {
  if (value === undefined) {
    return undefined;
  }

  const keyword = value.trim();

  if (keyword.length === 0) {
    return undefined;
  }

  if (keyword.length > MAX_KEYWORD_LENGTH) {
    ctx.addIssue({
      code: "custom",
      message: `${MAX_KEYWORD_LENGTH}자 이하여야 합니다.`,
    });
    return z.NEVER;
  }

  return keyword;
});

const serviceTypeSchema = optionalQueryStringSchema.transform((value, ctx) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === "SMALL" || value === "HOME" || value === "OFFICE") {
    return value;
  }

  ctx.addIssue({
    code: "custom",
    message: `${SERVICE_TYPE_NAMES.join(", ")}만 사용할 수 있습니다.`,
  });
  return z.NEVER;
});

const isDesignatedSchema = optionalQueryStringSchema.transform((value, ctx) => {
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

const sortSchema = optionalQueryStringSchema.transform((value, ctx) => {
  if (value === undefined || value === "") {
    return "CREATED_AT_DESC" as const;
  }

  if (
    value === "CREATED_AT_DESC" ||
    value === "MOVE_DATE_ASC" ||
    value === "PRICE_ASC"
  ) {
    return value;
  }

  ctx.addIssue({
    code: "custom",
    message: `${RECEIVED_QUOTE_SORTS.join(", ")}만 사용할 수 있습니다.`,
  });
  return z.NEVER;
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

const receivedQuotesQuerySchema = z.object({
  keyword: keywordSchema.optional(),
  serviceType: serviceTypeSchema.optional(),
  isDesignated: isDesignatedSchema.optional(),
  sort: sortSchema.optional().default("CREATED_AT_DESC"),
  cursor: optionalQueryStringSchema.optional(),
  limit: limitSchema.optional().default(DEFAULT_LIMIT),
});

const historySortSchema = optionalQueryStringSchema.transform((value, ctx) => {
  if (value === undefined || value === "") {
    return "UPDATED_AT_DESC" as const;
  }

  if (value === "UPDATED_AT_DESC" || value === "MOVE_DATE_DESC") {
    return value;
  }

  ctx.addIssue({
    code: "custom",
    message: `${RECEIVED_QUOTE_HISTORY_SORTS.join(", ")}만 사용할 수 있습니다.`,
  });
  return z.NEVER;
});

const moveRequestStatusSchema = optionalQueryStringSchema.transform(
  (value, ctx) => {
    if (value === undefined || value === "") {
      return undefined;
    }

    if (value === "CONFIRMED" || value === "COMPLETED") {
      return value;
    }

    ctx.addIssue({
      code: "custom",
      message: `${HISTORY_MOVE_REQUEST_STATUSES.join(", ")}만 사용할 수 있습니다.`,
    });
    return z.NEVER;
  },
);

const receivedQuoteHistoryQuerySchema = z.object({
  keyword: keywordSchema.optional(),
  serviceType: serviceTypeSchema.optional(),
  moveRequestStatus: moveRequestStatusSchema.optional(),
  sort: historySortSchema.optional().default("UPDATED_AT_DESC"),
  cursor: optionalQueryStringSchema.optional(),
  limit: limitSchema.optional().default(DEFAULT_LIMIT),
});

const quoteIdParamsSchema = z.object({
  quoteId: z.unknown().transform((value, ctx) => {
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
 * Express query를 받은 견적 목록 조회로 변환합니다.
 * @param value request.query
 * @returns 기본값이 채워진 조회 조건
 * @throws BadRequestError query 형식이 잘못된 경우 VALIDATION_ERROR
 */
export function parseReceivedQuotesQuery(value: unknown): ReceivedQuotesQuery {
  const query = parseWithZod(receivedQuotesQuerySchema, value, {
    fallbackField: "query",
  });
  const cursorValue = query.cursor?.trim();

  return {
    keyword: query.keyword,
    serviceType: query.serviceType,
    isDesignated: query.isDesignated,
    sort: query.sort,
    cursor:
      cursorValue && cursorValue.length > 0
        ? decodeReceivedQuoteCursor(cursorValue, query.sort)
        : undefined,
    limit: query.limit,
  };
}

/**
 * 견적 상세 path의 quoteId를 UUID로 검증합니다.
 * @param value request.params
 * @returns 정규화된 quoteId
 * @throws BadRequestError UUID가 아니면 VALIDATION_ERROR
 */
export function parseQuoteIdParams(value: unknown): string {
  const params = parseWithZod(quoteIdParamsSchema, value, {
    fallbackField: "quoteId",
  });

  return params.quoteId;
}

/**
 * Express query를 과거 확정 견적 목록 조회로 변환합니다.
 * @param value request.query
 * @returns 기본값이 채워진 과거 목록 조건
 * @throws BadRequestError query 형식이 잘못된 경우 VALIDATION_ERROR
 */
export function parseReceivedQuoteHistoryQuery(
  value: unknown,
): ReceivedQuoteHistoryQuery {
  const query = parseWithZod(receivedQuoteHistoryQuerySchema, value, {
    fallbackField: "query",
  });
  const cursorValue = query.cursor?.trim();

  return {
    keyword: query.keyword,
    serviceType: query.serviceType,
    moveRequestStatus: query.moveRequestStatus,
    sort: query.sort,
    cursor:
      cursorValue && cursorValue.length > 0
        ? decodeReceivedQuoteHistoryCursor(cursorValue, query.sort)
        : undefined,
    limit: query.limit,
  };
}
