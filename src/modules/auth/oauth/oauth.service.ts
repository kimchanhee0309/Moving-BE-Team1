/**
 * OAuth 사용자의 조회·최초 생성·이메일 충돌·역할 일치 정책을 처리합니다.
 * 공급자 통신과 HTTP redirect/cookie 처리는 각각 provider와 Controller에 위임합니다.
 */
import type { UserRole } from "../../../generated/prisma/enums";
import { BadRequestError, ConflictError } from "../../../common/errors/app-error";
import { createAuthTokens } from "../../../common/utils/auth-token";
import type { AuthResult } from "../auth.dto";
import { toAuthUserDto } from "../auth.mapper";
import {
  createOAuthUser,
  findUserByEmail,
  findUserBySocialAccount,
} from "../auth.repository";
import type { OAuthProfile } from "./oauth.dto";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function throwAccountConflict(): never {
  throw new ConflictError(
    "같은 이메일로 가입된 계정이 있습니다. 기존 가입 방식으로 로그인해 주세요.",
    "OAUTH_ACCOUNT_CONFLICT",
  );
}

/**
 * 소셜 ID를 우선 조회하고, 신규 가입에서 같은 이메일 자동 병합을 금지합니다.
 * 신규 사용자는 User만 생성하며 공급자 Access Token은 저장하지 않습니다.
 */
export async function authenticateWithOAuth(
  profile: OAuthProfile,
  requestedRole: UserRole,
): Promise<AuthResult> {
  const socialUser = await findUserBySocialAccount(profile.provider, profile.socialId);

  if (socialUser) {
    if (socialUser.role !== requestedRole) {
      throw new ConflictError(
        "가입한 계정 유형의 로그인 페이지를 이용해 주세요.",
        "ROLE_MISMATCH",
      );
    }

    return {
      user: toAuthUserDto(socialUser),
      tokens: createAuthTokens(socialUser.id, socialUser.role),
    };
  }

  if (!profile.email) {
    throw new BadRequestError(
      "SNS 계정에서 이메일을 제공받지 못했습니다.",
      "OAUTH_EMAIL_REQUIRED",
    );
  }

  if (await findUserByEmail(profile.email)) {
    return throwAccountConflict();
  }

  try {
    const user = await createOAuthUser({
      name: profile.name,
      email: profile.email,
      role: requestedRole,
      socialProvider: profile.provider,
      socialId: profile.socialId,
    });

    return {
      user: toAuthUserDto(user),
      tokens: createAuthTokens(user.id, user.role),
    };
  } catch (error: unknown) {
    // 사전 조회와 생성 사이의 경쟁 요청도 계정 병합 없이 동일한 충돌로 종료합니다.
    if (isUniqueConstraintError(error)) {
      return throwAccountConflict();
    }
    throw error;
  }
}
