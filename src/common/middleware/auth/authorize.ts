/**
 * 인증된 사용자가 endpoint에 허용된 역할인지 검사합니다.
 * JWT 검증은 authenticate가, resource 소유권은 각 도메인 Service가 담당합니다.
 */
import type { RequestHandler } from "express";

import type { UserRole } from "../../../generated/prisma/enums";
import { ForbiddenError, UnauthorizedError } from "../../errors/app-error";

/** 허용 역할 목록을 받아 재사용 가능한 역할 인가 미들웨어를 생성합니다. */
export function authorize(...allowedRoleList: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new UnauthorizedError("로그인이 필요합니다.", "ACCESS_TOKEN_MISSING"));
      return;
    }

    if (!allowedRoleList.includes(request.auth.role)) {
      next(new ForbiddenError("접근할 수 없는 역할입니다.", "ROLE_MISMATCH"));
      return;
    }

    next();
  };
}
