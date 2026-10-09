/**
 * Auth Service에 필요한 User 조회·생성, 회원가입 이메일 인증·비밀번호 재설정 기록, 회원 탈퇴 transaction을 Prisma로 수행합니다.
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

/** 이메일 인증 기록 소비와 같은 transaction에서 일반 이메일 사용자를 생성합니다. */
export function createEmailUserInTransaction(
  transaction: AuthTransaction,
  data: CreateEmailUserData,
): Promise<AuthUserRecord> {
  return transaction.user.create({ data, select: authUserSelect });
}

const signupEmailVerificationSelect = {
  id: true,
  email: true,
  codeHash: true,
  failedAttempts: true,
  expiresAt: true,
  sentAt: true,
  verifiedAt: true,
} satisfies Prisma.SignupEmailVerificationSelect;

/** 회원가입 이메일 인증의 코드 hash·만료·시도 횟수·검증 상태입니다. 코드 원문은 포함하지 않습니다. */
export type SignupEmailVerificationRecord =
  Prisma.SignupEmailVerificationGetPayload<{
    select: typeof signupEmailVerificationSelect;
  }>;

export interface SignupEmailVerificationReservation {
  verificationId: string;
  /** 발송 실패 시 되돌릴 직전 상태이며 첫 요청이면 null입니다. */
  previous: SignupEmailVerificationRecord | null;
}

/**
 * 가입 전에는 잠글 User row가 없으므로 이메일 단위 advisory lock으로 같은 이메일의 동시 요청을 직렬화합니다.
 * transaction이 끝나면 자동으로 풀리며, hashtext 충돌은 서로 다른 이메일이 잠깐 기다리는 것 외에 영향이 없습니다.
 */
async function lockSignupEmail(
  transaction: AuthTransaction,
  email: string,
): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;
}

/**
 * 이메일 lock 안에서 재발송 간격을 확인하고 새 인증코드 상태를 한 번만 예약합니다.
 * @param email 소문자 정규화 이메일
 * @param codeHash 새 코드의 HMAC
 * @param sentAt 발송 기준 시각
 * @param expiresAt 코드 만료 시각
 * @param resendAllowedAt 이 시각보다 늦게 보낸 기록이 있으면 재발송을 거절합니다
 * @param staleBefore 이 시각 전에 만료된 다른 이메일의 기록을 정리합니다
 * @returns 예약 결과이며 재발송 간격이 지나지 않았으면 null
 * @remarks 가입하지 않고 떠난 이메일이 계속 쌓이지 않도록 오래된 기록을 같은 transaction에서 삭제합니다.
 */
export function reserveSignupEmailVerification(
  email: string,
  codeHash: string,
  sentAt: Date,
  expiresAt: Date,
  resendAllowedAt: Date,
  staleBefore: Date,
): Promise<SignupEmailVerificationReservation | null> {
  return prisma.$transaction(async (transaction) => {
    await lockSignupEmail(transaction, email);
    await transaction.signupEmailVerification.deleteMany({
      where: { expiresAt: { lt: staleBefore } },
    });

    const previous = await transaction.signupEmailVerification.findUnique({
      where: { email },
      select: signupEmailVerificationSelect,
    });

    if (previous && previous.sentAt.getTime() > resendAllowedAt.getTime()) {
      return null;
    }

    const verification = await transaction.signupEmailVerification.upsert({
      where: { email },
      create: { email, codeHash, sentAt, expiresAt },
      // 새 코드를 보내면 이전 코드와 그 코드로 받은 인증 토큰을 모두 무효화합니다.
      update: {
        codeHash,
        sentAt,
        expiresAt,
        failedAttempts: 0,
        verifiedAt: null,
      },
      select: { id: true },
    });

    return { verificationId: verification.id, previous };
  });
}

/** 발송 실패한 예약이 여전히 최신일 때만 직전 인증 상태를 복원하거나 최초 예약을 삭제합니다. */
export function restoreSignupEmailVerification(
  email: string,
  failedCodeHash: string,
  previous: SignupEmailVerificationRecord | null,
): Promise<{ count: number }> {
  return prisma.$transaction(async (transaction) => {
    await lockSignupEmail(transaction, email);

    if (!previous) {
      return transaction.signupEmailVerification.deleteMany({
        where: { email, codeHash: failedCodeHash },
      });
    }

    return transaction.signupEmailVerification.updateMany({
      where: { email, codeHash: failedCodeHash },
      data: {
        codeHash: previous.codeHash,
        failedAttempts: previous.failedAttempts,
        expiresAt: previous.expiresAt,
        sentAt: previous.sentAt,
        verifiedAt: previous.verifiedAt,
      },
    });
  });
}

/** 입력 코드 확인에 필요한 이메일의 최신 인증 기록을 조회합니다. */
export function findSignupEmailVerificationByEmail(
  email: string,
): Promise<SignupEmailVerificationRecord | null> {
  return prisma.signupEmailVerification.findUnique({
    where: { email },
    select: signupEmailVerificationSelect,
  });
}

