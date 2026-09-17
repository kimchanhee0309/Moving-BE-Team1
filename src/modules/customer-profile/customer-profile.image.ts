/**
 * Customer Profile이 공통 로컬 이미지 저장소에 전달할 역할별 경로 설정을 정의합니다.
 * MIME·signature·UUID·파일 삭제 정책은 공통 모듈이 담당하며 Customer DB 처리는 담당하지 않습니다.
 */
import path from "node:path";

import { createLocalProfileImageStorage } from "../../common/uploads/local-profile-image";
import { CUSTOMER_PROFILE_IMAGE_MAX_BYTES } from "./customer-profile.constants";

/** 기존 Customer 공개 URL 계약과 연결된 실제 로컬 저장 폴더입니다. */
export const CUSTOMER_PROFILE_UPLOAD_DIRECTORY = path.resolve(
  process.cwd(),
  "uploads",
  "customer-profiles",
);

const customerProfileImageStorage = createLocalProfileImageStorage({
  uploadDirectory: CUSTOMER_PROFILE_UPLOAD_DIRECTORY,
  publicUrlPrefix: "/uploads/customer-profiles/",
  maxBytes: CUSTOMER_PROFILE_IMAGE_MAX_BYTES,
});

/** Customer Profile multipart 이미지 한 장을 공통 정책으로 저장합니다. */
export const uploadCustomerProfileImage = customerProfileImageStorage.uploadProfileImage;

/** Customer 업로드 파일의 실제 이미지 signature를 검증합니다. */
export const validateUploadedProfileImage =
  customerProfileImageStorage.validateUploadedProfileImage;

/** Customer 업로드 파일명을 기존 공개 URL 계약으로 변환합니다. */
export const getUploadedProfileImageUrl =
  customerProfileImageStorage.getUploadedProfileImageUrl;

/** 실패한 Customer 신규 업로드를 정리합니다. */
export const removeUploadedProfileImage =
  customerProfileImageStorage.removeUploadedProfileImage;

/** Customer DB 반영 후 교체된 기존 로컬 이미지를 정리합니다. */
export const removeReplacedLocalProfileImage =
  customerProfileImageStorage.removeReplacedLocalProfileImage;
