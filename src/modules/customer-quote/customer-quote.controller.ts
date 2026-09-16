/**
 * 받은 견적 목록·상세 HTTP 입력을 DTO로 바꾸고 Service 결과를 공통 응답으로 반환합니다.
 * Cookie·JWT를 다시 해석하지 않으며 권한·상태 필터는 guard와 Service에 맡깁니다.
 */
import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getProfileAuthContext } from "../../common/utils/auth-context";
import {
  getReceivedQuoteDetail,
  getReceivedQuoteHistoryDetail,
  listReceivedQuoteHistory,
  listReceivedQuotes,
} from "./customer-quote.service";
import {
  parseQuoteIdParams,
  parseReceivedQuoteHistoryQuery,
  parseReceivedQuotesQuery,
} from "./customer-quote.validator";

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

/**
 * GET /customers/me/quotes/history
 * 입력 검증 → 인증 주체 추출 → 과거 확정 견적 목록 조회 → data.items 응답
 */
export const listReceivedQuoteHistoryController: RequestHandler = async (
  request,
  response,
) => {
  const query = parseReceivedQuoteHistoryQuery(request.query);
  const auth = getProfileAuthContext(request);
  const result = await listReceivedQuoteHistory(auth.profileId, query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/**
 * GET /customers/me/quotes/history/:quoteId
 * 입력 검증 → 인증 주체 추출 → 과거 확정 견적 상세 조회 → data.quote 응답
 */
export const getReceivedQuoteHistoryDetailController: RequestHandler = async (
  request,
  response,
) => {
  const quoteId = parseQuoteIdParams(request.params);
  const auth = getProfileAuthContext(request);
  const result = await getReceivedQuoteHistoryDetail(auth.profileId, quoteId);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/**
 * GET /customers/me/quotes/:quoteId
 * 입력 검증 → 인증 주체 추출 → 대기 견적 상세 조회 → data.quote 응답
 */
export const getReceivedQuoteDetailController: RequestHandler = async (
  request,
  response,
) => {
  const quoteId = parseQuoteIdParams(request.params);
  const auth = getProfileAuthContext(request);
  const result = await getReceivedQuoteDetail(auth.profileId, quoteId);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};
