/**
 * 찜 여부·리뷰 본문·지정 견적은 해당 담당 API가 생긴 뒤 연결합니다.
 * 목록 카드의 대표 서비스·지역은 실제 보유 값만 쓰고, 없으면 카드를 제외합니다.
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

function pickRepresentativeServiceType(
  names: string[],
): MoverServiceType | undefined {
  return listOwnedServiceTypes(names)[0];
}

function pickRepresentativeRegion(dbNames: string[]): string | undefined {
  return listOwnedRegions(dbNames)[0];
}

function toMoverSearchItem(
  record: MoverSearchCardRecord,
  ranked: RankedMover,
): MoverSearchItemDto | undefined {
  const serviceType = pickRepresentativeServiceType(
    record.serviceTypes.map((entry) => entry.serviceType.name),
  );
  const region = pickRepresentativeRegion(
    record.regions.map((entry) => entry.region.name),
  );

  if (!serviceType || !region) {
    return undefined;
  }

  return {
    id: record.id,
    serviceType,
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
    serviceTypes: listOwnedServiceTypes(
      record.serviceTypes.map((entry) => entry.serviceType.name),
    ),
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

const RECOMMENDED_FILTER_QUERY: MoverSearchQuery = {
  regions: [],
  services: [],
  sort: "reviewCount",
  page: 1,
  pageSize: RECOMMENDED_MOVER_LIMIT,
};

/**
 * @returns items, nextPage, totalCount. totalCount는 서비스·지역이 있는 mover 기준입니다.
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

export async function listRecommendedMovers(): Promise<MoverSearchRecommendedResult> {
  const sortRows = await findFilteredMoverSortRows(RECOMMENDED_FILTER_QUERY);
  const aggregates = await findMoverSearchAggregates(
    sortRows.map((row) => row.id),
  );
  const ranked = sortRows
    .map((row) => toRankedMover(row, aggregates))
    .sort(compareRecommendedMovers)
    .slice(0, RECOMMENDED_MOVER_LIMIT);
  const cards = await findMoverSearchCardsByIds(ranked.map((row) => row.id));

  return {
    items: toMoverSearchItems(ranked, cards),
  };
}
