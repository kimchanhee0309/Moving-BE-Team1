/**
 * 등록된 Router가 처리하지 못한 요청을 공통 API_NOT_FOUND 오류로 변환합니다.
 * 응답 직렬화는 뒤따르는 공통 error handler가 담당합니다.
 */
import type { RequestHandler } from "express";

import { NotFoundError } from "../../errors/app-error";

/** 현재 method와 경로에 대응하는 API가 없음을 다음 오류 미들웨어에 전달합니다. */
export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new NotFoundError(
      `${request.method} 요청에 해당하는 API가 없습니다.`,
      "API_NOT_FOUND",
    ),
  );
};
