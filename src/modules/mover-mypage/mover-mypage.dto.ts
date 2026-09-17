/** 기사님 마이페이지의 입력과 외부 응답 DTO입니다. */
import type {
  MoverRegion,
  MoverServiceType,
} from "../mover-profile/mover-profile.constants";

/** PATCH /movers/me에서 전달된 User 기본정보만 변경합니다. */
export interface UpdateMoverBasicInfoRequestDto {
  name?: string;
  email?: string;
  phone?: string | null;
  currentPassword?: string;
  newPassword?: string;
}

/** 기본정보 수정 화면과 수정 응답에 사용하는 공개 User 정보입니다. */
export interface MoverBasicInfoResponseDto {
  name: string;
  email: string;
  phone: string | null;
}

/** 별점별 리뷰 수입니다. score는 5점부터 1점 순서로 반환합니다. */
export interface MoverRatingCountDto {
  score: 1 | 2 | 3 | 4 | 5;
  count: number;
}

/** GET /movers/me의 기사님 마이페이지 공개 응답입니다. */
export interface MoverMyPageResponseDto extends MoverBasicInfoResponseDto {
  id: string;
  profileImageUrl: string | null;
  nickname: string;
  careerYears: number;
  shortIntroduction: string;
  description: string;
  serviceTypes: MoverServiceType[];
  regions: MoverRegion[];
  confirmedCount: number;
  favoriteCount: number;
  rating: number;
  reviewCount: number;
  ratingCounts: MoverRatingCountDto[];
}
