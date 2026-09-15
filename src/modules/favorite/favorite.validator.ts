/**
 * Favorite API의 params·query를 Zod로 검증하고 정규화합니다.
 * HTTP 입력만 책임지며 기사님 존재 여부·중복 찜은 Service에 위임합니다.
 *
 * 처리 흐름: unknown 입력 → parseWithZod → DTO 반환 또는 VALIDATION_ERROR
 */
import { z } from "zod";

import { BadRequestError } from "../../common/errors/app-error";
import { parseWithZod } from "../../common/validation/zod-parser";
import type { FavoriteMoverIdParams, ListFavoritesQuery } from "./favorite.dto";

/** Prisma UUID와 같은 8-4-4-4-12 hex 형식입니다. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Query 정수는 선행 부호·소수·지수가 없는 십진 숫자만 받습니다. */
const POSITIVE_INTEGER_PATTERN = /^\d+$/;

/** 명세 템플릿 기본값: 첫 페이지, 10건, 최대 50건. */
export const FAVORITE_LIST_DEFAULT_PAGE = 1;
export const FAVORITE_LIST_DEFAULT_PAGE_SIZE = 10;
export const FAVORITE_LIST_MAX_PAGE_SIZE = 50;

/**
 * Prisma `skip`과 PostgreSQL INT4 OFFSET이 받을 수 있는 최댓값입니다.
 * 이보다 큰 skip은 DB 호출 전에 VALIDATION_ERROR로 거절합니다.
 */
export const FAVORITE_LIST_MAX_SKIP = 2_147_483_647;

/** page 자체도 같은 정수 상한을 적용합니다. skip은 pageSize와 곱한 뒤 한 번 더 검사합니다. */
export const FAVORITE_LIST_MAX_PAGE = FAVORITE_LIST_MAX_SKIP;

const moverIdParamsSchema = z
  .object({
    moverId: z
      .string({ error: "필수 UUID 값입니다." })
      .trim()
      .min(1, { error: "필수 UUID 값입니다." })
      .regex(UUID_PATTERN, { error: "UUID 형식이어야 합니다." }),
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

      // 안전 정수 밖의 값은 반올림되므로, 원문 숫자와 다르면 거절합니다.
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

const listFavoritesQuerySchema = z
  .object({
    page: queryPositiveInteger(FAVORITE_LIST_MAX_PAGE)
      .optional()
      .default(FAVORITE_LIST_DEFAULT_PAGE),
    pageSize: queryPositiveInteger(FAVORITE_LIST_MAX_PAGE_SIZE)
      .optional()
      .default(FAVORITE_LIST_DEFAULT_PAGE_SIZE),
  })
  .strip()
  .superRefine((query, context) => {
    // pageSize가 1보다 크면 page 상한만으로는 skip이 INT4를 넘을 수 있습니다.
    const skip = (query.page - 1) * query.pageSize;

    if (!Number.isSafeInteger(skip) || skip > FAVORITE_LIST_MAX_SKIP) {
      context.addIssue({
        code: "custom",
        path: ["page"],
        message: "조회 위치가 허용 범위를 넘습니다.",
      });
    }
  });

/**
 * POST/DELETE 경로의 moverId가 UUID인지 검사합니다.
 *
 * @param value Express `request.params`
 * @returns 정규화된 moverId
 * @throws BadRequestError VALIDATION_ERROR — UUID가 아니거나 비어 있는 경우
 */
export function parseMoverIdParam(value: unknown): FavoriteMoverIdParams {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(
      "요청값이 올바르지 않습니다.",
      "VALIDATION_ERROR",
      [{ field: "moverId", reason: "경로 파라미터가 필요합니다." }],
    );
  }

  return parseWithZod(moverIdParamsSchema, value, { fallbackField: "moverId" });
}

/**
 * GET /favorites의 page·pageSize를 검증합니다.
 * 기본값은 page=1, pageSize=10이며 pageSize는 50, page는 2147483647을 넘을 수 없습니다.
 * (page - 1) * pageSize가 Prisma skip 상한을 넘으면 DB 호출 전에 거절합니다.
 *
 * @param value Express `request.query`
 * @returns 정규화된 목록 Query
 * @throws BadRequestError VALIDATION_ERROR — 정수가 아니거나 범위를 벗어난 경우
 */
export function parseListFavoritesQuery(value: unknown): ListFavoritesQuery {
  if (
    value !== undefined &&
    (typeof value !== "object" || value === null || Array.isArray(value))
  ) {
    throw new BadRequestError(
      "요청값이 올바르지 않습니다.",
      "VALIDATION_ERROR",
      [{ field: "query", reason: "Query는 객체 형식이어야 합니다." }],
    );
  }

  return parseWithZod(listFavoritesQuerySchema, value ?? {}, {
    fallbackField: "query",
  });
}
