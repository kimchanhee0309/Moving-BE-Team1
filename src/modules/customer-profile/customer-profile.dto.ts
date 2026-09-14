/**
 * Customer Profile API의 Service 입력과 공개 응답 DTO를 정의합니다.
 * Express 요청과 Prisma 모델을 직접 노출하지 않으며 비밀번호 hash와 내부 관계 ID는 포함하지 않습니다.
 */
import type {
  CustomerRegion,
  CustomerServiceType,
} from "./customer-profile.constants";

/** 프로필 생성 시 인증된 User에 추가할 일반 유저 정보입니다. */
export interface CreateCustomerProfileInput {
  /** 전체 교체 방식으로 저장할 서비스 유형이며 최소 한 개입니다. */
  serviceTypes: CustomerServiceType[];
  /** API 한글 지역명이며 Repository 경계에서 DB 이름으로 변환합니다. */
  region: CustomerRegion;
  /** 업로드가 없으면 null인 공개 이미지 경로입니다. */
  profileImageUrl: string | null;
}

/** 프로필 수정 시 전달된 필드만 변경하며 phone의 null은 전화번호 삭제를 뜻합니다. */
export interface UpdateCustomerProfileInput {
  name?: string;
  email?: string;
  phone?: string | null;
  currentPassword?: string;
  newPassword?: string;
  serviceTypes?: CustomerServiceType[];
  region?: CustomerRegion;
  profileImageUrl?: string;
}

/** 클라이언트에 반환하는 일반 유저 프로필이며 모든 날짜는 ISO 8601 문자열입니다. */
export interface CustomerProfileDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  profileImageUrl: string | null;
  serviceTypes: CustomerServiceType[];
  region: CustomerRegion;
  createdAt: string;
  updatedAt: string;
}
