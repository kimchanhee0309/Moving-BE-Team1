/**
 * Review API의 params·query·body를 Zod로 검증하고 정규화합니다.
 * HTTP 입력만 책임지며 요청 소유권·완료 상태·중복 리뷰는 Service에 위임합니다.
 *
 * 처리 흐름: unknown 입력 → parseWithZod → DTO 반환 또는 VALIDATION_ERROR
 */
import { z } from "zod";

import { BadRequestError } from "../../common/errors/app-error";
import { parseWithZod } from "../../common/validation/zod-parser";
import type {
  CreateReviewInput,
  ListCustomerReviewsQuery,
  ListReviewsQuery,
  ReviewMoverIdParams,
} from "./review.dto";

/** Prisma UUID와 같은 8-4-4-4-12 hex 형식입니다. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Query 정수는 선행 부호·소수·지수가 없는 십진 숫자만 받습니다. */
const POSITIVE_INTEGER_PATTERN = /^\d+$/;

/** Favorite와 같은 Page 기본값: 첫 페이지, 10건, 최대 50건. */
export const REVIEW_LIST_DEFAULT_PAGE = 1;
export const REVIEW_LIST_DEFAULT_PAGE_SIZE = 10;
export const REVIEW_LIST_MAX_PAGE_SIZE = 50;

/**
 * Prisma `skip`과 PostgreSQL INT4 OFFSET이 받을 수 있는 최댓값입니다.
 * 이보다 큰 skip은 DB 호출 전에 VALIDATION_ERROR로 거절합니다.
 */
export const REVIEW_LIST_MAX_SKIP = 2_147_483_647;

/** page 자체도 같은 정수 상한을 적용합니다. skip은 pageSize와 곱한 뒤 한 번 더 검사합니다. */
export const REVIEW_LIST_MAX_PAGE = REVIEW_LIST_MAX_SKIP;

/** 평점은 Prisma Int이며 화면의 별점 1~5만 허용합니다. */
export const REVIEW_MIN_RATING = 1;
export const REVIEW_MAX_RATING = 5;

/** 리뷰 본문은 공백만 있는 글을 막고, Text 컬럼을 무제한으로 받지 않기 위한 길이입니다. */
export const REVIEW_CONTENT_MIN_LENGTH = 10;
export const REVIEW_CONTENT_MAX_LENGTH = 500;

const uuidSchema = z
  .string({ error: "필수 UUID 값입니다." })
  .trim()
  .min(1, { error: "필수 UUID 값입니다." })
  .regex(UUID_PATTERN, { error: "UUID 형식이어야 합니다." });

const moverIdParamsSchema = z
  .object({
    moverId: uuidSchema,
  })
  .strip();

/**
 * Express query 문자열을 안전한 양의 정수로 바꿉니다.
 * Number()만 쓰면 큰 값이 반올림된 채 통과하므로 십진 문자열과 Number.isSafeInteger를 함께 봅니다.
 * 배열·소수·범위 초과는 VALIDATION_ERROR details로 남기고, 생략은 schema default가 채웁니다.
 */
function queryPositiveInteger(max?: number) {
  return z.unknown().transform((value, context) => {
    if (Array.isArray(value)) {
      context.addIssue({
        code: "custom",
        message: "하나의 숫자만 허용합니다.",
      });
      return z.NEVER;
    }

    let parsed: number;

    if (typeof value === "number") {
      parsed = value;
    } else if (typeof value === "string") {
      const trimmed = value.trim();

      if (!POSITIVE_INTEGER_PATTERN.test(trimmed)) {
        context.addIssue({
          code: "custom",
          message: "1 이상의 정수여야 합니다.",
        });
        return z.NEVER;
      }

      parsed = Number(trimmed);

      if (String(parsed) !== trimmed) {
        context.addIssue({
          code: "custom",
          message: "허용된 정수 범위를 벗어났습니다.",
        });
        return z.NEVER;
      }
    } else {
      context.addIssue({
        code: "custom",
        message: "1 이상의 정수여야 합니다.",
      });
      return z.NEVER;
    }

    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      context.addIssue({
        code: "custom",
        message:
          parsed < 1
            ? "1 이상의 정수여야 합니다."
            : "허용된 정수 범위를 벗어났습니다.",
      });
      return z.NEVER;
    }

    if (max !== undefined && parsed > max) {
      context.addIssue({
        code: "custom",
        message: `${max} 이하여야 합니다.`,
      });
      return z.NEVER;
    }

    return parsed;
  });
}

const listReviewsPageSchema = z
  .object({
    page: queryPositiveInteger(REVIEW_LIST_MAX_PAGE)
      .optional()
      .default(REVIEW_LIST_DEFAULT_PAGE),
    pageSize: queryPositiveInteger(REVIEW_LIST_MAX_PAGE_SIZE)
      .optional()
      .default(REVIEW_LIST_DEFAULT_PAGE_SIZE),
  })
  .strip();

/**
 * pageSize가 1보다 크면 page 상한만으로는 skip이 INT4를 넘을 수 있어 곱한 값을 한 번 더 검사합니다.
 */
function refineListSkip<T extends { page: number; pageSize: number }>(
  schema: z.ZodType<T>,
) {
  return schema.superRefine((query, context) => {
    const skip = (query.page - 1) * query.pageSize;

    if (!Number.isSafeInteger(skip) || skip > REVIEW_LIST_MAX_SKIP) {
      context.addIssue({
        code: "custom",
        path: ["page"],
        message: "조회 위치가 허용 범위를 넘습니다.",
      });
    }
  });
}

