import type {
  MoverRegion,
  MoverSearchSort,
  MoverServiceType,
} from "./mover-search.constants";

export interface MoverSearchQuery {
  search?: string;
  regions: MoverRegion[];
  services: MoverServiceType[];
  sort: MoverSearchSort;
  page: number;
  pageSize: number;
}

/** 목록 카드. 찜 여부·리뷰 본문은 해당 담당 API 범위입니다. */
export interface MoverSearchItemDto {
  id: string;
  serviceType: MoverServiceType;
  region: string;
  moverName: string;
  introduction: string;
  description: string;
  profileImageUrl: string | null;
  rating: number;
  reviewCount: number;
  careerYears: number;
  confirmedCount: number;
  favoriteCount: number;
}

export interface MoverSearchListResult {
  items: MoverSearchItemDto[];
  nextPage: number | null;
  totalCount: number;
}

export interface MoverSearchIdParams {
  id: string;
}

/** 상세. 목록 카드에 보유 서비스·한글 지역 배열을 더합니다. isFavorite는 포함하지 않습니다. */
export interface MoverSearchDetailDto extends MoverSearchItemDto {
  serviceTypes: MoverServiceType[];
  regions: MoverRegion[];
}

/** 추천 사이드바. pagination 없이 상위 3명 items만 담습니다. */
export interface MoverSearchRecommendedResult {
  items: MoverSearchItemDto[];
}
