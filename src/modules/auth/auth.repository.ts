/**
 * Auth Service에 필요한 User 조회·생성과 회원 탈퇴(soft delete·익명화) transaction을 Prisma로 수행합니다.
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
  role: true,
  passwordHash: true,
  socialProvider: true,
  socialId: true,
  customer: { select: { id: true, profileImageUrl: true } },
  // nickname은 익명화 전에 고객에게 보낼 탈퇴 알림 문구에 사용합니다.
  mover: { select: { id: true, profileImageUrl: true, nickname: true } },
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

/**
 * 토큰 subject가 현재 존재하는 사용자에 해당하는지 확인합니다.
 * 탈퇴(soft delete) 계정은 row가 남아 있어도 없는 사용자로 취급해 탈퇴 전에 발급된 Access/Refresh Token을 거절합니다.
 */
export function findUserById(userId: string): Promise<AuthUserRecord | null> {
  return prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: authUserSelect,
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
  return prisma.user.create({ data, select: authUserSelect });
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

/** 탈퇴 transaction 안에서 최신 인증 수단과 역할별 profile 식별자를 조회합니다. 이미 탈퇴한 계정은 null입니다. */
export function findUserForWithdrawal(
  transaction: AuthTransaction,
  userId: string,
): Promise<WithdrawalUserRecord | null> {
  return transaction.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: withdrawalUserSelect,
  });
}

/**
 * 탈퇴를 막아야 하는 "확정됐고 이사일이 아직 지나지 않은 이사" 건수를 셉니다.
 * 고객은 본인의 CONFIRMED 요청, 기사님은 본인의 CONFIRMED 견적이 걸린 CONFIRMED 요청이 대상입니다.
 * 이사일 기준은 이사 요청 취소 가능 판정(move-request.repository)과 같은 UTC 자정입니다.
 * @param now 판정 기준 시각
 * @returns 0이면 탈퇴를 진행할 수 있습니다
 */
export async function countUpcomingConfirmedMoves(
  transaction: AuthTransaction,
  user: WithdrawalUserRecord,
  now: Date,
): Promise<number> {
  const todayUtcMidnight = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const upcomingConfirmedMove = {
    status: "CONFIRMED",
    moveDate: { gte: todayUtcMidnight },
  } satisfies Prisma.MoveRequestWhereInput;

  const [customerMoves, moverMoves] = await Promise.all([
    user.customer
      ? transaction.moveRequest.count({
          where: { customerId: user.customer.id, ...upcomingConfirmedMove },
        })
      : 0,
    user.mover
      ? transaction.quote.count({
          where: {
            moverId: user.mover.id,
            status: "CONFIRMED",
            moveRequest: upcomingConfirmedMove,
          },
        })
      : 0,
  ]);

  return customerMoves + moverMoves;
}

/** 기사님 탈퇴로 삭제될 대기 견적 한 건과 알림을 받을 고객입니다. */
export interface PendingMoverQuoteRecord {
  quoteId: string;
  moveRequestId: string;
  customerUserId: string;
}

/** 탈퇴하는 기사님이 보낸 견적 중 고객이 아직 확정하지 않은 대기 견적을 조회합니다. */
export async function findPendingQuotesByMoverId(
  transaction: AuthTransaction,
  moverId: string,
): Promise<PendingMoverQuoteRecord[]> {
  const quotes = await transaction.quote.findMany({
    where: { moverId, status: "PROPOSED", moveRequest: { status: "WAITING" } },
    select: {
      id: true,
      moveRequestId: true,
      moveRequest: { select: { customer: { select: { userId: true } } } },
    },
  });

  return quotes.map((quote) => ({
    quoteId: quote.id,
    moveRequestId: quote.moveRequestId,
    customerUserId: quote.moveRequest.customer.userId,
  }));
}

/** QUOTE_CANCELED_BY_MOVER_WITHDRAWAL 알림으로 저장한 내용입니다. */
export interface CreatedMoverWithdrawalNotificationRecord {
  userId: string;
  moveRequestId: string;
  quoteId: string;
  type: "QUOTE_CANCELED_BY_MOVER_WITHDRAWAL";
  title: string;
  content: string;
  /** 언어별 알림 문장을 조립할 변수입니다. */
  params: { moverNickname: string };
}

/**
 * 기사님 탈퇴로 대기 견적이 사라지는 고객들에게 알림을 일괄 생성합니다.
 * 반드시 견적을 지우기 전에 호출합니다. Notification.quoteId는 Quote를 참조하므로 참조 대상이 있을 때 insert해야 하며,
 * 이후 견적이 삭제되면 onDelete: SetNull로 quoteId만 비워지고 알림 문구는 남습니다.
 * @param transaction 탈퇴 transaction client
 * @param input 익명화 전의 기사님 닉네임과 삭제될 대기 견적 목록
 * @returns 저장한 알림 목록(0건일 수 있음). Service가 transaction 커밋 뒤 SSE push에 사용합니다.
 */
