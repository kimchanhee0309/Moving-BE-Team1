/**
 * 기사님 찾기 목록의 Prisma 조회를 담당합니다.
 * 필터·검색 대상 선정만 하며 정렬·페이지 계산은 Service가 합니다.
 * 스키마에 서비스·지역 최소 개수 제약이 없어, 검색에서는 인식 가능한
 * 관계가 있는 mover만 포함해 totalCount와 페이지에 반영합니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  MOVER_SERVICE_TYPES,
  REGION_DB_NAMES,
  REGION_TO_DB_NAME,
} from "./mover-search.constants";
import type { MoverSearchQuery } from "./mover-search.dto";

export interface MoverSearchSortRow {
  id: string;
  careerYears: number;
}

export interface MoverSearchCardRecord {
  id: string;
  nickname: string;
  shortIntroduction: string;
  description: string;
  profileImageUrl: string | null;
  careerYears: number;
  serviceTypes: Array<{ serviceType: { name: string } }>;
  regions: Array<{ region: { name: string } }>;
}

export interface MoverSearchAggregates {
  reviewCountByMoverId: Map<string, number>;
  ratingByMoverId: Map<string, number | null>;
  favoriteCountByMoverId: Map<string, number>;
  confirmedCountByMoverId: Map<string, number>;
}

/**
 * 목록 필터를 Prisma where로 만듭니다.
 *
 * @param query 검증된 찾기 목록 query
 * @returns 인식 가능한 서비스·지역이 있는 mover만 남기는 조건
 */
export function createMoverSearchWhere(
  query: MoverSearchQuery,
): Prisma.MoverWhereInput {
  const regionDbNames = query.regions.map(
    (region) => REGION_TO_DB_NAME[region],
  );

  return {
    ...(query.search
      ? {
          // 부분 일치 ILIKE는 nickname btree를 타지 않습니다. 후속으로 trigram을 검토합니다.
          nickname: {
            contains: query.search,
            mode: "insensitive",
          },
        }
      : {}),
    serviceTypes: {
      some: {
        serviceType: {
          name: {
            in:
              query.services.length > 0
                ? query.services
                : [...MOVER_SERVICE_TYPES],
          },
        },
      },
    },
    regions: {
      some: {
        region: {
          name: {
            in:
              regionDbNames.length > 0
                ? [...regionDbNames]
                : [...REGION_DB_NAMES],
          },
        },
      },
    },
  };
}

/**
 * 집계 정렬에 필요한 id·경력을 모읍니다.
 * take로 자르면 리뷰·평점 정렬이 현재 페이지 데이터만 기준으로 틀어지므로
 * 필터된 행을 모두 가져오고, 데이터 증가 시 집계 컬럼·DB 정렬을 후속으로 둡니다.
 *
 * @param query 검증된 찾기 목록 query
 * @returns 필터된 mover의 id와 경력. 정렬·페이지는 Service가 계산합니다.
 */
export function findFilteredMoverSortRows(
  query: MoverSearchQuery,
): Promise<MoverSearchSortRow[]> {
  return prisma.mover.findMany({
    where: createMoverSearchWhere(query),
    select: {
      id: true,
      careerYears: true,
    },
  });
}

export async function findMoverSearchAggregates(
  moverIds: string[],
): Promise<MoverSearchAggregates> {
  if (moverIds.length === 0) {
    return {
      reviewCountByMoverId: new Map(),
      ratingByMoverId: new Map(),
      favoriteCountByMoverId: new Map(),
      confirmedCountByMoverId: new Map(),
    };
  }

  const [reviewGroups, favoriteGroups, confirmedGroups] = await Promise.all([
    prisma.review.groupBy({
      by: ["moverId"],
      where: { moverId: { in: moverIds } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.favorite.groupBy({
      by: ["moverId"],
      where: { moverId: { in: moverIds } },
      _count: { _all: true },
    }),
    prisma.quote.groupBy({
      by: ["moverId"],
      where: {
        moverId: { in: moverIds },
        status: "CONFIRMED",
      },
      _count: { _all: true },
    }),
  ]);

  return {
    reviewCountByMoverId: new Map(
      reviewGroups.map((row) => [row.moverId, row._count._all]),
    ),
    ratingByMoverId: new Map(
      reviewGroups.map((row) => [row.moverId, row._avg.rating]),
    ),
    favoriteCountByMoverId: new Map(
      favoriteGroups.map((row) => [row.moverId, row._count._all]),
    ),
    confirmedCountByMoverId: new Map(
      confirmedGroups.map((row) => [row.moverId, row._count._all]),
    ),
  };
}

export function findMoverSearchCardsByIds(
  moverIds: string[],
): Promise<MoverSearchCardRecord[]> {
  if (moverIds.length === 0) {
    return Promise.resolve([]);
  }

  return prisma.mover.findMany({
    where: { id: { in: moverIds } },
    select: {
      id: true,
      nickname: true,
      shortIntroduction: true,
      description: true,
      profileImageUrl: true,
      careerYears: true,
      serviceTypes: {
        select: {
          serviceType: {
            select: { name: true },
          },
        },
      },
      regions: {
        select: {
          region: {
            select: { name: true },
          },
        },
      },
    },
  });
}
