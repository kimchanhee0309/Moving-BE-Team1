/**
 * 회원 탈퇴 Repository가 최신 인증 상태를 조건에 포함해 soft delete·익명화하고,
 * 확정 이사 차단 조건과 기사님 미완료 데이터 정리 범위를 지키는지 검증합니다.
 */
jest.mock("../../src/lib/prisma", () => ({
  prisma: { $transaction: jest.fn() },
}));

import { prisma } from "../../src/lib/prisma";
import {
  anonymizeUserWithAuthState,
  clearWithdrawnProfileData,
  countUpcomingConfirmedMoves,
  createMoverWithdrawalNotifications,
  deleteMoverWithdrawalRelations,
  findPendingQuotesByMoverId,
  findUserForWithdrawal,
  reservePasswordResetChallenge,
  reservePasswordResetCodeAttempt,
  restorePasswordResetChallenge,
  type AuthTransaction,
  type WithdrawalUserRecord,
} from "../../src/modules/auth/auth.repository";

const withdrawalUser: WithdrawalUserRecord = {
  id: "user-id",
  role: "CUSTOMER",
  passwordHash: "bcrypt-hash",
  socialProvider: null,
  socialId: null,
  customer: { id: "customer-id", profileImageUrl: null },
  mover: { id: "mover-id", profileImageUrl: null, nickname: "김기사" },
};