export async function createMoverWithdrawalNotifications(
  transaction: AuthTransaction,
  input: { moverNickname: string; quotes: PendingMoverQuoteRecord[] },
): Promise<CreatedMoverWithdrawalNotificationRecord[]> {
  if (input.quotes.length === 0) return [];

  const notifications: CreatedMoverWithdrawalNotificationRecord[] = input.quotes.map(
    (quote) => ({
      userId: quote.customerUserId,
      moveRequestId: quote.moveRequestId,
      quoteId: quote.quoteId,
      type: "QUOTE_CANCELED_BY_MOVER_WITHDRAWAL",
      title: "받은 견적이 취소되었습니다.",
      content: `${input.moverNickname} 기사님이 계정을 탈퇴하여 보내드린 견적이 취소되었습니다.`,
      params: { moverNickname: input.moverNickname },
    }),
  );

  await transaction.notification.createMany({ data: notifications });

  return notifications;
}

/**
 * 탈퇴하는 기사님의 미완료 흔적을 지우고 검색·매칭 대상에서 빠지도록 관계를 정리합니다.
 * 확정된 견적(CONFIRMED)과 리뷰는 고객의 완료 이력으로 남깁니다.
 * RequestRejection은 FK가 Restrict라 Mover row를 남기더라도 반려 목록에 계속 노출되지 않게 함께 지웁니다.
 */
export async function deleteMoverWithdrawalRelations(
  transaction: AuthTransaction,
  moverId: string,
): Promise<void> {
  await transaction.quote.deleteMany({
    where: { moverId, status: { not: "CONFIRMED" } },
  });
  // 아직 견적을 받는 중인 요청의 지정만 지워 고객이 다른 기사님을 지정할 수 있게 합니다.
  await transaction.designatedRequest.deleteMany({
    where: { moverId, moveRequest: { status: "WAITING" } },
  });
  await transaction.requestRejection.deleteMany({ where: { moverId } });
  // 활동 지역·서비스가 없으면 기사님 찾기와 새 요청 알림 매칭에서 제외됩니다.
  await transaction.moverRegion.deleteMany({ where: { moverId } });
  await transaction.moverServiceType.deleteMany({ where: { moverId } });
}

/** 탈퇴 계정에 덮어쓸 익명화 값입니다. */
export interface WithdrawnAccountData {
  name: string;
  email: string;
  /** 기사님 계정일 때만 사용하는 유일한 대체 닉네임입니다. */
  moverNickname: string;
  deletedAt: Date;
}

/**
 * 조회 후 인증 수단이 바뀌지 않은 User만 탈퇴 처리해 비밀번호 변경과 탈퇴의 경쟁을 차단합니다.
 * 이름·이메일·전화번호·비밀번호·SNS 연결·복구 질문을 지워 같은 이메일·SNS로 즉시 재가입할 수 있게 하고,
 * 이 계정으로는 다시 로그인하거나 복구할 수 없게 합니다.
 * @returns count가 0이면 그사이 인증 수단이 바뀌었거나 이미 탈퇴한 계정입니다
 */
export function anonymizeUserWithAuthState(
  transaction: AuthTransaction,
  user: WithdrawalUserRecord,
  data: WithdrawnAccountData,
): Promise<{ count: number }> {
  return transaction.user.updateMany({
    where: {
      id: user.id,
      deletedAt: null,
      passwordHash: user.passwordHash,
      socialProvider: user.socialProvider,
      socialId: user.socialId,
    },
    data: {
      name: data.name,
      email: data.email,
      phone: null,
      passwordHash: null,
      recoveryQuestion: null,
      recoveryAnswerHash: null,
      socialProvider: null,
      socialId: null,
      deletedAt: data.deletedAt,
    },
  });
}

/**
 * User 익명화가 성공한 뒤 역할 profile의 개인정보와 본인만 보던 데이터를 정리합니다.
 * Customer/Mover row와 리뷰·완료된 견적·찜은 남기고, 프로필 이미지 주소·소개글·알림·재설정 코드는 지웁니다.
 */
export async function clearWithdrawnProfileData(
  transaction: AuthTransaction,
  user: WithdrawalUserRecord,
  data: WithdrawnAccountData,
): Promise<void> {
  if (user.customer) {
    await transaction.customer.update({
      where: { id: user.customer.id },
      data: { profileImageUrl: null },
    });
    await transaction.customerServiceType.deleteMany({
      where: { customerId: user.customer.id },
    });
  }

  if (user.mover) {
    await transaction.mover.update({
      where: { id: user.mover.id },
      data: {
        profileImageUrl: null,
        nickname: data.moverNickname,
        shortIntroduction: "",
        description: "",
      },
    });
  }

  await transaction.notification.deleteMany({ where: { userId: user.id } });
  await transaction.passwordResetChallenge.deleteMany({ where: { userId: user.id } });
}
