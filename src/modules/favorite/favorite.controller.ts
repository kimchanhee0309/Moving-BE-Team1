/**
 * Favorite Router의 HTTP 입력을 DTO로 변환하고 Service 결과를 공통 응답으로 반환합니다.
 * 권한·중복·상태 검사는 Service에 두고, cookie/JWT는 다시 해석하지 않습니다.
 *
 * 처리 흐름: params/query 검증 → profile 인증 컨텍스트 추출 → Service 호출 → sendSuccess/sendNoContent
 */

import type { Request } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import {
  sendNoContent,
  sendSuccess,
  type SendableHttpResponse,
} from "../../common/response/api-response";
import { getProfileAuthContext } from "../../common/utils/auth-context";
import { addFavorite, listFavorites, removeFavorite } from "./favorite.service";
import { parseListFavoritesQuery, parseMoverIdParam } from "./favorite.validator";

/** Favorite Controller가 읽는 요청 필드입니다. Express Request는 이 계약을 만족합니다. */
type FavoriteRequest = Pick<Request, "auth" | "params" | "query">;

/**
 * 경로의 기사님을 현재 고객 찜에 추가하고 data.favorite를 201로 반환합니다.
 *
 * @throws BadRequestError VALIDATION_ERROR — moverId 형식 오류
 * @throws UnauthorizedError / ForbiddenError — guard가 먼저 처리한 인증·역할·프로필 오류
 * @throws NotFoundError MOVER_NOT_FOUND — 기사님이 없는 경우
 * @throws ConflictError FAVORITE_ALREADY_EXISTS — 이미 찜한 경우
 * @sideEffects Favorite 행을 생성합니다.
 */
export async function addFavoriteController(
  request: FavoriteRequest,
  response: SendableHttpResponse,
): Promise<unknown> {
  const auth = getProfileAuthContext(request);
  const { moverId } = parseMoverIdParam(request.params);
  const favorite = await addFavorite(auth.profileId, moverId);

  return sendSuccess(response, HTTP_STATUS.CREATED, { favorite });
}

/**
 * 현재 고객의 찜 목록을 data.items와 page pagination으로 반환합니다.
 *
 * @throws BadRequestError VALIDATION_ERROR — page/pageSize 오류
 * @throws UnauthorizedError / ForbiddenError — 인증·역할·프로필 오류
 */
export async function listFavoritesController(
  request: FavoriteRequest,
  response: SendableHttpResponse,
): Promise<unknown> {
  const auth = getProfileAuthContext(request);
  const query = parseListFavoritesQuery(request.query);
  const result = await listFavorites(auth.profileId, query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
}

/**
 * 현재 고객의 특정 기사님 찜을 해제하고 본문 없이 204를 반환합니다.
 *
 * @throws BadRequestError VALIDATION_ERROR — moverId 형식 오류
 * @throws NotFoundError FAVORITE_NOT_FOUND — 찜이 없는 경우
 * @sideEffects Favorite 행을 삭제합니다.
 */
export async function removeFavoriteController(
  request: FavoriteRequest,
  response: SendableHttpResponse,
): Promise<unknown> {
  const auth = getProfileAuthContext(request);
  const { moverId } = parseMoverIdParam(request.params);

  await removeFavorite(auth.profileId, moverId);

  return sendNoContent(response);
}
