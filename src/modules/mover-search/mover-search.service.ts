/**
 * 기사님 찾기 목록·상세·추천의 정렬·대표값·불완전 프로필 제외를 담당합니다.
 * Express 객체에 의존하지 않으며 Prisma는 Repository에 위임합니다.
 *
 * 찜 여부·리뷰 본문·지정 견적은 해당 담당 API가 생긴 뒤 연결합니다.
 * 목록·추천 카드는 대표 서비스와 보유 서비스 배열을 함께 내리고, 없으면 카드를 제외합니다.
 */
import { NotFoundError } from "../../common/errors/app-error";
import {
  DB_NAME_TO_REGION,
  MOVER_REGIONS,
  RECOMMENDED_MOVER_LIMIT,
  SERVICE_TYPE_PRIORITY,
  isMoverServiceType,
  type MoverRegion,
  type MoverServiceType,
} from "./mover-search.constants";
import type {
  MoverSearchDetailDto,
  MoverSearchItemDto,
  MoverSearchListResult,
  MoverSearchQuery,
  MoverSearchRecommendedResult,
} from "./mover-search.dto";
import {
  findFilteredMoverSortRows,
  findMoverSearchAggregates,
  findMoverSearchCardById,
  findMoverSearchCardsByIds,
  type MoverSearchAggregates,
  type MoverSearchCardRecord,
  type MoverSearchSortRow,
} from "./mover-search.repository";

interface RankedMover {
  id: string;
  careerYears: number;
  rating: number;
  reviewCount: number;
  confirmedCount: number;
  favoriteCount: number;
}

function toAverageRating(value: number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return Math.round(value * 10) / 10;
}

function toRankedMover(
  row: MoverSearchSortRow,
  aggregates: MoverSearchAggregates,
): RankedMover {
  return {
    id: row.id,
    careerYears: row.careerYears,
    rating: toAverageRating(aggregates.ratingByMoverId.get(row.id)),
    reviewCount: aggregates.reviewCountByMoverId.get(row.id) ?? 0,
    confirmedCount: aggregates.confirmedCountByMoverId.get(row.id) ?? 0,
    favoriteCount: aggregates.favoriteCountByMoverId.get(row.id) ?? 0,
  };
}

function compareRankedMovers(
  left: RankedMover,
  right: RankedMover,
  sort: MoverSearchQuery["sort"],
): number {
  const delta = right[sort] - left[sort];

  if (delta !== 0) {
    return delta;
  }

  return left.id.localeCompare(right.id);
}

function compareRecommendedMovers(left: RankedMover, right: RankedMover): number {
  const favoriteDelta = right.favoriteCount - left.favoriteCount;

  if (favoriteDelta !== 0) {
    return favoriteDelta;
  }

  const ratingDelta = right.rating - left.rating;

  if (ratingDelta !== 0) {
    return ratingDelta;
  }

  return left.id.localeCompare(right.id);
}

function listOwnedServiceTypes(names: string[]): MoverServiceType[] {
  const owned = new Set(names.filter(isMoverServiceType));
  return SERVICE_TYPE_PRIORITY.filter((serviceType) => owned.has(serviceType));
}

function listOwnedRegions(dbNames: string[]): MoverRegion[] {
  const owned = new Set(
    dbNames.flatMap((name) => {
      const region = DB_NAME_TO_REGION[name];
      return region ? [region] : [];
    }),
  );

  return MOVER_REGIONS.filter((region) => owned.has(region));
}

function pickRepresentativeRegion(dbNames: string[]): string | undefined {
  return listOwnedRegions(dbNames)[0];
}

function toMoverSearchItem(
  record: MoverSearchCardRecord,
  ranked: RankedMover,
): MoverSearchItemDto | undefined {
  const serviceTypes = listOwnedServiceTypes(
    record.serviceTypes.map((entry) => entry.serviceType.name),
  );
  const serviceType = serviceTypes[0];
  const region = pickRepresentativeRegion(
    record.regions.map((entry) => entry.region.name),
  );

  if (!serviceType || !region) {
    return undefined;
  }

  return {
    id: record.id,
    serviceType,
    serviceTypes,
    region,
    moverName: record.nickname,
    introduction: record.shortIntroduction,
    description: record.description,
    profileImageUrl: record.profileImageUrl,
    rating: ranked.rating,
    reviewCount: ranked.reviewCount,
    careerYears: record.careerYears,
    confirmedCount: ranked.confirmedCount,
    favoriteCount: ranked.favoriteCount,
  };
}

function toMoverSearchDetail(
  record: MoverSearchCardRecord,
  ranked: RankedMover,
): MoverSearchDetailDto | undefined {
  const item = toMoverSearchItem(record, ranked);

  if (!item) {
    return undefined;
  }

  return {
    ...item,
    regions: listOwnedRegions(record.regions.map((entry) => entry.region.name)),
  };
}