describe("Auth withdrawal repository", () => {
  const now = new Date("2026-10-09T03:00:00.000Z");
  const withdrawnAccount = {
    name: "탈퇴한 회원",
    email: "withdrawn-user-id@withdrawn.invalid",
    moverNickname: "탈퇴한 기사님#userid",
    deletedAt: now,
  };

  test("탈퇴용 사용자는 아직 탈퇴하지 않은 계정의 인증 수단과 역할별 profile만 선택한다", async () => {
    const findFirst = jest.fn().mockResolvedValue(withdrawalUser);
    const transaction = { user: { findFirst } } as unknown as AuthTransaction;

    await expect(
      findUserForWithdrawal(transaction, "user-id"),
    ).resolves.toEqual(withdrawalUser);

    // 기대 결과: 이미 탈퇴한 계정은 조회되지 않아 재요청이 멱등 성공으로 끝납니다.
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "user-id", deletedAt: null },
      select: expect.objectContaining({
        id: true,
        role: true,
        passwordHash: true,
        socialProvider: true,
        socialId: true,
      }),
    });
  });

  test("확정됐고 이사일이 오늘(UTC 자정) 이후인 고객 요청과 기사님 확정 견적을 함께 센다", async () => {
    const moveRequestCount = jest.fn().mockResolvedValue(1);
    const quoteCount = jest.fn().mockResolvedValue(2);
    const transaction = {
      moveRequest: { count: moveRequestCount },
      quote: { count: quoteCount },
    } as unknown as AuthTransaction;
    const upcomingConfirmedMove = {
      status: "CONFIRMED",
      moveDate: { gte: new Date("2026-10-09T00:00:00.000Z") },
    };

    await expect(
      countUpcomingConfirmedMoves(transaction, withdrawalUser, now),
    ).resolves.toBe(3);

    expect(moveRequestCount).toHaveBeenCalledWith({
      where: { customerId: "customer-id", ...upcomingConfirmedMove },
    });
    expect(quoteCount).toHaveBeenCalledWith({
      where: {
        moverId: "mover-id",
        status: "CONFIRMED",
        moveRequest: upcomingConfirmedMove,
      },
    });
  });

  test("profile이 없는 역할은 확정 이사를 조회하지 않고 0건으로 센다", async () => {
    const moveRequestCount = jest.fn();
    const quoteCount = jest.fn();
    const transaction = {
      moveRequest: { count: moveRequestCount },
      quote: { count: quoteCount },
    } as unknown as AuthTransaction;

    await expect(
      countUpcomingConfirmedMoves(
        transaction,
        { ...withdrawalUser, customer: null, mover: null },
        now,
      ),
    ).resolves.toBe(0);
    expect(moveRequestCount).not.toHaveBeenCalled();
    expect(quoteCount).not.toHaveBeenCalled();
  });

  test("기사님의 대기 견적만 찾아 알림을 받을 고객 User ID로 변환한다", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: "quote-id",
        moveRequestId: "move-request-id",
        moveRequest: { customer: { userId: "customer-user-id" } },
      },
    ]);
    const transaction = { quote: { findMany } } as unknown as AuthTransaction;

    await expect(findPendingQuotesByMoverId(transaction, "mover-id")).resolves.toEqual([
      { quoteId: "quote-id", moveRequestId: "move-request-id", customerUserId: "customer-user-id" },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { moverId: "mover-id", status: "PROPOSED", moveRequest: { status: "WAITING" } },
      }),
    );
  });

  test("기사님 탈퇴 알림은 익명화 전 닉네임으로 고객마다 한 건씩 만들고 대상이 없으면 저장하지 않는다", async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = { notification: { createMany } } as unknown as AuthTransaction;
    const expected = [
      {
        userId: "customer-user-id",
        moveRequestId: "move-request-id",
        quoteId: "quote-id",
        type: "QUOTE_CANCELED_BY_MOVER_WITHDRAWAL",
        title: "받은 견적이 취소되었습니다.",
        content: "김기사 기사님이 계정을 탈퇴하여 보내드린 견적이 취소되었습니다.",
        params: { moverNickname: "김기사" },
      },
    ];

    await expect(
      createMoverWithdrawalNotifications(transaction, { moverNickname: "김기사", quotes: [] }),
    ).resolves.toEqual([]);
    expect(createMany).not.toHaveBeenCalled();

    await expect(
      createMoverWithdrawalNotifications(transaction, {
        moverNickname: "김기사",
        quotes: [
          { quoteId: "quote-id", moveRequestId: "move-request-id", customerUserId: "customer-user-id" },
        ],
      }),
    ).resolves.toEqual(expected);
    expect(createMany).toHaveBeenCalledWith({ data: expected });
  });

  test("기사님 정리는 확정 견적을 남기고 미확정 견적·대기 지정·반려·활동 지역·서비스를 지운다", async () => {
    const deleteMany = () => jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      quote: { deleteMany: deleteMany() },
      designatedRequest: { deleteMany: deleteMany() },
      requestRejection: { deleteMany: deleteMany() },
      moverRegion: { deleteMany: deleteMany() },
      moverServiceType: { deleteMany: deleteMany() },
    };

    await deleteMoverWithdrawalRelations(transaction as unknown as AuthTransaction, "mover-id");

    // 기대 결과: CONFIRMED 견적은 고객의 완료 이력으로 남습니다.
    expect(transaction.quote.deleteMany).toHaveBeenCalledWith({
      where: { moverId: "mover-id", status: { not: "CONFIRMED" } },
    });
    expect(transaction.designatedRequest.deleteMany).toHaveBeenCalledWith({
      where: { moverId: "mover-id", moveRequest: { status: "WAITING" } },
    });
    expect(transaction.requestRejection.deleteMany).toHaveBeenCalledWith({
      where: { moverId: "mover-id" },
    });
    expect(transaction.moverRegion.deleteMany).toHaveBeenCalledWith({ where: { moverId: "mover-id" } });
    expect(transaction.moverServiceType.deleteMany).toHaveBeenCalledWith({
      where: { moverId: "mover-id" },
    });
  });

  test("조회한 인증 상태가 그대로이고 아직 탈퇴하지 않은 User만 익명화한다", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = { user: { updateMany } } as unknown as AuthTransaction;

    await expect(
      anonymizeUserWithAuthState(transaction, withdrawalUser, withdrawnAccount),
    ).resolves.toEqual({ count: 1 });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "user-id",
        deletedAt: null,
        passwordHash: "bcrypt-hash",
        socialProvider: null,
        socialId: null,
      },
      // 기대 결과: 로그인·복구·중복 확인에 쓰이는 값이 모두 사라져 같은 이메일·SNS로 재가입할 수 있습니다.
      data: {
        name: "탈퇴한 회원",
        email: "withdrawn-user-id@withdrawn.invalid",
        phone: null,
        passwordHash: null,
        recoveryQuestion: null,
        recoveryAnswerHash: null,
        socialProvider: null,
        socialId: null,
        deletedAt: now,
      },
    });
  });

  test("profile 개인정보와 본인 알림·재설정 코드를 지우고 profile row는 남긴다", async () => {
    const transaction = {
      customer: { update: jest.fn().mockResolvedValue({}) },
      customerServiceType: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      mover: { update: jest.fn().mockResolvedValue({}) },
      notification: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      passwordResetChallenge: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    await clearWithdrawnProfileData(
      transaction as unknown as AuthTransaction,
      withdrawalUser,
      withdrawnAccount,
    );

    expect(transaction.customer.update).toHaveBeenCalledWith({
      where: { id: "customer-id" },
      data: { profileImageUrl: null },
    });
    expect(transaction.customerServiceType.deleteMany).toHaveBeenCalledWith({
      where: { customerId: "customer-id" },
    });
    expect(transaction.mover.update).toHaveBeenCalledWith({
      where: { id: "mover-id" },
      data: {
        profileImageUrl: null,
        nickname: "탈퇴한 기사님#userid",
        shortIntroduction: "",
        description: "",
      },
    });
    expect(transaction.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-id" } });
    expect(transaction.passwordResetChallenge.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-id" },
    });
  });
});

