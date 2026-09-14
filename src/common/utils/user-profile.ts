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

/** 인증 사용자 존재 여부와 역할별 profile relation을 최소 select로 조회합니다. */
export function findUserProfileState(
  userId: string,
): Promise<UserProfileState | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      customer: { select: { id: true } },
      mover: { select: { id: true } },
    },
  });
}
