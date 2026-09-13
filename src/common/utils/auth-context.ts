/**
 * 인증 미들웨어가 만든 요청 컨텍스트를 팀의 도메인 Controller가 안전하게 읽도록 돕습니다.
 * Cookie나 JWT를 다시 해석하지 않으며 Service에 전달할 최소 식별자만 제공합니다.
 */
import type { Request } from "express";

import type { UserRole } from "../../generated/prisma/enums";
import { ForbiddenError, UnauthorizedError } from "../errors/app-error";

/** 검증된 Access Token에서 복원한 공통 인증 주체입니다. */
export interface AuthContext {
  userId: string;
  role: UserRole;
  profileId?: string;
}

/** requireProfile 통과 후 역할별 profile ID가 보장된 인증 주체입니다. */
export interface ProfileAuthContext extends AuthContext {
  profileId: string;
}

/** authenticate 이후의 인증 주체를 반환하며 미들웨어 누락도 공통 401로 처리합니다. */
export function getAuthContext(request: Request): AuthContext {
  if (!request.auth) {
    throw new UnauthorizedError("로그인이 필요합니다.", "ACCESS_TOKEN_MISSING");
  }

  return request.auth;
}

/** requireProfile 이후 profile ID까지 보장해 unsafe assertion 없이 Service에 전달하게 합니다. */
export function getProfileAuthContext(request: Request): ProfileAuthContext {
  const context = getAuthContext(request);

  if (!context.profileId) {
    throw new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED");
  }

  return {
    userId: context.userId,
    role: context.role,
    profileId: context.profileId,
  };
}
