import type { RequestHandler } from "express";

import { NotFoundError } from "../errors/app-error";

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new NotFoundError(
      `${request.method} 요청에 해당하는 API가 없습니다.`,
      "API_NOT_FOUND",
    ),
  );
};
