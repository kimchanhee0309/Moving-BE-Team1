/**
 * Auth Service에 필요한 User 조회와 생성을 Prisma로 수행합니다.
 * HTTP, cookie, JWT 정책은 다루지 않고 필요한 column과 profile 관계만 선택합니다.
 */
import type { Prisma, SocialProvider, UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

const authUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  passwordHash: true,
  customer: { select: { id: true } },
  mover: { select: { id: true } },
} satisfies Prisma.UserSelect;

export type AuthUserRecord = Prisma.UserGetPayload<{
  select: typeof authUserSelect;
}>;

interface CreateEmailUserData {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: UserRole;
}

interface CreateOAuthUserData {
  name: string;
  email: string;
  role: UserRole;
  socialProvider: SocialProvider;
  socialId: string;
}

/** 중복 확인과 로그인에 사용할 이메일 계정을 조회합니다. */
export function findUserByEmail(email: string): Promise<AuthUserRecord | null> {
  return prisma.user.findUnique({ where: { email }, select: authUserSelect });
}

/** 회원가입 시 전화번호 고유 제약 충돌을 사전에 사용자 오류로 변환하기 위해 조회합니다. */
export function findUserByPhone(phone: string): Promise<AuthUserRecord | null> {
  return prisma.user.findUnique({ where: { phone }, select: authUserSelect });
}

/** 토큰 subject가 현재 존재하는 사용자에 해당하는지 확인합니다. */
export function findUserById(userId: string): Promise<AuthUserRecord | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: authUserSelect });
}

/** 공급자와 공급자 고유 ID의 복합 식별자로 기존 OAuth 사용자를 조회합니다. */
export function findUserBySocialAccount(
  socialProvider: SocialProvider,
  socialId: string,
): Promise<AuthUserRecord | null> {
  return prisma.user.findUnique({
    where: { socialProvider_socialId: { socialProvider, socialId } },
    select: authUserSelect,
  });
}

/** 검증·해싱이 끝난 일반 이메일 사용자를 생성하며 역할별 profile은 별도 기능에서 만듭니다. */
export function createEmailUser(data: CreateEmailUserData): Promise<AuthUserRecord> {
  return prisma.user.create({ data, select: authUserSelect });
}

/** OAuth 최초 가입에서는 User만 만들며 password와 역할 profile은 생성하지 않습니다. */
export function createOAuthUser(data: CreateOAuthUserData): Promise<AuthUserRecord> {
  return prisma.user.create({ data, select: authUserSelect });
}
