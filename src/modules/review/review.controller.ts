/**
 * Review Router의 HTTP 입력을 DTO로 변환하고 Service 결과를 공통 응답으로 반환합니다.
 * 권한·상태·중복 검사는 Service에 두고, cookie/JWT는 다시 해석하지 않습니다.
 *
 * 처리 흐름: params/query/body 검증 → 인증 컨텍스트 추출 → Service 호출 → sendSuccess
 */
import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getProfileAuthContext } from "../../common/utils/auth-context";
import {
  createReview,
  listCustomerReviews,
  listMoverReviews,
  listMyReceivedReviews,
} from "./review.service";
import {
  parseCreateReviewInput,
  parseListCustomerReviewsQuery,
  parseListReviewsQuery,
  parseMoverIdParam,
} from "./review.validator";

/**
 * 완료된 본인 이사에 리뷰를 작성하고 data.review를 201로 반환합니다.
 *
 * @throws BadRequestError VALIDATION_ERROR — Body 형식 오류
 * @throws NotFoundError REQUEST_NOT_FOUND — 요청이 없거나 본인 요청이 아닌 경우
 * @throws ConflictError MOVE_REQUEST_NOT_COMPLETED — 이사가 완료되지 않은 경우
 * @throws ConflictError QUOTE_NOT_CONFIRMED — 확정된 기사님이 없는 경우
 * @throws ConflictError REVIEW_ALREADY_EXISTS — 이미 작성한 경우
 * @sideEffects Review 행을 생성합니다.
 */
export const createReviewController: RequestHandler = async (request, response) => {
  const auth = getProfileAuthContext(request);
  const input = parseCreateReviewInput(request.body);
  const review = await createReview(auth.profileId, input);

  return sendSuccess(response, HTTP_STATUS.CREATED, { review });
};

/**
 * 현재 고객의 작성 가능·작성 완료 리뷰를 data.items로 반환합니다.
 *
 * @throws BadRequestError VALIDATION_ERROR — type/page/pageSize 오류
 */
export const listCustomerReviewsController: RequestHandler = async (
  request,
  response,
) => {
  const auth = getProfileAuthContext(request);
  const query = parseListCustomerReviewsQuery(request.query);
  const result = await listCustomerReviews(auth.profileId, query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/**
 * 로그인한 기사님이 받은 리뷰를 data.items와 summary로 반환합니다.
 *
 * @throws BadRequestError VALIDATION_ERROR — page/pageSize 오류
 */
export const listMyReceivedReviewsController: RequestHandler = async (
  request,
  response,
) => {
  const auth = getProfileAuthContext(request);
  const query = parseListReviewsQuery(request.query);
  const result = await listMyReceivedReviews(auth.profileId, query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/**
 * 특정 기사님이 받은 리뷰를 공개 조회합니다.
 * 로그인 없이 호출하므로 profile 컨텍스트를 읽지 않습니다.
 *
 * @throws BadRequestError VALIDATION_ERROR — moverId/page 오류
 * @throws NotFoundError MOVER_NOT_FOUND — 기사님이 없는 경우
 */
export const listMoverReviewsController: RequestHandler = async (
  request,
  response,
) => {
  const { moverId } = parseMoverIdParam(request.params);
  const query = parseListReviewsQuery(request.query);
  const result = await listMoverReviews(moverId, query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};
