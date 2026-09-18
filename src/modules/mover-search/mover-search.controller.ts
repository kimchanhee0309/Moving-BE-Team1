/**
 * 기사님 찾기 HTTP 입력을 Service에 전달하고 공통 성공 응답만 반환합니다.
 * 권한·상태 전이·Prisma는 담당하지 않습니다. 목록·상세·추천 모두 공개 API입니다.
 */
import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import {
  getMoverById,
  listMovers,
  listRecommendedMovers,
} from "./mover-search.service";
import {
  parseMoverSearchIdParams,
  parseMoverSearchQuery,
} from "./mover-search.validator";

/**
 * GET /movers 목록. query를 검증한 뒤 items/nextPage/totalCount를 반환합니다.
 */
export const listMoversController: RequestHandler = async (
  request,
  response,
) => {
  const query = parseMoverSearchQuery(request.query);
  const result = await listMovers(query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/**
 * GET /movers/recommended 추천 3명. query 없이 items만 반환합니다.
 */
export const listRecommendedMoversController: RequestHandler = async (
  _request,
  response,
) => {
  const result = await listRecommendedMovers();

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/**
 * GET /movers/:id 상세. UUID params를 검증한 뒤 { mover }를 반환합니다.
 */
export const getMoverByIdController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = parseMoverSearchIdParams(request.params);
  const mover = await getMoverById(id);

  return sendSuccess(response, HTTP_STATUS.OK, { mover });
};
