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

/** 명세 템플릿 기본값: 첫 페이지, 10건, 최대 50건. */
export const FAVORITE_LIST_DEFAULT_PAGE = 1;
export const FAVORITE_LIST_DEFAULT_PAGE_SIZE = 10;
export const FAVORITE_LIST_MAX_PAGE_SIZE = 50;

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
 * Express query 문자열을 양의 정수로 바꿉니다.
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

    if (typeof value !== "string" && typeof value !== "number") {
      context.addIssue({
        code: "custom",
        message: "1 이상의 정수여야 합니다.",
      });
      return z.NEVER;
    }

    const parsed = typeof value === "number" ? value : Number(value);

    if (!Number.isInteger(parsed) || parsed < 1) {
      context.addIssue({
        code: "custom",
        message: "1 이상의 정수여야 합니다.",
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
    page: queryPositiveInteger().optional().default(FAVORITE_LIST_DEFAULT_PAGE),
    pageSize: queryPositiveInteger(FAVORITE_LIST_MAX_PAGE_SIZE)
      .optional()
      .default(FAVORITE_LIST_DEFAULT_PAGE_SIZE),
  })
  .strip();

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
 * 기본값은 page=1, pageSize=10이며 pageSize는 50을 넘을 수 없습니다.
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
