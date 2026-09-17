import { z } from "zod";

import { parseWithZod } from "../../common/validation/zod-parser";
import {
  DEFAULT_MOVER_SEARCH_PAGE_SIZE,
  MAX_MOVER_SEARCH_LENGTH,
  MAX_MOVER_SEARCH_PAGE,
  MAX_MOVER_SEARCH_PAGE_SIZE,
  MOVER_REGIONS,
  MOVER_SEARCH_SORTS,
  MOVER_SERVICE_TYPES,
  isMoverRegion,
  isMoverSearchSort,
  isMoverServiceType,
} from "./mover-search.constants";
import type { MoverSearchQuery } from "./mover-search.dto";

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

const searchSchema = optionalQueryStringSchema.transform((value, ctx) => {
  if (value === undefined) {
    return undefined;
  }

  const search = value.trim();

  if (search.length === 0) {
    return undefined;
  }

  if (search.length > MAX_MOVER_SEARCH_LENGTH) {
    ctx.addIssue({
      code: "custom",
      message: `${MAX_MOVER_SEARCH_LENGTH}자 이하여야 합니다.`,
    });
    return z.NEVER;
  }

  return search;
});

function parseCommaSeparatedValues<T extends string>(
  value: string | undefined,
  isAllowed: (token: string) => token is T,
  reason: string,
  ctx: z.RefinementCtx,
): T[] | typeof z.NEVER {
  if (value === undefined) {
    return [];
  }

  const tokens = [
    ...new Set(
      value
        .split(",")
        .map((token) => token.trim())
        .filter((token) => token.length > 0),
    ),
  ];

  if (tokens.some((token) => !isAllowed(token))) {
    ctx.addIssue({
      code: "custom",
      message: reason,
    });
    return z.NEVER;
  }

  return tokens.filter(isAllowed);
}

const regionsSchema = optionalQueryStringSchema.transform((value, ctx) => {
  const regions = parseCommaSeparatedValues(
    value,
    isMoverRegion,
    `${MOVER_REGIONS.join(", ")}만 사용할 수 있습니다.`,
    ctx,
  );

  return regions;
});

const servicesSchema = optionalQueryStringSchema.transform((value, ctx) => {
  const services = parseCommaSeparatedValues(
    value,
    isMoverServiceType,
    `${MOVER_SERVICE_TYPES.join(", ")}만 사용할 수 있습니다.`,
    ctx,
  );

  return services;
});

const sortSchema = optionalQueryStringSchema.transform((value, ctx) => {
  if (value === undefined || value === "") {
    return "reviewCount" as const;
  }

  if (isMoverSearchSort(value)) {
    return value;
  }

  ctx.addIssue({
    code: "custom",
    message: `${MOVER_SEARCH_SORTS.join(", ")}만 사용할 수 있습니다.`,
  });
  return z.NEVER;
});

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  ctx: z.RefinementCtx,
): number | typeof z.NEVER {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    ctx.addIssue({
      code: "custom",
      message: `${min} 이상 ${max} 이하의 정수여야 합니다.`,
    });
    return z.NEVER;
  }

  const parsed = Number(value);

  if (parsed < min || parsed > max) {
    ctx.addIssue({
      code: "custom",
      message: `${min} 이상 ${max} 이하의 정수여야 합니다.`,
    });
    return z.NEVER;
  }

  return parsed;
}

const pageSchema = optionalQueryStringSchema.transform((value, ctx) => {
  return parsePositiveInteger(value, 1, 1, MAX_MOVER_SEARCH_PAGE, ctx);
});

const pageSizeSchema = optionalQueryStringSchema.transform((value, ctx) => {
  return parsePositiveInteger(
    value,
    DEFAULT_MOVER_SEARCH_PAGE_SIZE,
    1,
    MAX_MOVER_SEARCH_PAGE_SIZE,
    ctx,
  );
});

const moverSearchQuerySchema = z.object({
  search: searchSchema.optional(),
  regions: regionsSchema.optional().default([]),
  services: servicesSchema.optional().default([]),
  sort: sortSchema.optional().default("reviewCount"),
  page: pageSchema.optional().default(1),
  pageSize: pageSizeSchema.optional().default(DEFAULT_MOVER_SEARCH_PAGE_SIZE),
});

export function parseMoverSearchQuery(value: unknown): MoverSearchQuery {
  const query = parseWithZod(moverSearchQuerySchema, value, {
    fallbackField: "query",
  });

  return {
    search: query.search,
    regions: query.regions,
    services: query.services,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  };
}
