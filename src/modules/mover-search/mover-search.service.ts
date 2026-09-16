/**
 * 찜 여부·리뷰 본문·지정 견적은 해당 담당 API가 생긴 뒤 연결합니다.
 * 목록 카드의 대표 서비스·지역은 실제 보유 값만 쓰고, 없으면 카드를 제외합니다.
 */
import {
  DB_NAME_TO_REGION,
  MOVER_REGIONS,
  SERVICE_TYPE_PRIORITY,
  isMoverServiceType,
  type MoverServiceType,
} from "./mover-search.constants";
import type {
  MoverSearchItemDto,
  MoverSearchListResult,
  MoverSearchQuery,
} from "./mover-search.dto";
import {
  findFilteredMoverSortRows,
  findMoverSearchAggregates,
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

/**
 * 보유 서비스 중 화면 우선순위가 가장 높은 값을 고릅니다.
 * 인식 가능한 값이 없으면 SMALL을 만들지 않고 카드를 제외합니다.
 */
function pickRepresentativeServiceType(
  names: string[],
): MoverServiceType | undefined {
  const owned = names.filter(isMoverServiceType);

  for (const candidate of SERVICE_TYPE_PRIORITY) {
    if (owned.includes(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * 보유 지역 중 화면 순서상 앞선 값을 고릅니다.
 * 매핑되지 않은 이름만 있으면 빈 문자열 대신 카드를 제외합니다.
 */
function pickRepresentativeRegion(dbNames: string[]): string | undefined {
  const owned = new Set(
    dbNames.flatMap((name) => {
      const region = DB_NAME_TO_REGION[name];
      return region ? [region] : [];
    }),
  );

  for (const region of MOVER_REGIONS) {
    if (owned.has(region)) {
      return region;
    }
  }

  return undefined;
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

/**
 * 필터된 기사님을 집계·정렬한 뒤 현재 페이지 카드 DTO를 만듭니다.
 *
 * @param query 검증된 찾기 목록 query
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
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const rankedById = new Map(pageRows.map((row) => [row.id, row]));

  const items = pageRows.flatMap((row) => {
    const card = cardById.get(row.id);
    const rankedMover = rankedById.get(row.id);

    if (!card || !rankedMover) {
      return [];
    }

    const item = toMoverSearchItem(card, rankedMover);
    return item ? [item] : [];
  });

  const hasNext = start + pageRows.length < ranked.length;

  return {
    items,
    nextPage: hasNext ? query.page + 1 : null,
    totalCount: ranked.length,
  };
}