const listReviewsQuerySchema = refineListSkip(listReviewsPageSchema);

const customerReviewTypeSchema = z.unknown().transform((value, context) => {
  if (Array.isArray(value)) {
    context.addIssue({
      code: "custom",
      message: "하나의 값만 허용합니다.",
    });
    return z.NEVER;
  }

  if (typeof value !== "string") {
    context.addIssue({
      code: "custom",
      message: "WRITABLE 또는 WRITTEN만 사용할 수 있습니다.",
    });
    return z.NEVER;
  }

  const normalized = value.trim().toUpperCase();

  if (normalized !== "WRITABLE" && normalized !== "WRITTEN") {
    context.addIssue({
      code: "custom",
      message: "WRITABLE 또는 WRITTEN만 사용할 수 있습니다.",
    });
    return z.NEVER;
  }

  return normalized;
});

const listCustomerReviewsQuerySchema = refineListSkip(
  listReviewsPageSchema.extend({
    type: customerReviewTypeSchema,
  }),
);

const createReviewBodySchema = z
  .object({
    moveRequestId: uuidSchema,
    rating: z
      .number({ error: "1부터 5 사이의 정수여야 합니다." })
      .int({ error: "1부터 5 사이의 정수여야 합니다." })
      .min(REVIEW_MIN_RATING, { error: "1부터 5 사이의 정수여야 합니다." })
      .max(REVIEW_MAX_RATING, { error: "1부터 5 사이의 정수여야 합니다." }),
    content: z
      .string({ error: "리뷰 내용을 입력해 주세요." })
      .trim()
      .min(REVIEW_CONTENT_MIN_LENGTH, {
        error: `${REVIEW_CONTENT_MIN_LENGTH}자 이상이어야 합니다.`,
      })
      .max(REVIEW_CONTENT_MAX_LENGTH, {
        error: `${REVIEW_CONTENT_MAX_LENGTH}자 이하여야 합니다.`,
      }),
  })
  .strict();

function assertObjectInput(
  value: unknown,
  fallbackField: string,
  reason: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError("요청값이 올바르지 않습니다.", "VALIDATION_ERROR", [
      { field: fallbackField, reason },
    ]);
  }
}

/**
 * GET /movers/:moverId/reviews 경로의 moverId가 UUID인지 검사합니다.
 *
 * @param value Express `request.params`
 * @returns 정규화된 moverId
 * @throws BadRequestError VALIDATION_ERROR — UUID가 아니거나 비어 있는 경우
 */
export function parseMoverIdParam(value: unknown): ReviewMoverIdParams {
  assertObjectInput(value, "moverId", "경로 파라미터가 필요합니다.");
  return parseWithZod(moverIdParamsSchema, value, { fallbackField: "moverId" });
}

/**
 * 기사님 받은 리뷰 목록의 page·pageSize를 검증합니다.
 * 기본값은 page=1, pageSize=10이며 pageSize는 50, page는 2147483647을 넘을 수 없습니다.
 * (page - 1) * pageSize가 Prisma skip 상한을 넘으면 DB 호출 전에 거절합니다.
 *
 * @param value Express `request.query`
 * @returns 정규화된 목록 Query
 * @throws BadRequestError VALIDATION_ERROR — 정수가 아니거나 범위를 벗어난 경우
 */
export function parseListReviewsQuery(value: unknown): ListReviewsQuery {
  if (
    value !== undefined &&
    (typeof value !== "object" || value === null || Array.isArray(value))
  ) {
    throw new BadRequestError("요청값이 올바르지 않습니다.", "VALIDATION_ERROR", [
      { field: "query", reason: "Query는 객체 형식이어야 합니다." },
    ]);
  }

  return parseWithZod(listReviewsQuerySchema, value ?? {}, {
    fallbackField: "query",
  });
}

/**
 * GET /customers/me/reviews의 type·page·pageSize를 검증합니다.
 * type은 탭 구분이라 생략할 수 없습니다.
 *
 * @param value Express `request.query`
 * @returns 정규화된 고객 리뷰 목록 Query
 * @throws BadRequestError VALIDATION_ERROR — type이 없거나 페이지 값이 잘못된 경우
 */
export function parseListCustomerReviewsQuery(
  value: unknown,
): ListCustomerReviewsQuery {
  if (
    value !== undefined &&
    (typeof value !== "object" || value === null || Array.isArray(value))
  ) {
    throw new BadRequestError("요청값이 올바르지 않습니다.", "VALIDATION_ERROR", [
      { field: "query", reason: "Query는 객체 형식이어야 합니다." },
    ]);
  }

  return parseWithZod(listCustomerReviewsQuerySchema, value ?? {}, {
    fallbackField: "query",
  });
}

/**
 * POST /reviews Body의 moveRequestId·rating·content를 검증합니다.
 *
 * @param value Express `request.body`
 * @returns 정규화된 작성 입력
 * @throws BadRequestError VALIDATION_ERROR — UUID·평점·본문 길이 오류
 */
export function parseCreateReviewInput(value: unknown): CreateReviewInput {
  assertObjectInput(value, "body", "요청 Body가 필요합니다.");
  return parseWithZod(createReviewBodySchema, value, { fallbackField: "body" });
}
