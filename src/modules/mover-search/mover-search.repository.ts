import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { REGION_TO_DB_NAME } from "./mover-search.constants";
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

function createMoverSearchWhere(
  query: MoverSearchQuery,
): Prisma.MoverWhereInput {
  const regionDbNames = query.regions.map(
    (region) => REGION_TO_DB_NAME[region],
  );

  return {
    ...(query.search
      ? {
          nickname: {
            contains: query.search,
            mode: "insensitive",
          },
        }
      : {}),
    ...(query.services.length > 0
      ? {
          serviceTypes: {
            some: {
              serviceType: {
                name: { in: query.services },
              },
            },
          },
        }
      : {}),
    ...(regionDbNames.length > 0
      ? {
          regions: {
            some: {
              region: {
                name: { in: [...regionDbNames] },
              },
            },
          },
        }
      : {}),
  };
}

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
