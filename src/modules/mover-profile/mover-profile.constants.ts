/**
 * Mover Profile 요청·응답의 허용값과 API/DB 지역 변환표를 정의합니다.
 * HTTP 처리와 Prisma 조회는 담당하지 않으며 Validator와 Service가 같은 계약을 재사용합니다.
 */

/** 기사님이 제공할 수 있는 이사 서비스 유형입니다. */
export const MOVER_SERVICE_TYPES = ["SMALL", "HOME", "OFFICE"] as const;

/** Mover Profile API가 사용하는 17개 시·도 이름입니다. */
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

/** API 한글 지역명을 현재 Region 기준 데이터의 영문 이름으로 변환합니다. */
export const MOVER_REGION_TO_DB_NAME = {
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

/** Region 기준 데이터의 영문 이름을 Mover Profile API 한글 값으로 변환합니다. */
export const DB_NAME_TO_MOVER_REGION: Readonly<Record<string, MoverRegion>> = {
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

/** 프로필 이미지 한 장의 최대 크기인 5 MiB입니다. */
export const MOVER_PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** 기사님 경력 연수의 허용 범위입니다. */
export const MOVER_CAREER_YEARS_MIN = 0;
export const MOVER_CAREER_YEARS_MAX = 50;

/** 기사님 공개 텍스트 필드의 최대 길이입니다. */
export const MOVER_NICKNAME_MAX_LENGTH = 50;
export const MOVER_SHORT_INTRODUCTION_MAX_LENGTH = 255;
export const MOVER_DESCRIPTION_MAX_LENGTH = 1_000;

/** API와 DB가 공통으로 사용하는 기사님 서비스 유형입니다. */
export type MoverServiceType = (typeof MOVER_SERVICE_TYPES)[number];

/** API 요청과 응답에서 사용하는 한글 시·도 이름입니다. */
export type MoverRegion = (typeof MOVER_REGIONS)[number];

/** 외부 값을 Mover 서비스 유형으로 안전하게 좁힙니다. */
export function isMoverServiceType(value: string): value is MoverServiceType {
  return MOVER_SERVICE_TYPES.some((serviceType) => serviceType === value);
}

/** 외부 값을 Mover 활동 지역으로 안전하게 좁힙니다. */
export function isMoverRegion(value: string): value is MoverRegion {
  return MOVER_REGIONS.some((region) => region === value);
}
