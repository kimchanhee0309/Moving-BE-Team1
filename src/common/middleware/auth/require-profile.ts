/**
 * 인증 사용자의 역할별 Customer/Mover profile 존재 여부를 검사합니다.
 * 토큰에 오래된 profile 상태를 넣지 않고 DB의 현재 관계를 확인하여 기능 접근을 결정합니다.
 */
import type { RequestHandler } from "express";

import { ForbiddenError, UnauthorizedError } from "../../errors/app-error";
import { findUserProfileState } from "../../utils/user-profile";

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

    // DB 역할이 바뀌었거나 오래된 Token이면 반대 역할 profile을 통과시키지 않습니다.
    if (user.role !== request.auth.role) {
      next(
        new UnauthorizedError(
          "인증 정보가 최신 상태가 아닙니다.",
          "ACCESS_TOKEN_INVALID",
        ),
      );
      return;
    }

    const profile =
      request.auth.role === "CUSTOMER"
        ? user.customer
        : user.mover;

    if (!profile) {
      next(new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED"));
      return;
    }

    // 후속 Controller는 역할별 table을 다시 조회하지 않고 검증된 profile ID를 사용할 수 있습니다.
    request.auth.profileId = profile.id;

    next();
  } catch (error: unknown) {
    next(error);
  }
};
