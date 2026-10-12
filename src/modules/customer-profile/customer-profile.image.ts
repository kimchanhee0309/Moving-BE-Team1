/**
 * Customer Profile이 공통 프로필 이미지 저장소에 전달할 역할별 경로 설정을 정의합니다.
 * MIME·signature·UUID·저장소 선택(local/S3)·파일 삭제 정책은 공통 모듈이 담당하며 Customer DB 처리는 담당하지 않습니다.
 */
import path from "node:path";

import { createProfileImageStorage } from "../../common/uploads/profile-image-storage";
import { CUSTOMER_PROFILE_IMAGE_MAX_BYTES } from "./customer-profile.constants";

/** local 저장소에서 기존 Customer 공개 URL 계약과 연결된 실제 저장 폴더입니다. S3 전환 전에 올린 이미지도 이 경로로 계속 제공합니다. */
export const CUSTOMER_PROFILE_UPLOAD_DIRECTORY = path.resolve(
  process.cwd(),
  "uploads",
  "customer-profiles",
);

const customerProfileImageStorage = createProfileImageStorage({
  uploadDirectory: CUSTOMER_PROFILE_UPLOAD_DIRECTORY,
  publicUrlPrefix: "/uploads/customer-profiles/",
  s3KeyPrefix: "profile-images/customers/",
  maxBytes: CUSTOMER_PROFILE_IMAGE_MAX_BYTES,
});

/** Customer Profile multipart 이미지 한 장을 공통 정책으로 메모리에 받습니다. */
export const uploadCustomerProfileImage = customerProfileImageStorage.uploadProfileImage;

/** Customer 업로드 파일의 실제 이미지 signature를 검증합니다. */
export const validateUploadedProfileImage =
  customerProfileImageStorage.validateUploadedProfileImage;

/** 검증을 마친 Customer 업로드 파일을 저장하고 DB에 넣을 공개 URL을 반환합니다. */
export const saveUploadedProfileImage =
  customerProfileImageStorage.saveUploadedProfileImage;

/** 실패한 Customer 신규 업로드를 정리합니다. */
export const removeUploadedProfileImage =
  customerProfileImageStorage.removeUploadedProfileImage;

/**
 * Customer DB 반영 후 교체된 기존 이미지를 정리합니다.
 * local 파일과 S3 객체를 모두 처리하며, 다른 모듈의 import를 유지하기 위해 기존 이름을 그대로 둡니다.
 */
export const removeReplacedLocalProfileImage =
  customerProfileImageStorage.removeReplacedProfileImage;
