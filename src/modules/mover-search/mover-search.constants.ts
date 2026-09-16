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

export const MAX_MOVER_SEARCH_LENGTH = 50;

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
