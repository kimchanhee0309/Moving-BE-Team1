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

export const getMoverMyPageController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId } = getProfileAuthContext(request);
  const myPage = await getMoverMyPage(profileId);

  return sendSuccess(response, HTTP_STATUS.OK, { myPage });
};

export const updateMoverBasicInfoController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId } = getProfileAuthContext(request);
  const input = parseUpdateMoverBasicInfoRequest(request.body);
  const basicInfo = await updateMoverBasicInfo(profileId, input);

  return sendSuccess(response, HTTP_STATUS.OK, { basicInfo });
};
