import type { RequestHandler } from "express";

import { ForbiddenError } from "../errors/app-error";
import { isAllowedOrigin } from "../../config/cors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const csrfOriginGuard: RequestHandler = (request, _response, next) => {
  if (SAFE_METHODS.has(request.method)) {
    next();
    return;
  }

  const fetchSite = request.get("sec-fetch-site");

  if (fetchSite === "cross-site") {
    next(
      new ForbiddenError(
        "허용되지 않은 요청 출처입니다.",
        "CSRF_ORIGIN_DENIED",
      ),
    );

    return;
  }

  const origin = request.get("origin");

  if (origin !== undefined && !isAllowedOrigin(origin)) {
    next(
      new ForbiddenError(
        "허용되지 않은 요청 출처입니다.",
        "CSRF_ORIGIN_DENIED",
      ),
    );

    return;
  }
  next();
};
