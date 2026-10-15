/**
 * Customer Profile API와 DB 사이에서 사용하는 허용값과 경계 변환표를 정의합니다.
 * API의 한글 지역명과 seed의 영문 지역명을 분리하며 DB 조회나 HTTP 처리는 담당하지 않습니다.
 */

/** 일반 유저가 선택할 수 있는 이사 서비스 유형입니다. */
export const CUSTOMER_SERVICE_TYPES = ["SMALL", "HOME", "OFFICE"] as const;

/** Customer Profile API가 노출하는 17개 시·도 이름입니다. */
export const CUSTOMER_REGIONS = [
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

/** API의 한글 지역명을 현재 Region seed의 영문 이름으로 변환합니다. */
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

/** 현재 Region seed의 영문 이름을 API 응답의 한글 지역명으로 변환합니다. */
export const DB_NAME_TO_REGION: Readonly<Record<string, CustomerRegion>> = {
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

/** 프로필 이미지 한 장의 최대 크기이며 현재 로컬 개발 업로드에서 5 MiB로 제한합니다. */
export const CUSTOMER_PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** API와 DB가 공통으로 사용하는 허용 서비스 유형입니다. */
export type CustomerServiceType = (typeof CUSTOMER_SERVICE_TYPES)[number];

/** API 요청과 응답에서 사용하는 한글 시·도 이름입니다. */
export type CustomerRegion = (typeof CUSTOMER_REGIONS)[number];

/** 외부 입력이 명세의 서비스 유형인지 안전하게 좁힙니다. */
export function isCustomerServiceType(value: string): value is CustomerServiceType {
  return CUSTOMER_SERVICE_TYPES.some((serviceType) => serviceType === value);
}

/** 외부 입력이 명세의 17개 한글 지역명 중 하나인지 안전하게 좁힙니다. */
export function isCustomerRegion(value: string): value is CustomerRegion {
  return CUSTOMER_REGIONS.some((region) => region === value);
}
