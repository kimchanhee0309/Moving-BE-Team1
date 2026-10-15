/**
 * Mover Profile의 검증된 요청 DTO와 공개 응답 DTO를 정의합니다.
 * Prisma 모델과 인증 식별자를 외부 계약에 노출하지 않으며 User 기본정보는 포함하지 않습니다.
 */
import type { MoverRegion, MoverServiceType } from "./mover-profile.constants";

/** 인증된 MOVER User에 최초 기사님 프로필을 생성할 요청입니다. */
export interface CreateMoverProfileRequestDto {
  nickname: string;
  careerYears: number;
  shortIntroduction: string;
  description: string;
  serviceTypes: MoverServiceType[];
  regions: MoverRegion[];
  profileImageUrl: string | null;
}

/** 전달된 기사님 프로필 필드만 수정할 요청입니다. */
export interface UpdateMoverProfileRequestDto {
  nickname?: string;
  careerYears?: number;
  shortIntroduction?: string;
  description?: string;
  serviceTypes?: MoverServiceType[];
  regions?: MoverRegion[];
  profileImageUrl?: string;
}

/** 클라이언트에 반환하는 기사님 공개 프로필이며 날짜는 ISO 8601 문자열입니다. */
export interface MoverProfileResponseDto {
  id: string;
  profileImageUrl: string | null;
  nickname: string;
  careerYears: number;
  shortIntroduction: string;
  description: string;
  serviceTypes: MoverServiceType[];
  regions: MoverRegion[];
  createdAt: string;
  updatedAt: string;
}