describe("Password reset challenge repository", () => {
  beforeEach(() => jest.resetAllMocks());

  test("사용자 행 잠금 안에서 재발송 간격 확인과 challenge 교체를 수행한다", async () => {
    const previous = {
      id: "challenge-id",
      codeHash: "old-hash",
      failedAttempts: 1,
      sentAt: new Date("2026-09-29T00:00:00.000Z"),
      expiresAt: new Date("2026-09-29T00:05:00.000Z"),
      verifiedAt: null,
      consumedAt: null,
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "user-id" }]),
      passwordResetChallenge: {
        findUnique: jest.fn().mockResolvedValue(previous),
        upsert: jest.fn().mockResolvedValue({ id: "challenge-id" }),
      },
    };
    jest.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transaction as never),
    );

    await expect(reservePasswordResetChallenge(
      "user-id",
      "new-hash",
      new Date("2026-09-29T00:02:00.000Z"),
      new Date("2026-09-29T00:07:00.000Z"),
      new Date("2026-09-29T00:01:00.000Z"),
    )).resolves.toEqual({ challengeId: "challenge-id", previous });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.passwordResetChallenge.upsert).toHaveBeenCalledTimes(1);
    // 남겨 둔 호환 컬럼(recoveryAnswerAttempts)도 새 코드 발급 때 함께 초기화되어야 합니다.
    expect(transaction.passwordResetChallenge.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ failedAttempts: 0, recoveryAnswerAttempts: 0 }),
      }),
    );
  });

  test("아직 재발송할 수 없으면 행 잠금 뒤 challenge를 교체하지 않는다", async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "user-id" }]),
      passwordResetChallenge: {
        findUnique: jest.fn().mockResolvedValue({
          sentAt: new Date("2026-09-29T00:01:30.000Z"),
        }),
        upsert: jest.fn(),
      },
    };
    jest.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transaction as never),
    );

    await expect(reservePasswordResetChallenge(
      "user-id",
      "new-hash",
      new Date("2026-09-29T00:02:00.000Z"),
      new Date("2026-09-29T00:07:00.000Z"),
      new Date("2026-09-29T00:01:00.000Z"),
    )).resolves.toBeNull();
    expect(transaction.passwordResetChallenge.upsert).not.toHaveBeenCalled();
  });

  test("검증 횟수를 조건부 증가시킨 뒤 같은 challenge를 반환한다", async () => {
    const challenge = {
      id: "challenge-id",
      codeHash: "code-hash",
      failedAttempts: 5,
    };
    const transaction = {
      passwordResetChallenge: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(challenge),
      },
    };
    jest.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transaction as never),
    );
    const attemptedAt = new Date("2026-09-29T00:01:00.000Z");

    await expect(reservePasswordResetCodeAttempt(
      "challenge-id",
      "code-hash",
      attemptedAt,
      5,
    )).resolves.toEqual(challenge);
    expect(transaction.passwordResetChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        id: "challenge-id",
        codeHash: "code-hash",
        expiresAt: { gt: attemptedAt },
        failedAttempts: { lt: 5 },
        verifiedAt: null,
        consumedAt: null,
      },
      data: { failedAttempts: { increment: 1 } },
    });
  });

  test("메일 발송에 실패하면 현재 hash가 예약값일 때만 이전 challenge를 복원한다", async () => {
    const previous = {
      id: "challenge-id",
      codeHash: "old-hash",
      failedAttempts: 2,
      sentAt: new Date("2026-09-29T00:00:00.000Z"),
      expiresAt: new Date("2026-09-29T00:05:00.000Z"),
      verifiedAt: null,
      consumedAt: null,
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "user-id" }]),
      passwordResetChallenge: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jest.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transaction as never),
    );

    await expect(restorePasswordResetChallenge(
      "user-id",
      "failed-hash",
      previous,
    )).resolves.toEqual({ count: 1 });
    expect(transaction.passwordResetChallenge.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-id", codeHash: "failed-hash" },
      data: {
        codeHash: "old-hash",
        failedAttempts: 2,
        expiresAt: previous.expiresAt,
        sentAt: previous.sentAt,
        verifiedAt: null,
        consumedAt: null,
      },
    });
  });
});
