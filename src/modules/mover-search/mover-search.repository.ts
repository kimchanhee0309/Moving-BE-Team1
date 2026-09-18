/**
 * 기사님 찾기 목록·상세·추천의 Prisma 조회만 담당합니다.
 * HTTP 객체와 정렬·페이지 규칙은 받지 않으며, 리뷰·찜·확정 견적 수는
 * Mover 컬럼이 아니라 groupBy 집계로 따로 읽습니다.
 *
 * 스키마에 서비스·지역 최소 개수 제약이 없어, 목록·추천 후보에서는
 * 인식 가능한 관계가 있는 mover만 남깁니다. 상세는 같은 카드 select로
 * 한 명을 읽고, 불완전 프로필 거절은 Service가 404로 처리합니다.
 *
 * 담당하지 않는 범위: 권한, DTO 조립, cookie/token, 찜·리뷰 CRUD
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
 * 목록·추천 후보의 Prisma where를 만듭니다.
 * services/regions가 비어도 알려진 값만 in 조건에 넣어, 관계가 없거나
 * 인식할 수 없는 프로필은 후보에서 제외합니다.
 *
 * @param query 검색어·지역·서비스 필터. 추천은 빈 배열로 호출해 필터 없이
 * 불완전 프로필만 제외합니다.
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
 * 필터에 맞는 mover id·경력만 모두 읽습니다.
 * 찜 수·평점은 Mover 컬럼이 아니라 이후 groupBy 집계이므로, 여기서 take로
 * 자르면 목록 페이지와 추천 상위 3명의 순위가 현재 조각만 기준으로 틀어집니다.
 * 데이터 증가 시 집계 컬럼 또는 JOIN ORDER BY LIMIT를 후속으로 둡니다.
 *
 * @param query 목록 필터. 추천은 지역·서비스 없이 같은 불완전 프로필 제외만 씁니다.
 * @returns 정렬 전 후보 행. 카드 본문은 포함하지 않습니다.
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

/**
 * 후보 mover의 리뷰 수·평점 평균·찜 수·확정 견적 수를 한 번에 집계합니다.
 * 리뷰가 없으면 해당 Map에 키가 없어 Service가 평점 0으로 채웁니다.
 *
 * @param moverIds 집계 대상. 빈 배열이면 DB를 치지 않습니다.
 * @returns moverId 키 맵. 값이 없는 id는 집계 0으로 취급합니다.
 */
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

/**
 * 목록 페이지·추천 상위 N명 카드에 필요한 프로필·서비스·지역 관계만 읽습니다.
 *
 * @param moverIds 이미 순위가 정해진 id. 빈 배열이면 조회하지 않습니다.
 * @returns 요청 id 중 존재하는 카드. 순서는 호출 측 정렬을 따릅니다.
 */
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

/**
 * 상세 조회용으로 한 명의 카드 레코드를 읽습니다.
 * 없거나 카드 select에 안 잡히면 null을 반환하고, 404는 Service가 결정합니다.
 *
 * @param moverId 경로의 mover UUID
 * @returns 카드 레코드. 없으면 null
 */
export async function findMoverSearchCardById(
  moverId: string,
): Promise<MoverSearchCardRecord | null> {
  const cards = await findMoverSearchCardsByIds([moverId]);
  return cards[0] ?? null;
}
