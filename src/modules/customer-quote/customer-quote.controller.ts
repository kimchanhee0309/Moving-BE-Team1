/**
 * 받은 견적 목록 HTTP 입력을 DTO로 바꾸고 Service 결과를 공통 응답으로 반환합니다.
 * Cookie·JWT를 다시 해석하지 않으며 권한·상태 필터는 guard와 Service에 맡깁니다.
 */
import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getProfileAuthContext } from "../../common/utils/auth-context";
import { listReceivedQuotes } from "./customer-quote.service";
import { parseReceivedQuotesQuery } from "./customer-quote.validator";

/**
 * GET /customers/me/quotes
 * 입력 검증 → 인증 주체 추출 → 목록 조회 → data.items 응답
 */
export const listReceivedQuotesController: RequestHandler = async (
  request,
  response,
) => {
  const query = parseReceivedQuotesQuery(request.query);
  const auth = getProfileAuthContext(request);
  const result = await listReceivedQuotes(auth.profileId, query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};
