/**
 * 상태 변경 요청의 브라우저 출처를 검사해 cross-site 쿠키 요청을 차단합니다.
 * 허용 origin 목록 관리는 CORS 설정에 위임합니다.
 */
import type { RequestHandler } from "express";

import { ForbiddenError } from "../../errors/app-error";
import { isAllowedOrigin } from "../../../config/cors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** 안전하지 않은 HTTP method에 Fetch Metadata와 Origin 검사를 적용합니다. */
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
