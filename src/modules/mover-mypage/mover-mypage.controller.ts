/** 기사님 마이페이지 HTTP 입력·인증 Context와 공통 성공 응답을 연결합니다. */
import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getProfileAuthContext } from "../../common/utils/auth-context";
import {
  getMoverMyPage,
  updateMoverBasicInfo,
} from "./mover-mypage.service";
import { parseUpdateMoverBasicInfoRequest } from "./mover-mypage.validator";

/**
 * 인증된 기사님의 프로필 ID로 마이페이지 정보를 조회해 data.myPage로 반환합니다.
 *
 * @param request requireProfiledMover가 profileId를 넣은 Express 요청
 * @param response 공통 성공 응답을 반환할 Express 응답
 * @returns HTTP 200과 기사님 기본정보·프로필·활동 및 평점 집계
 * @throws UnauthorizedError 인증 Context가 없거나 유효하지 않은 경우
 * @throws ForbiddenError 기사님 프로필이 존재하지 않는 경우
 * @throws ConflictError 프로필 기준 데이터가 올바르지 않은 경우
 * @sideEffects Mover·Review·Quote·Favorite 데이터를 읽으며 DB를 변경하지 않습니다.
 */
export const getMoverMyPageController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId } = getProfileAuthContext(request);
  const myPage = await getMoverMyPage(profileId);

  return sendSuccess(response, HTTP_STATUS.OK, { myPage });
};

/**
 * 요청 Body를 검증하고 인증된 기사님의 User 기본정보를 수정해 data.basicInfo로 반환합니다.
 *
 * @param request requireProfiledMover가 profileId를 넣고 JSON Body를 포함한 Express 요청
 * @param response 공통 성공 응답을 반환할 Express 응답
 * @returns HTTP 200과 수정된 이름·이메일·전화번호
 * @throws BadRequestError Body가 비었거나 기본정보 형식이 올바르지 않은 경우
 * @throws UnauthorizedError 현재 비밀번호가 올바르지 않거나 인증 Context가 없는 경우
 * @throws ForbiddenError 기사님 프로필이 존재하지 않는 경우
 * @throws ConflictError 이메일·전화번호가 중복되거나 비밀번호 변경이 불가능한 경우
 * @sideEffects User 기본정보와 선택적으로 passwordHash를 transaction으로 변경합니다.
 */
export const updateMoverBasicInfoController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId } = getProfileAuthContext(request);
  const input = parseUpdateMoverBasicInfoRequest(request.body);
  const basicInfo = await updateMoverBasicInfo(profileId, input);

  return sendSuccess(response, HTTP_STATUS.OK, { basicInfo });
};