/** 만료·검증 완료·최대 횟수를 조건으로 코드 확인 시도 한 건을 먼저 원자적으로 예약합니다. */
export function reserveSignupEmailCodeAttempt(
  verificationId: string,
  expectedCodeHash: string,
  attemptedAt: Date,
  maxAttempts: number,
): Promise<SignupEmailVerificationRecord | null> {
  return prisma.$transaction(async (transaction) => {
    const reservation = await transaction.signupEmailVerification.updateMany({
      where: {
        id: verificationId,
        codeHash: expectedCodeHash,
        expiresAt: { gt: attemptedAt },
        failedAttempts: { lt: maxAttempts },
        verifiedAt: null,
      },
      data: { failedAttempts: { increment: 1 } },
    });

    if (reservation.count !== 1) return null;

    return transaction.signupEmailVerification.findUnique({
      where: { id: verificationId },
      select: signupEmailVerificationSelect,
    });
  });
}

/** 현재 코드 hash와 제한 상태가 그대로인 인증 기록 한 건만 검증 완료 처리합니다. */
export function markSignupEmailVerificationVerified(
  verificationId: string,
  codeHash: string,
  verifiedAt: Date,
  maxFailedAttempts: number,
): Promise<{ count: number }> {
  return prisma.signupEmailVerification.updateMany({
    where: {
      id: verificationId,
      codeHash,
      expiresAt: { gt: verifiedAt },
      failedAttempts: { lte: maxFailedAttempts },
      verifiedAt: null,
    },
    data: { verifiedAt },
  });
}

/**
 * 가입 transaction에서 검증 완료된 인증 기록을 삭제해 같은 인증 토큰의 재사용과 병렬 가입을 차단합니다.
 * 가입이 실패해 transaction이 rollback되면 기록이 남아 같은 토큰으로 다시 시도할 수 있습니다.
 */
export function consumeSignupEmailVerification(
  transaction: AuthTransaction,
  verificationId: string,
  email: string,
): Promise<{ count: number }> {
  return transaction.signupEmailVerification.deleteMany({
    where: { id: verificationId, email, verifiedAt: { not: null } },
  });
}

const passwordResetUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  passwordHash: true,
  socialProvider: true,
  passwordResetChallenge: {
    select: { id: true, sentAt: true },
  },
} satisfies Prisma.UserSelect;

export type PasswordResetUserRecord = Prisma.UserGetPayload<{
  select: typeof passwordResetUserSelect;
}>;

/** 이름·역할·인증 수단 확인과 코드 재발송 제한에 필요한 사용자를 조회합니다. */
export function findPasswordResetUserByEmail(
  email: string,
): Promise<PasswordResetUserRecord | null> {
  return prisma.user.findUnique({
    where: { email },
    select: passwordResetUserSelect,
  });
}

const passwordResetChallengeSelect = {
  id: true,
  userId: true,
  codeHash: true,
  failedAttempts: true,
  expiresAt: true,
  sentAt: true,
  verifiedAt: true,
  consumedAt: true,
  user: {
    select: {
      id: true,
      role: true,
      passwordHash: true,
    },
  },
} satisfies Prisma.PasswordResetChallengeSelect;

export type PasswordResetChallengeRecord = Prisma.PasswordResetChallengeGetPayload<{
  select: typeof passwordResetChallengeSelect;
}>;

const passwordResetChallengeStateSelect = {
  id: true,
  codeHash: true,
  failedAttempts: true,
  expiresAt: true,
  sentAt: true,
  verifiedAt: true,
  consumedAt: true,
} satisfies Prisma.PasswordResetChallengeSelect;

export type PasswordResetChallengeState = Prisma.PasswordResetChallengeGetPayload<{
  select: typeof passwordResetChallengeStateSelect;
}>;

export interface PasswordResetChallengeReservation {
  challengeId: string;
  previous: PasswordResetChallengeState | null;
}

