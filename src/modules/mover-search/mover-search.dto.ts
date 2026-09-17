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

export interface MoverSearchDetailDto extends MoverSearchItemDto {
  serviceTypes: MoverServiceType[];
  regions: MoverRegion[];
}
