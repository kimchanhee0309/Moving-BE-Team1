/**
 * MoveRequest Router의 HTTP 입력을 Validator/Service로 전달하고 공통 응답으로 감쌉니다.
 * 인증 주체는 `getProfileAuthContext`로만 얻어 `customerId`로 사용합니다(client 입력 신뢰 안 함).
 */
import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getProfileAuthContext } from "../../common/utils/auth-context";
import {
  createDesignatedRequestForCustomer,
  createMoveRequestForCustomer,
  getActiveMoveRequestForCustomer,
} from "./move-request.service";
import {
  parseCreateDesignatedRequestInput,
  parseCreateMoveRequestInput,
  parseMoveRequestIdParam,
} from "./move-request.validator";

/** 새 이사 견적 요청을 생성해 201과 data.moveRequest를 반환합니다. */
export const createMoveRequestController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId: customerId } = getProfileAuthContext(request);
  const input = parseCreateMoveRequestInput(request.body);
  const moveRequest = await createMoveRequestForCustomer(customerId, input);

  return sendSuccess(response, HTTP_STATUS.CREATED, { moveRequest });
};

/** 현재 customer의 활성 요청을 200으로 반환하며, 없으면 data.moveRequest가 null입니다. */
export const getActiveMoveRequestController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId: customerId } = getProfileAuthContext(request);
  const moveRequest = await getActiveMoveRequestForCustomer(customerId);

  return sendSuccess(response, HTTP_STATUS.OK, { moveRequest });
};

/** 대상 MoveRequest에 지정 요청을 추가해 201과 data.designatedRequest를 반환합니다. */
export const createDesignatedRequestController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId: customerId } = getProfileAuthContext(request);
  const moveRequestId = parseMoveRequestIdParam(request.params.moveRequestId);
  const input = parseCreateDesignatedRequestInput(request.body);

  const designatedRequest = await createDesignatedRequestForCustomer(
    customerId,
    moveRequestId,
    input,
  );

  return sendSuccess(response, HTTP_STATUS.CREATED, { designatedRequest });
};
