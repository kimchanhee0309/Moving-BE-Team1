/**
 * 기사님 찾기 목록·상세·추천 API의 입력·응답 DTO를 정의합니다.
 * Prisma Mover 원문과 password 같은 내부 필드는 포함하지 않습니다.
 *
 * 담당 기능: GET /movers, GET /movers/:id, GET /movers/recommended
 * 계층 책임: API 필드 의미·허용값·nullable만 선언합니다.
 * 담당하지 않는 범위: HTTP 파싱, 권한, DB 조회, isFavorite
 */
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

/**
 * 목록·추천 카드.
 * serviceType은 대표 1개, serviceTypes는 보유분 전체입니다. 찜 여부·리뷰 본문·지역 배열은 이 DTO 범위가 아닙니다.
 */
export interface MoverSearchItemDto {
  id: string;
  serviceType: MoverServiceType;
  serviceTypes: MoverServiceType[];
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

/**
 * 상세. 목록 카드 필드에 한글 지역 배열만 더합니다.
 * serviceTypes는 목록과 같고, isFavorite는 포함하지 않습니다.
 */
export interface MoverSearchDetailDto extends MoverSearchItemDto {
  regions: MoverRegion[];
}

/** 추천 사이드바. pagination 없이 상위 3명 items만 담습니다. */
export interface MoverSearchRecommendedResult {
  items: MoverSearchItemDto[];
}
