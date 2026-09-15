/**
 * Favorite Service가 필요한 Prisma 조회·생성·삭제만 수행합니다.
 * HTTP 객체와 권한 판단은 받지 않으며, 목록은 N+1을 피하도록 관계와 집계를 한 번에 가져옵니다.
 *
 * 담당하지 않는 범위: 역할 검사, DTO 조립, cookie/token 처리
 */

import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

/** 목록·등록 응답에 필요한 Mover 카드와 찜 수 집계만 선택합니다. 리뷰 행은 가져오지 않습니다. */
const favoriteMoverSelect = {
  id: true,
  nickname: true,
  profileImageUrl: true,
  careerYears: true,
  shortIntroduction: true,
  serviceTypes: {
    select: {
      serviceType: {
        select: {
          name: true,
        },
      },
    },
  },
  regions: {
    select: {
      region: {
        select: {
          name: true,
        },
      },
    },
  },
  _count: {
    select: {
      favorites: true,
    },
  },
} satisfies Prisma.MoverSelect;

const favoriteSelect = {
  id: true,
  moverId: true,
  createdAt: true,
  mover: {
    select: favoriteMoverSelect,
  },
} satisfies Prisma.FavoriteSelect;

type FavoriteRow = Prisma.FavoriteGetPayload<{
  select: typeof favoriteSelect;
}>;

/**
 * Prisma Favorite 행에 DB에서 집계한 리뷰 개수·평균만 붙인 레코드입니다.
 * 개별 Review 행은 포함하지 않습니다.
 */
export type FavoriteRecord = Omit<FavoriteRow, "mover"> & {
  mover: FavoriteRow["mover"] & {
    reviewCount: number;
    averageRating: number | null;
  };
};

/** Prisma AVG 결과를 JS number로 바꿉니다. 리뷰가 없으면 null입니다. */
function toNullableAverage(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Number(value);
}

/**
 * 페이지의 기사님들에 대해 Review COUNT/AVG를 한 번에 집계합니다.
 * 리뷰가 없는 기사님은 groupBy 결과에 없으므로 0건·null로 채웁니다.
 */
async function withReviewStats(rows: FavoriteRow[]): Promise<FavoriteRecord[]> {
  if (rows.length === 0) {
    return [];
  }

  const moverIds = [...new Set(rows.map((row) => row.moverId))];
  const stats = await prisma.review.groupBy({
    by: ["moverId"],
    where: {
      moverId: {
        in: moverIds,
      },
    },
    _count: {
      _all: true,
    },
    _avg: {
      rating: true,
    },
  });

  const statsByMoverId = new Map(
    stats.map((item) => [
      item.moverId,
      {
        reviewCount: item._count._all,
        averageRating: toNullableAverage(item._avg.rating),
      },
    ]),
  );

  return rows.map((row) => {
    const review = statsByMoverId.get(row.moverId) ?? {
      reviewCount: 0,
      averageRating: null,
    };

    return {
      ...row,
      mover: {
        ...row.mover,
        reviewCount: review.reviewCount,
        averageRating: review.averageRating,
      },
    };
  });
}

async function attachReviewStats(row: FavoriteRow): Promise<FavoriteRecord> {
  const records = await withReviewStats([row]);
  const record = records[0];

  if (record === undefined) {
    return {
      ...row,
      mover: {
        ...row.mover,
        reviewCount: 0,
        averageRating: null,
      },
    };
  }

  return record;
}

/**
 * 찜 대상 기사님이 실제로 존재하는지 확인합니다.
 * 없는 moverId로 Favorite를 만들면 FK 오류가 나므로 Service가 404로 바꾸기 위해 먼저 조회합니다.
 */
export function findMoverId(moverId: string): Promise<{ id: string } | null> {
  return prisma.mover.findUnique({
    where: { id: moverId },
    select: { id: true },
  });
}

/**
 * 같은 고객·기사님 찜이 이미 있는지 확인합니다.
 * unique (customerId, moverId) 충돌을 사용자 오류로 바꾸기 위해 생성 전에 조회합니다.
 */
export function findFavoriteByCustomerAndMover(
  customerId: string,
  moverId: string,
): Promise<{ id: string } | null> {
  return prisma.favorite.findUnique({
    where: {
      customerId_moverId: {
        customerId,
        moverId,
      },
    },
    select: { id: true },
  });
}

/**
 * 찜을 생성하고 응답에 필요한 기사님 카드까지 함께 반환합니다.
 * 동시 요청이 unique 제약을 어기면 Prisma P2002가 나며 Service가 409로 변환합니다.
 */
export async function createFavorite(
  customerId: string,
  moverId: string,
): Promise<FavoriteRecord> {
  const created = await prisma.favorite.create({
    data: {
      customerId,
      moverId,
    },
    select: favoriteSelect,
  });

  return attachReviewStats(created);
}

/**
 * 고객의 찜을 최신순으로 페이지 조회합니다.
 * skip/take로 한 페이지 분량만 읽고, 리뷰는 mover별 COUNT/AVG만 추가로 집계합니다.
 */
export async function findFavoritesByCustomer(
  customerId: string,
  skip: number,
  take: number,
): Promise<FavoriteRecord[]> {
  const rows = await prisma.favorite.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: favoriteSelect,
  });

  return withReviewStats(rows);
}

/** 목록 pagination의 totalCount를 계산하기 위해 해당 고객의 찜 전체 건수를 셉니다. */
export function countFavoritesByCustomer(customerId: string): Promise<number> {
  return prisma.favorite.count({
    where: { customerId },
  });
}

/**
 * 본인 찜만 삭제합니다.
 * 대상이 없으면 count 0을 반환해 Service가 404를 결정할 수 있게 합니다.
 */
export function deleteFavoriteByCustomerAndMover(
  customerId: string,
  moverId: string,
): Promise<Prisma.BatchPayload> {
  return prisma.favorite.deleteMany({
    where: {
      customerId,
      moverId,
    },
  });
}
