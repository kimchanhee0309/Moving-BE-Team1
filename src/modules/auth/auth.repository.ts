/**
 * Auth Service에 필요한 User 조회·생성·회원 탈퇴 transaction을 Prisma로 수행합니다.
 * HTTP, cookie, JWT 정책은 다루지 않고 필요한 column과 profile 관계만 선택합니다.
 */
import type { PasswordRecoveryQuestion, Prisma, SocialProvider, UserRole } from "../../generated/prisma/client";
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

const withdrawalUserSelect = {
  id: true,
  passwordHash: true,
  socialProvider: true,
  socialId: true,
  customer: { select: { id: true, profileImageUrl: true } },
  mover: { select: { id: true, profileImageUrl: true } },
} satisfies Prisma.UserSelect;

export type AuthUserRecord = Prisma.UserGetPayload<{
  select: typeof authUserSelect;
}>;

/** 탈퇴 재인증·제약 정리·로컬 이미지 정리에 필요한 최소 사용자 정보입니다. */
export type WithdrawalUserRecord = Prisma.UserGetPayload<{
  select: typeof withdrawalUserSelect;
}>;

/** Auth의 원자적 회원 삭제에만 전달하는 Prisma transaction client입니다. */
export type AuthTransaction = Prisma.TransactionClient;

interface CreateEmailUserData {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: UserRole;
  recoveryQuestion: PasswordRecoveryQuestion;
  recoveryAnswerHash: string;
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

/** 재설정 토큰 발급 뒤 기존 password hash가 바뀌지 않은 이메일 계정만 갱신합니다. */
export function updateEmailUserPassword(
  userId: string,
  currentPasswordHash: string,
  nextPasswordHash: string,
): Promise<{ count: number }> {
  return prisma.user.updateMany({
    where: { id: userId, passwordHash: currentPasswordHash },
    data: { passwordHash: nextPasswordHash },
  });
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
  const { recoveryQuestion, recoveryAnswerHash, ...userData } = data;
  return prisma.user.create({
    data: {
      ...userData,
      passwordRecoveryChallenge: {
        create: { question: recoveryQuestion, answerHash: recoveryAnswerHash },
      },
    },
    select: authUserSelect,
  });
}

const recoveryUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  passwordHash: true,
  socialProvider: true,
  passwordRecoveryChallenge: {
    select: { question: true, answerHash: true },
  },
} satisfies Prisma.UserSelect;

export type RecoveryUserRecord = Prisma.UserGetPayload<{ select: typeof recoveryUserSelect }>;

export function findRecoveryUserByEmail(email: string): Promise<RecoveryUserRecord | null> {
  return prisma.user.findUnique({ where: { email }, select: recoveryUserSelect });
}

/** OAuth 최초 가입에서는 User만 만들며 password와 역할 profile은 생성하지 않습니다. */
export function createOAuthUser(data: CreateOAuthUserData): Promise<AuthUserRecord> {
  return prisma.user.create({ data, select: authUserSelect });
}

/** 여러 연관 삭제와 User 조건부 삭제를 한 transaction으로 실행합니다. */
export function runAuthTransaction<T>(
  operation: (transaction: AuthTransaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(operation);
}

/** 탈퇴 transaction 안에서 최신 인증 수단과 역할별 profile 식별자를 조회합니다. */
export function findUserForWithdrawal(
  transaction: AuthTransaction,
  userId: string,
): Promise<WithdrawalUserRecord | null> {
  return transaction.user.findUnique({
    where: { id: userId },
    select: withdrawalUserSelect,
  });
}

/**
 * Cascade가 아닌 RequestRejection FK를 User 삭제 전에 정리합니다.
 * Customer의 요청에 달린 반려와 Mover 본인의 반려를 모두 처리해 비정상 복수 profile 데이터도 막지 않게 합니다.
 */
export async function deleteRestrictedWithdrawalRelations(
  transaction: AuthTransaction,
  user: WithdrawalUserRecord,
): Promise<void> {
  if (user.customer) {
    await transaction.requestRejection.deleteMany({
      where: { moveRequest: { customerId: user.customer.id } },
    });
  }

  if (user.mover) {
    await transaction.requestRejection.deleteMany({
      where: { moverId: user.mover.id },
    });
  }
}

/** 조회 후 인증 수단이 바뀌지 않은 User만 삭제하여 비밀번호 변경과 탈퇴의 경쟁을 차단합니다. */
export function deleteUserWithAuthState(
  transaction: AuthTransaction,
  user: WithdrawalUserRecord,
): Promise<{ count: number }> {
  return transaction.user.deleteMany({
    where: {
      id: user.id,
      passwordHash: user.passwordHash,
      socialProvider: user.socialProvider,
      socialId: user.socialId,
    },
  });
}
