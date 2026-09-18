/**
 * 기사님 찾기 목록·상세·추천에서 공유하는 허용값과 상한입니다.
 * 화면 한글 지역과 DB Region.name(SEOUL 등) 매핑, page/추천 인원 제한을 둡니다.
 *
 * 담당하지 않는 범위: HTTP 검증, DTO 조립, Prisma 조회
 */
export const MOVER_SERVICE_TYPES = ["SMALL", "HOME", "OFFICE"] as const;

export const SERVICE_TYPE_PRIORITY = MOVER_SERVICE_TYPES;

export const MOVER_REGIONS = [
  "서울",
  "경기",
  "인천",
  "강원",
  "충북",
  "충남",
  "세종",
  "대전",
  "전북",
  "전남",
  "광주",
  "경북",
  "경남",
  "대구",
  "울산",
  "부산",
  "제주",
] as const;

export const REGION_TO_DB_NAME = {
  서울: "SEOUL",
  경기: "GYEONGGI",
  인천: "INCHEON",
  강원: "GANGWON",
  충북: "CHUNGBUK",
  충남: "CHUNGNAM",
  세종: "SEJONG",
  대전: "DAEJEON",
  전북: "JEONBUK",
  전남: "JEONNAM",
  광주: "GWANGJU",
  경북: "GYEONGBUK",
  경남: "GYEONGNAM",
  대구: "DAEGU",
  울산: "ULSAN",
  부산: "BUSAN",
  제주: "JEJU",
} as const;

export const DB_NAME_TO_REGION: Readonly<Record<string, MoverRegion>> = {
  SEOUL: "서울",
  GYEONGGI: "경기",
  INCHEON: "인천",
  GANGWON: "강원",
  CHUNGBUK: "충북",
  CHUNGNAM: "충남",
  SEJONG: "세종",
  DAEJEON: "대전",
  JEONBUK: "전북",
  JEONNAM: "전남",
  GWANGJU: "광주",
  GYEONGBUK: "경북",
  GYEONGNAM: "경남",
  DAEGU: "대구",
  ULSAN: "울산",
  BUSAN: "부산",
  JEJU: "제주",
};

export const MOVER_SEARCH_SORTS = [
  "reviewCount",
  "rating",
  "careerYears",
  "confirmedCount",
] as const;

export const DEFAULT_MOVER_SEARCH_PAGE_SIZE = 5;

export const MAX_MOVER_SEARCH_PAGE_SIZE = 20;

/** page 오프셋 폭주를 막기 위한 상한. 목록 전체 조회량과는 별개입니다. */
export const MAX_MOVER_SEARCH_PAGE = 1000;

export const MAX_MOVER_SEARCH_LENGTH = 50;

/** 비회원 사이드바 추천 인원. DB LIMIT이 아니라 집계 정렬 뒤 slice 상한입니다. */
export const RECOMMENDED_MOVER_LIMIT = 3;

export const REGION_DB_NAMES = Object.values(REGION_TO_DB_NAME);

export type MoverServiceType = (typeof MOVER_SERVICE_TYPES)[number];
export type MoverRegion = (typeof MOVER_REGIONS)[number];
export type MoverSearchSort = (typeof MOVER_SEARCH_SORTS)[number];

export function isMoverServiceType(value: string): value is MoverServiceType {
  return MOVER_SERVICE_TYPES.some((serviceType) => serviceType === value);
}

export function isMoverRegion(value: string): value is MoverRegion {
  return MOVER_REGIONS.some((region) => region === value);
}

export function isMoverSearchSort(value: string): value is MoverSearchSort {
  return MOVER_SEARCH_SORTS.some((sort) => sort === value);
}
