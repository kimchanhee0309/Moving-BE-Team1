/**
 * Mover Profile이 공통 프로필 이미지 저장소에 전달할 역할별 경로 설정을 정의합니다.
 * 파일 검증·UUID·저장소 선택(local/S3)·정리 정책은 공통 모듈이 담당하며 Mover DB 저장은 담당하지 않습니다.
 */
import path from "node:path";

import { createProfileImageStorage } from "../../common/uploads/profile-image-storage";
import { MOVER_PROFILE_IMAGE_MAX_BYTES } from "./mover-profile.constants";

/** local 저장소에서 Mover 이미지 공개 URL 계약과 연결된 실제 저장 폴더입니다. S3 전환 전에 올린 이미지도 이 경로로 계속 제공합니다. */
export const MOVER_PROFILE_UPLOAD_DIRECTORY = path.resolve(
  process.cwd(),
  "uploads",
  "mover-profiles",
);

const moverProfileImageStorage = createProfileImageStorage({
  uploadDirectory: MOVER_PROFILE_UPLOAD_DIRECTORY,
  publicUrlPrefix: "/uploads/mover-profiles/",
  s3KeyPrefix: "profile-images/movers/",
  maxBytes: MOVER_PROFILE_IMAGE_MAX_BYTES,
});

/** Mover Profile multipart 이미지 한 장을 공통 정책으로 메모리에 받습니다. */
export const uploadMoverProfileImage = moverProfileImageStorage.uploadProfileImage;

/** Mover 업로드 파일의 실제 이미지 signature를 검증합니다. */
export const validateUploadedMoverProfileImage =
  moverProfileImageStorage.validateUploadedProfileImage;

/** 검증을 마친 Mover 업로드 파일을 저장하고 DB에 넣을 공개 URL을 반환합니다. */
export const saveUploadedMoverProfileImage =
  moverProfileImageStorage.saveUploadedProfileImage;

/** 실패한 Mover 신규 업로드를 정리합니다. */
export const removeUploadedMoverProfileImage =
  moverProfileImageStorage.removeUploadedProfileImage;

/** Mover DB 반영 후 교체된 기존 이미지를 정리합니다. local 파일과 S3 객체를 모두 처리합니다. */
export const removeReplacedMoverProfileImage =
  moverProfileImageStorage.removeReplacedProfileImage;
