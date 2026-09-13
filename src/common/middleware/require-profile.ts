/**
 * 인증 사용자의 역할별 Customer/Mover profile 존재 여부를 검사합니다.
 * 토큰에 오래된 profile 상태를 넣지 않고 DB의 현재 관계를 확인하여 기능 접근을 결정합니다.
 */
import type { RequestHandler } from "express";

import { ForbiddenError, UnauthorizedError } from "../errors/app-error";
import { findUserProfileState } from "../utils/user-profile";

/** profile이 필요한 도메인 Router에서 인증·역할 검사 다음에 적용합니다. */
export const requireProfile: RequestHandler = async (
  request,
  _response,
  next,
) => {
  if (!request.auth) {
    next(new UnauthorizedError("로그인이 필요합니다.", "ACCESS_TOKEN_MISSING"));
    return;
  }

  try {
    const user = await findUserProfileState(request.auth.userId);

    if (!user) {
      next(new UnauthorizedError("사용자 정보를 확인할 수 없습니다.", "USER_NOT_FOUND"));
      return;
    }

    const hasProfile =
      request.auth.role === "CUSTOMER"
        ? user.customer !== null
        : user.mover !== null;

    if (!hasProfile) {
      next(new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED"));
      return;
    }

    next();
  } catch (error: unknown) {
    next(error);
  }
};
