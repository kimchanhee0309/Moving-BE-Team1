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

/** 상세의 다중 서비스·지역과 찜 여부는 다음 작업 범위입니다. */
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
