/**
 * 여러 도메인의 profile 접근 검사에 필요한 최소 relation만 조회합니다.
 * profile 내용이나 수정 로직은 각 Customer/Mover profile 모듈에 맡깁니다.
 */
import type { UserRole } from "../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";

export interface UserProfileState {
  role: UserRole;
  customer: { id: string } | null;
  mover: { id: string } | null;
}

/**
 * 인증 사용자 존재 여부와 역할별 profile relation을 최소 select로 조회합니다.
 * 탈퇴(soft delete) 계정은 row가 남아 있어도 없는 사용자로 취급해, 탈퇴 전에 발급된 토큰으로 profile 기능에 들어오지 못하게 합니다.
 */
export function findUserProfileState(
  userId: string,
): Promise<UserProfileState | null> {
  return prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      role: true,
      customer: { select: { id: true } },
      mover: { select: { id: true } },
    },
  });
}
