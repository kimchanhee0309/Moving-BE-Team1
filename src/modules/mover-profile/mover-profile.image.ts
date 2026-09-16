/**
 * Mover Profile이 공통 로컬 이미지 저장소에 전달할 역할별 경로 설정을 정의합니다.
 * 파일 검증·UUID·정리 정책은 공통 모듈이 담당하며 Mover DB 저장은 담당하지 않습니다.
 */
import path from "node:path";

import { createLocalProfileImageStorage } from "../../common/uploads/local-profile-image";
import { MOVER_PROFILE_IMAGE_MAX_BYTES } from "./mover-profile.constants";

/** Mover 이미지 공개 URL 계약과 연결된 실제 로컬 저장 폴더입니다. */
export const MOVER_PROFILE_UPLOAD_DIRECTORY = path.resolve(
  process.cwd(),
  "uploads",
  "mover-profiles",
);

const moverProfileImageStorage = createLocalProfileImageStorage({
  uploadDirectory: MOVER_PROFILE_UPLOAD_DIRECTORY,
  publicUrlPrefix: "/uploads/mover-profiles/",
  maxBytes: MOVER_PROFILE_IMAGE_MAX_BYTES,
});

/** Mover Profile multipart 이미지 한 장을 공통 정책으로 저장합니다. */
export const uploadMoverProfileImage = moverProfileImageStorage.uploadProfileImage;

/** Mover 업로드 파일의 실제 이미지 signature를 검증합니다. */
export const validateUploadedMoverProfileImage =
  moverProfileImageStorage.validateUploadedProfileImage;

/** Mover 업로드 파일명을 공개 URL 계약으로 변환합니다. */
export const getUploadedMoverProfileImageUrl =
  moverProfileImageStorage.getUploadedProfileImageUrl;

/** 실패한 Mover 신규 업로드를 정리합니다. */
export const removeUploadedMoverProfileImage =
  moverProfileImageStorage.removeUploadedProfileImage;

/** Mover DB 반영 후 교체된 기존 로컬 이미지를 정리합니다. */
export const removeReplacedMoverProfileImage =
  moverProfileImageStorage.removeReplacedLocalProfileImage;
