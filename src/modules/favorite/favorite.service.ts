/**
 * Favorite의 소유권·중복·대상 존재 규칙을 검증한 뒤 Repository에 영속을 위임합니다.
 * Express 객체에 의존하지 않으며 customerId는 profiled guard가 확인한 Customer.id만 받습니다.
 *
 * 처리 흐름: 입력 식별자 수신 → 기사님/중복/존재 검사 → DB 처리 → 응답 DTO 변환
 */

import { ConflictError, NotFoundError } from "../../common/errors/app-error";
import type {
  FavoriteDto,
  FavoriteListDto,
  FavoriteMoverDto,
  ListFavoritesQuery,
} from "./favorite.dto";
import {
  countFavoritesByCustomer,
  createFavorite,
  deleteFavoriteByCustomerAndMover,
  findFavoriteByCustomerAndMover,
  findFavoritesByCustomer,
  findMoverId,
  type FavoriteRecord,
} from "./favorite.repository";

/** 전역 error handler와 같이 Prisma 원문 클래스에 의존하지 않고 unique 충돌만 식별합니다. */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

/**
 * 리뷰 평점 평균을 소수점 첫째 자리로 반올림합니다.
 * 리뷰가 없으면 카드에 0점을 보여주지 않도록 null을 반환합니다.
 */
function toAverageRating(ratings: { rating: number }[]): number | null {
  if (ratings.length === 0) {
    return null;
  }

  const total = ratings.reduce((sum, review) => sum + review.rating, 0);
  return Math.round((total / ratings.length) * 10) / 10;
}

/** Prisma Favorite 레코드를 비밀번호·내부 FK 없이 API DTO로 변환합니다. */
function toFavoriteDto(record: FavoriteRecord): FavoriteDto {
  const mover: FavoriteMoverDto = {
    id: record.mover.id,
    nickname: record.mover.nickname,
    profileImageUrl: record.mover.profileImageUrl,
    careerYears: record.mover.careerYears,
    shortIntroduction: record.mover.shortIntroduction,
    serviceTypes: record.mover.serviceTypes.map((item) => item.serviceType.name),
    regions: record.mover.regions.map((item) => item.region.name),
    reviewCount: record.mover.reviews.length,
    averageRating: toAverageRating(record.mover.reviews),
    favoriteCount: record.mover._count.favorites,
  };

  return {
    id: record.id,
    moverId: record.moverId,
    createdAt: record.createdAt.toISOString(),
    mover,
  };
}

/**
 * 특정 기사님을 찜합니다.
 * 기사님이 없으면 404, 이미 찜한 경우 409로 거절해 unique (customerId, moverId)를 지킵니다.
 *
 * @param customerId requireProfile이 확인한 Customer.id
 * @param moverId 경로의 기사님 UUID
 * @returns 생성된 찜과 기사님 카드
 * @throws NotFoundError MOVER_NOT_FOUND — 기사님 프로필이 없는 경우
 * @throws ConflictError FAVORITE_ALREADY_EXISTS — 같은 기사님을 이미 찜한 경우
 * @sideEffects Favorite 행을 추가합니다.
 */
export async function addFavorite(
  customerId: string,
  moverId: string,
): Promise<FavoriteDto> {
  const mover = await findMoverId(moverId);

  if (!mover) {
    throw new NotFoundError("기사님을 찾을 수 없습니다.", "MOVER_NOT_FOUND");
  }

  const existing = await findFavoriteByCustomerAndMover(customerId, moverId);

  if (existing) {
    throw new ConflictError("이미 찜한 기사님입니다.", "FAVORITE_ALREADY_EXISTS");
  }

  try {
    const created = await createFavorite(customerId, moverId);
    return toFavoriteDto(created);
  } catch (error: unknown) {
    // 동시에 같은 찜을 등록하면 사전 조회와 생성 사이에 unique 충돌이 납니다.
    if (isUniqueConstraintError(error)) {
      throw new ConflictError("이미 찜한 기사님입니다.", "FAVORITE_ALREADY_EXISTS");
    }

    throw error;
  }
}

/**
 * 인증 고객의 찜 목록을 최신순으로 페이지 조회합니다.
 * 다른 고객의 Favorite는 where.customerId로 제외합니다.
 *
 * @param customerId requireProfile이 확인한 Customer.id
 * @param query 검증된 page·pageSize
 * @returns items와 page 기반 pagination
 */
export async function listFavorites(
  customerId: string,
  query: ListFavoritesQuery,
): Promise<FavoriteListDto> {
  const skip = (query.page - 1) * query.pageSize;
  const [totalCount, records] = await Promise.all([
    countFavoritesByCustomer(customerId),
    findFavoritesByCustomer(customerId, skip, query.pageSize),
  ]);

  const totalPages =
    totalCount === 0 ? 0 : Math.ceil(totalCount / query.pageSize);

  return {
    items: records.map(toFavoriteDto),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalCount,
      totalPages,
    },
  };
}

/**
 * 본인이 찜한 기사님만 해제합니다.
 * 찜이 없으면 이미 해제된 상태로 보고 404를 반환해 중복 해제를 구분합니다.
 *
 * @param customerId requireProfile이 확인한 Customer.id
 * @param moverId 경로의 기사님 UUID
 * @throws NotFoundError FAVORITE_NOT_FOUND — 해당 고객의 찜이 없는 경우
 * @sideEffects Favorite 행을 삭제합니다.
 */
export async function removeFavorite(
  customerId: string,
  moverId: string,
): Promise<void> {
  const result = await deleteFavoriteByCustomerAndMover(customerId, moverId);

  if (result.count === 0) {
    throw new NotFoundError("찜한 기사님을 찾을 수 없습니다.", "FAVORITE_NOT_FOUND");
  }
}
