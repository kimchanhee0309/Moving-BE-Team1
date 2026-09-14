/**
 * 받은 요청 API의 HTTP 입력을 검증하고 인증된 기사님의 profileId로 Service를 호출
 * Cookie와 JWT를 다시 해석하지 않고 공통 Auth Context와 응답 Helper를 사용
 */
import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getProfileAuthContext } from "../../common/utils/auth-context";
import {
  getReceivedRequestDetail,
  getReceivedRequests,
} from "./mover-request.service";
import {
  parseGetReceivedRequestsQuery,
  parseReceivedRequestId,
} from "./mover-request.validator";

/** 받은 요청 목록을 검색, 필터, 정렬 조건과 함께 반환 */
export const getReceivedRequestsController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId: moverId } = getProfileAuthContext(request);
  const query = parseGetReceivedRequestsQuery(request.query);
  const result = await getReceivedRequests(moverId, query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/** 현재 기사님이 처리할 수 있는 받은 요청 상세 반환 */
export const getReceivedRequestDetailController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId: moverId } = getProfileAuthContext(request);
  const requestId = parseReceivedRequestId(request.params.requestId);
  const moveRequest = await getReceivedRequestDetail(moverId, requestId);

  return sendSuccess(response, HTTP_STATUS.OK, {
    moveRequest,
  });
};
