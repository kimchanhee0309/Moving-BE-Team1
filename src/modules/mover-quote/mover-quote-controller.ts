/**
 * 기사님 견적 관리 API의 HTTP 입력을 검증하고
 * 인증된 기사님의 profileId를 사용해 Service를 호출합니다.
 */
import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getProfileAuthContext } from "../../common/utils/auth-context";
import {
  getMoverQuoteDetail,
  getMoverQuotes,
  getRejectedRequests,
} from "./mover-quote.service";
import {
  parseGetMoverQuotesQuery,
  parseGetRejectedRequestsQuery,
  parseMoverQuoteId,
} from "./mover-quote.validator";

/**
 * 보낸 견적 목록을 공통 성공 응답으로 반환합니다.
 * DB 조회와 pagination 계산은 Service에 위임합니다.
 */
export const getMoverQuotesController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId: moverId } = getProfileAuthContext(request);

  const query = parseGetMoverQuotesQuery(request.query);

  const result = await getMoverQuotes(moverId, query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/**
 * 견적 상세를 data.quote로 반환합니다.
 * quoteId 검증 후 인증된 기사 프로필 ID와 함께 Service에 전달합니다.
 */
export const getMoverQuoteDetailController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId: moverId } = getProfileAuthContext(request);

  const quoteId = parseMoverQuoteId(request.params.quoteId);

  const quote = await getMoverQuoteDetail(moverId, quoteId);

  return sendSuccess(response, HTTP_STATUS.OK, {
    quote,
  });
};

/**
 * 기사님이 반려한 요청 목록을 공통 성공 응답으로 반환합니다.
 * Quote REJECTED 목록이 아닌 RequestRejection 목록을 조회합니다.
 */
export const getRejectedRequestsController: RequestHandler = async (
  request,
  response,
) => {
  const { profileId: moverId } = getProfileAuthContext(request);

  const query = parseGetRejectedRequestsQuery(request.query);

  const result = await getRejectedRequests(moverId, query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};
