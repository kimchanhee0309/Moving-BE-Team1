/**
 * 기사님 견적 관리 API의 Path Parameter와 Query Parameter를 Zod로 검증
 * 문자열 Query를 DTO 타입으로 변환하고 공통 VALIDATION_ERROR 형식으로 전달
 */

import { z } from "zod";

import { parseWithZod } from "../../common/validation/zod-parser";
import {
  MOVER_QUOTE_STATUS_LIST,
  type GetMoverQuotesQuery,
  type GetRejectedRequestsQuery,
} from "./mover-quote.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * 선택 Query String의 앞뒤 공백 제거
 * 빈 문자열은 전달되지 않은 값으로 처리
 */
function trimOptionalQueryValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

const optionalQuoteStatusSchema = z.preprocess(
  trimOptionalQueryValue,
  z
    .enum(MOVER_QUOTE_STATUS_LIST, {
      error: `${MOVER_QUOTE_STATUS_LIST.join(", ")} 중 하나여야 합니다.`,
    })
    .optional(),
);

const optionalCursorSchema = z.preprocess(
  trimOptionalQueryValue,
  z
    .string({
      error: "cursor는 하나의 문자열이어야 합니다.",
    })
    .regex(UUID_PATTERN, {
      error: "cursor는 올바른 UUID 형식이어야 합니다.",
    })
    .optional(),
);

const limitSchema = z.preprocess(
  (value: unknown) => {
    const normalizedValue = trimOptionalQueryValue(value);

    if (normalizedValue === undefined) {
      return DEFAULT_LIMIT;
    }

    if (typeof normalizedValue === "string" && /^\d+$/.test(normalizedValue)) {
      return Number(normalizedValue);
    }

    return normalizedValue;
  },
  z
    .number({
      error: "limit은 정수여야 합니다.",
    })
    .int({
      error: "limit는 정수어야 합니다.",
    })
    .max(MAX_LIMIT, {
      error: `limit은 ${MAX_LIMIT} 이하여야 합니다.`,
    }),
);

const getMoverQuotesQuerySchema = z
  .object({
    status: optionalQuoteStatusSchema,
    cursor: optionalCursorSchema,
    limit: limitSchema,
  })
  .strict();

const getRejectedRequestsQuerySchema = z
  .object({
    cursor: optionalCursorSchema,
    limit: limitSchema,
  })
  .strict();

const quoteIdSchema = z
  .string({
    error: "견적 ID는 문자열이어야 합니다.",
  })
  .regex(UUID_PATTERN, {
    error: "견적 ID는 올바른 UUID 형식이어야 합니다.",
  });

/**
 * 보낸 견적 목록의 Query Parameter를 검증
 *
 * @param value Express의 request.query
 * @returns 상태 필터와 pagination의 정규화된 Query DTO
 * @throws BadrequestError Query 형식이 잘못된 경우
 */

export function parseGetMoverQuotesQuery(value: unknown): GetMoverQuotesQuery {
  return parseWithZod(getMoverQuotesQuerySchema, value, {
    message: "보낸 견적 조회 조건이 올바르지 않습니다.",
    fallbackField: "query",
  });
}

/**
 * 반려한 요청 목록의 Query Parameter를 검증
 *
 * @param value Express의 request.query
 * @returns pagination이 정규화된 Query DTO
 * @throws BadRequestError Query 형식이 잘못된 경우
 */
export function parseGetRejectedRequestsQuery(
  value: unknown,
): GetRejectedRequestsQuery {
  return parseWithZod(getRejectedRequestsQuerySchema, value, {
    message: "반려 요청 조회 조건이 올바르지 않습니다.",
    fallbackField: "query",
  });
}

/**
 *
 * @param value Express의 request.params.quoteId
 * @returns 검증된 견적 UUID
 * @throws BadRequestError UUID 형식이 잘못된 경우
 */
export function parseMoverQuoteId(value: unknown): string {
  return parseWithZod(quoteIdSchema, value, {
    message: "견적 ID가 올바르지 않습니다.",
    fallbackField: "quoteId",
  });
}
