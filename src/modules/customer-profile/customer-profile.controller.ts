/**
 * Customer Profile HTTP 요청에서 인증 식별자·multipart body·파일을 추출하고 공통 응답을 반환합니다.
 * 비즈니스 규칙과 Prisma 처리는 Service에 위임하며 실패한 새 업로드 파일은 이 계층에서 정리합니다.
 */
import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getAuthContext, getProfileAuthContext } from "../../common/utils/auth-context";
import {
  getUploadedProfileImageUrl,
  removeUploadedProfileImage,
  validateUploadedProfileImage,
} from "./customer-profile.image";
import {
  createCustomerProfile,
  getCustomerProfile,
  updateCustomerProfile,
} from "./customer-profile.service";
import {
  parseCreateCustomerProfileInput,
  parseUpdateCustomerProfileInput,
} from "./customer-profile.validator";

async function safelyRemoveNewUpload(file?: Express.Multer.File): Promise<void> {
  try {
    await removeUploadedProfileImage(file);
  } catch {
    // 원래 API 오류를 파일 정리 오류로 덮지 않으며 운영 저장소에서는 별도 관측 정책이 필요합니다.
  }
}

/** 인증 User ID로 일반 유저 프로필을 생성하고 201 data.profile로 응답합니다. */
export const createCustomerProfileController: RequestHandler = async (request, response) => {
  try {
    await validateUploadedProfileImage(request.file);
    const { userId } = getAuthContext(request);
    const input = parseCreateCustomerProfileInput(
      request.body,
      getUploadedProfileImageUrl(request.file) ?? null,
    );
    const profile = await createCustomerProfile(userId, input);

    return sendSuccess(response, HTTP_STATUS.CREATED, { profile });
  } catch (error: unknown) {
    // multer가 먼저 만든 파일은 validation·권한·DB 처리 중 어느 단계가 실패해도 남기지 않습니다.
    await safelyRemoveNewUpload(request.file);
    throw error;
  }
};

/** profiled guard의 Customer ID로 현재 프로필을 조회하고 200 data.profile로 응답합니다. */
export const getCustomerProfileController: RequestHandler = async (request, response) => {
  const { profileId } = getProfileAuthContext(request);
  const profile = await getCustomerProfile(profileId);

  return sendSuccess(response, HTTP_STATUS.OK, { profile });
};

/** 전달된 프로필 필드만 수정하고 실패 시 이번 요청에서 업로드한 새 파일을 제거합니다. */
export const updateCustomerProfileController: RequestHandler = async (request, response) => {
  try {
    await validateUploadedProfileImage(request.file);
    const { profileId } = getProfileAuthContext(request);
    const input = parseUpdateCustomerProfileInput(
      request.body,
      getUploadedProfileImageUrl(request.file),
    );
    const profile = await updateCustomerProfile(profileId, input);

    return sendSuccess(response, HTTP_STATUS.OK, { profile });
  } catch (error: unknown) {
    await safelyRemoveNewUpload(request.file);
    throw error;
  }
};
