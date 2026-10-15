/**
 * 기사님 받은 요청 API의 Path Parameter, Query Parameter, Body를
 * Zod Schema로 검증합니다.
 */
import { z } from "zod";

import { parseWithZod } from "../../common/validation/zod-parser";
import {
  MOVER_REQUEST_SORT_LIST,
  SERVICE_TYPE_LIST,
  type GetReceivedRequestsQuery,
  type RejectReceivedRequestInput,
  type SendQuoteInput,
} from "./mover-request.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_KEYWORD_LENGTH = 50;
const MIN_COMMENT_LENGTH = 10;
const MAX_DATABASE_INT = 2_147_483_647;

/**
 * Query String의 앞뒤 공백을 제거합니다.
 * 빈 문자열은 값이 전달되지 않은 것과 동일하게 처리합니다.
 */
function trimOptionalQueryValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

const optionalKeywordSchema = z.preprocess(
  trimOptionalQueryValue,
  z
    .string({
      error: "하나의 문자열 값이어야 합니다.",
    })
    .max(MAX_KEYWORD_LENGTH, {
      error: `${MAX_KEYWORD_LENGTH}자 이하여야 합니다.`,
    })
    .optional(),
);

const optionalServiceTypeSchema = z.preprocess(
  trimOptionalQueryValue,
  z
    .enum(SERVICE_TYPE_LIST, {
      error: `${SERVICE_TYPE_LIST.join(", ")} 중 하나여야 합니다.`,
    })
    .optional(),
);

const optionalDesignatedSchema = z.preprocess(
  trimOptionalQueryValue,
  z
    .enum(["true", "false"], {
      error: "true 또는 false여야 합니다.",
    })
    .transform((value) => value === "true")
    .optional(),
);

const sortSchema = z.preprocess(
  trimOptionalQueryValue,
  z
    .enum(MOVER_REQUEST_SORT_LIST, {
      error: `${MOVER_REQUEST_SORT_LIST.join(", ")} 중 하나여야 합니다.`,
    })
    .default("REQUESTED_AT_DESC"),
);

const cursorSchema = z.preprocess(
  trimOptionalQueryValue,
  z
    .string({
      error: "하나의 문자열 값이어야 합니다.",
    })
    .regex(UUID_PATTERN, {
      error: "올바른 UUID 형식이 아닙니다.",
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
      error: "정수여야 합니다.",
    })
    .int({
      error: "정수여야 합니다.",
    })
    .min(1, {
      error: "1 이상이어야 합니다.",
    })
    .max(MAX_LIMIT, {
      error: `${MAX_LIMIT} 이하여야 합니다.`,
    }),
);

const getReceivedRequestsQuerySchema = z.object({
  keyword: optionalKeywordSchema,
  serviceType: optionalServiceTypeSchema,
  isDesignated: optionalDesignatedSchema,
  sort: sortSchema,
  cursor: cursorSchema,
  limit: limitSchema,
});

const receivedRequestIdSchema = z
  .string({
    error: "요청 ID는 문자열이어야 합니다.",
  })
  .regex(UUID_PATTERN, {
    error: "올바른 UUID 형식이어야 합니다.",
  });

const sendQuoteInputSchema = z.object({
  price: z
    .number({
      error: "견적가는 숫자여야 합니다.",
    })
    .int({
      error: "견적가는 정수여야 합니다.",
    })
    .min(1, {
      error: "견적가는 1원 이상이어야 합니다.",
    })
    .max(MAX_DATABASE_INT, {
      error: `견적가는 ${MAX_DATABASE_INT}원 이하여야 합니다.`,
    }),

  comment: z
    .string({
      error: "코멘트는 문자열이어야 합니다.",
    })
    .trim()
    .min(MIN_COMMENT_LENGTH, {
      error: `코멘트는 최소 ${MIN_COMMENT_LENGTH}자 이상 입력해야 합니다.`,
    }),
});

const rejectReceivedRequestInputSchema = z.object({
  reason: z
    .string({
      error: "반려 사유는 문자열이어야 합니다.",
    })
    .trim()
    .min(MIN_COMMENT_LENGTH, {
      error: `반려 사유는 최소 ${MIN_COMMENT_LENGTH}자 이상 입력해야 합니다.`,
    }),
});

export function parseGetReceivedRequestsQuery(
  value: unknown,
): GetReceivedRequestsQuery {
  return parseWithZod(getReceivedRequestsQuerySchema, value, {
    message: "받은 요청 조회 조건이 올바르지 않습니다.",
    fallbackField: "query",
  });
}

export function parseReceivedRequestId(value: unknown): string {
  return parseWithZod(receivedRequestIdSchema, value, {
    message: "요청 ID가 올바르지 않습니다.",
    fallbackField: "requestId",
  });
}

export function parseSendQuoteInput(value: unknown): SendQuoteInput {
  return parseWithZod(sendQuoteInputSchema, value, {
    message: "견적 정보가 올바르지 않습니다.",
    fallbackField: "body",
  });
}

export function parseRejectReceivedRequestInput(
  value: unknown,
): RejectReceivedRequestInput {
  return parseWithZod(rejectReceivedRequestInputSchema, value, {
    message: "반려 정보가 올바르지 않습니다.",
    fallbackField: "body",
  });
}