function toMoverSearchItems(
  pageRows: RankedMover[],
  cards: MoverSearchCardRecord[],
): MoverSearchItemDto[] {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const rankedById = new Map(pageRows.map((row) => [row.id, row]));

  return pageRows.flatMap((row) => {
    const card = cardById.get(row.id);
    const rankedMover = rankedById.get(row.id);

    if (!card || !rankedMover) {
      return [];
    }

    const item = toMoverSearchItem(card, rankedMover);
    return item ? [item] : [];
  });
}

/** 사이드바 추천은 지역·서비스 필터 없이, 목록과 같은 불완전 프로필 제외만 적용합니다. */
const RECOMMENDED_FILTER_QUERY: MoverSearchQuery = {
  regions: [],
  services: [],
  sort: "reviewCount",
  page: 1,
  pageSize: RECOMMENDED_MOVER_LIMIT,
};

/**
 * 필터된 기사님을 집계 기준으로 정렬한 뒤 page 단위로 잘라 반환합니다.
 * totalCount는 인식 가능한 서비스·지역이 있는 mover 기준이며, 정렬 전에
 * take로 후보를 자르지 않습니다.
 *
 * @param query validator가 파싱한 검색·필터·정렬·페이지
 * @returns items, nextPage, totalCount
 */
export async function listMovers(
  query: MoverSearchQuery,
): Promise<MoverSearchListResult> {
  const sortRows = await findFilteredMoverSortRows(query);
  const aggregates = await findMoverSearchAggregates(
    sortRows.map((row) => row.id),
  );
  const ranked = sortRows
    .map((row) => toRankedMover(row, aggregates))
    .sort((left, right) => compareRankedMovers(left, right, query.sort));

  const start = (query.page - 1) * query.pageSize;
  const pageRows = ranked.slice(start, start + query.pageSize);
  const cards = await findMoverSearchCardsByIds(pageRows.map((row) => row.id));
  const items = toMoverSearchItems(pageRows, cards);

  const hasNext = start + pageRows.length < ranked.length;

  return {
    items,
    nextPage: hasNext ? query.page + 1 : null,
    totalCount: ranked.length,
  };
}

/**
 * 공개 상세 카드 한 명을 반환합니다.
 * 없거나 서비스·지역을 인식할 수 없으면 404 MOVER_NOT_FOUND로 거절합니다.
 * isFavorite는 이 API 범위가 아닙니다.
 *
 * @param moverId 경로 UUID. 인증 주체와 무관합니다.
 * @returns 목록 카드 필드에 보유 서비스·지역 배열을 더한 상세 DTO
 * @throws {NotFoundError} 대상 없음 또는 불완전 프로필
 */
export async function getMoverById(
  moverId: string,
): Promise<MoverSearchDetailDto> {
  const record = await findMoverSearchCardById(moverId);

  if (!record) {
    throw new NotFoundError("기사님을 찾을 수 없습니다.", "MOVER_NOT_FOUND");
  }

  const aggregates = await findMoverSearchAggregates([moverId]);
  const ranked = toRankedMover(
    { id: record.id, careerYears: record.careerYears },
    aggregates,
  );
  const mover = toMoverSearchDetail(record, ranked);

  if (!mover) {
    throw new NotFoundError("기사님을 찾을 수 없습니다.", "MOVER_NOT_FOUND");
  }

  return mover;
}

/**
 * 비회원 사이드바용 추천 상위 3명을 반환합니다.
 * 지역·서비스 필터는 쓰지 않지만, 목록과 같은 불완전 프로필 제외 where는 유지합니다.
 *
 * 찜 수·평점이 Mover 컬럼이 아니므로 DB LIMIT 3만 넣으면 임의 3명의 순위가 됩니다.
 * 후보를 집계·정렬한 뒤 slice하고, JOIN ORDER BY LIMIT 또는 집계 컬럼은 후속으로 둡니다.
 *
 * @returns 찜 수 내림차순, 같으면 평점 내림차순, 같으면 id 오름차순인 items. 최대 3명
 */
export async function listRecommendedMovers(): Promise<MoverSearchRecommendedResult> {
  const sortRows = await findFilteredMoverSortRows(RECOMMENDED_FILTER_QUERY);
  const aggregates = await findMoverSearchAggregates(
    sortRows.map((row) => row.id),
  );
  // LIMIT을 쿼리에 두면 집계 전 임의 행이 잘리므로, 순위가 정해진 뒤에만 3명으로 자릅니다.
  const ranked = sortRows
    .map((row) => toRankedMover(row, aggregates))
    .sort(compareRecommendedMovers)
    .slice(0, RECOMMENDED_MOVER_LIMIT);
  const cards = await findMoverSearchCardsByIds(ranked.map((row) => row.id));

  return {
    items: toMoverSearchItems(ranked, cards),
  };
}