async function lockPasswordResetUser(
  transaction: AuthTransaction,
  userId: string,
): Promise<void> {
  await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE
  `;
}

/** User row lock 안에서 재발송 간격을 확인하고 새 코드 상태를 한 번만 예약합니다. */
export function reservePasswordResetChallenge(
  userId: string,
  codeHash: string,
  sentAt: Date,
  expiresAt: Date,
  resendAllowedAt: Date,
): Promise<PasswordResetChallengeReservation | null> {
  return prisma.$transaction(async (transaction) => {
    await lockPasswordResetUser(transaction, userId);
    const previous = await transaction.passwordResetChallenge.findUnique({
      where: { userId },
      select: passwordResetChallengeStateSelect,
    });

    if (previous && previous.sentAt.getTime() > resendAllowedAt.getTime()) {
      return null;
    }

    const challenge = await transaction.passwordResetChallenge.upsert({
      where: { userId },
      create: { userId, codeHash, sentAt, expiresAt },
      update: {
        codeHash,
        sentAt,
        expiresAt,
        failedAttempts: 0,
        // 복구 답변 확인은 제거했지만 컬럼은 남겨 두었으므로, 새 코드를 발급할 때 이전 challenge의 답변 시도 횟수가 남지 않게 초기화합니다.
        // 구버전 서버가 같은 challenge를 읽더라도 소진된 횟수 때문에 새 재설정이 막히지 않습니다. 컬럼 제거 시 함께 삭제합니다.
        recoveryAnswerAttempts: 0,
        verifiedAt: null,
        consumedAt: null,
      },
      select: { id: true },
    });

    return { challengeId: challenge.id, previous };
  });
}

/** 발송 실패한 예약이 여전히 최신일 때만 직전 challenge를 복원하거나 최초 예약을 삭제합니다. */
export function restorePasswordResetChallenge(
  userId: string,
  failedCodeHash: string,
  previous: PasswordResetChallengeState | null,
): Promise<{ count: number }> {
  return prisma.$transaction(async (transaction) => {
    await lockPasswordResetUser(transaction, userId);

    if (!previous) {
      return transaction.passwordResetChallenge.deleteMany({
        where: { userId, codeHash: failedCodeHash },
      });
    }

    return transaction.passwordResetChallenge.updateMany({
      where: { userId, codeHash: failedCodeHash },
      data: {
        codeHash: previous.codeHash,
        failedAttempts: previous.failedAttempts,
        expiresAt: previous.expiresAt,
        sentAt: previous.sentAt,
        verifiedAt: previous.verifiedAt,
        consumedAt: previous.consumedAt,
      },
    });
  });
}

/** 입력 코드 검증과 재설정 토큰 발급에 필요한 challenge와 현재 User 인증 상태를 조회합니다. */
export function findPasswordResetChallengeById(
  challengeId: string,
): Promise<PasswordResetChallengeRecord | null> {
  return prisma.passwordResetChallenge.findUnique({
    where: { id: challengeId },
    select: passwordResetChallengeSelect,
  });
}

/** 만료·검증·소비·최대 횟수를 조건으로 검증 시도 한 건을 먼저 원자적으로 예약합니다. */
export function reservePasswordResetCodeAttempt(
  challengeId: string,
  expectedCodeHash: string,
  attemptedAt: Date,
  maxAttempts: number,
): Promise<PasswordResetChallengeRecord | null> {
  return prisma.$transaction(async (transaction) => {
    const reservation = await transaction.passwordResetChallenge.updateMany({
      where: {
        id: challengeId,
        codeHash: expectedCodeHash,
        expiresAt: { gt: attemptedAt },
        failedAttempts: { lt: maxAttempts },
        verifiedAt: null,
        consumedAt: null,
      },
      data: { failedAttempts: { increment: 1 } },
    });

    if (reservation.count !== 1) return null;

    return transaction.passwordResetChallenge.findUnique({
      where: { id: challengeId },
      select: passwordResetChallengeSelect,
    });
  });
}

/** 현재 코드 hash와 제한 상태가 그대로인 challenge 한 건만 검증 완료 처리합니다. */
export function markPasswordResetChallengeVerified(
  challengeId: string,
  codeHash: string,
  verifiedAt: Date,
  maxFailedAttempts: number,
): Promise<{ count: number }> {
  return prisma.passwordResetChallenge.updateMany({
    where: {
      id: challengeId,
      codeHash,
      expiresAt: { gt: verifiedAt },
      failedAttempts: { lte: maxFailedAttempts },
      verifiedAt: null,
      consumedAt: null,
    },
    data: { verifiedAt },
  });
}

/** 비밀번호 변경 transaction에서 검증 완료·미사용 challenge와 현재 password hash를 조회합니다. */
export function findPasswordResetChallengeForCompletion(
  transaction: AuthTransaction,
  challengeId: string,
): Promise<PasswordResetChallengeRecord | null> {
  return transaction.passwordResetChallenge.findUnique({
    where: { id: challengeId },
    select: passwordResetChallengeSelect,
  });
}

/** 검증 완료 challenge를 한 번만 소비해 같은 재설정 토큰의 병렬 사용을 차단합니다. */
export function consumePasswordResetChallenge(
  transaction: AuthTransaction,
  challengeId: string,
  userId: string,
  consumedAt: Date,
): Promise<{ count: number }> {
  return transaction.passwordResetChallenge.updateMany({
    where: {
      id: challengeId,
      userId,
      verifiedAt: { not: null },
      consumedAt: null,
    },
    data: { consumedAt },
  });
}

/** challenge 소비 transaction 안에서 조회한 기존 hash가 같은 이메일 계정만 갱신합니다. */
export function updateEmailUserPassword(
  transaction: AuthTransaction,
  userId: string,
  currentPasswordHash: string,
  nextPasswordHash: string,
): Promise<{ count: number }> {
  return transaction.user.updateMany({
    where: { id: userId, passwordHash: currentPasswordHash },
    data: { passwordHash: nextPasswordHash },
  });
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
