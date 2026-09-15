/**
 * 받은 요청 API의 HTTP 입력을 검증하고 인증된 기사님의 profileId로 Service를 호출합니다.
 */
import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getProfileAuthContext } from "../../common/utils/auth-context";
import {
  getReceivedRequests,
  rejectReceivedRequest,
  sendQuoteToReceivedRequest,
} from "./mover-request.service";
import {
  parseGetReceivedRequestsQuery,
  parseReceivedRequestId,
  parseRejectReceivedRequestInput,
  parseSendQuoteInput,
} from "./mover-request.validator";

export const getReceivedRequestsController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId: moverId } = getProfileAuthContext(request);
  const query = parseGetReceivedRequestsQuery(request.query);
  const result = await getReceivedRequests(moverId, query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

export const sendQuoteController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId: moverId } = getProfileAuthContext(request);
  const requestId = parseReceivedRequestId(request.params.requestId);
  const input = parseSendQuoteInput(request.body);

  const quote = await sendQuoteToReceivedRequest(moverId, requestId, input);

  return sendSuccess(response, HTTP_STATUS.CREATED, {
    quote,
  });
};

export const rejectReceivedRequestController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId: moverId } = getProfileAuthContext(request);
  const requestId = parseReceivedRequestId(request.params.requestId);
  const input = parseRejectReceivedRequestInput(request.body);

  const rejection = await rejectReceivedRequest(moverId, requestId, input);

  return sendSuccess(response, HTTP_STATUS.CREATED, {
    rejection,
  });
};
