/**
 * 회원 탈퇴 Repository가 최신 인증 상태를 조건에 포함하고,
 * Cascade가 아닌 RequestRejection 관계를 Customer/Mover 양쪽에서 먼저 정리하는지 검증합니다.
 */
jest.mock("../../src/lib/prisma", () => ({
  prisma: { $transaction: jest.fn() },
}));

import { prisma } from "../../src/lib/prisma";
import {
  deleteRestrictedWithdrawalRelations,
  deleteUserWithAuthState,
  findUserForWithdrawal,
  consumeSignupEmailVerification,
  reservePasswordResetChallenge,
  reservePasswordResetCodeAttempt,
  reserveSignupEmailCodeAttempt,
  reserveSignupEmailVerification,
  restorePasswordResetChallenge,
  restoreSignupEmailVerification,
  type AuthTransaction,
  type WithdrawalUserRecord,
} from "../../src/modules/auth/auth.repository";

const withdrawalUser: WithdrawalUserRecord = {
  id: "user-id",
  passwordHash: "bcrypt-hash",
  socialProvider: null,
  socialId: null,
  customer: { id: "customer-id", profileImageUrl: null },
  mover: { id: "mover-id", profileImageUrl: null },
};

describe("Auth withdrawal repository", () => {
  test("탈퇴용 사용자는 인증 수단과 역할별 profile만 선택한다", async () => {
    const findUnique = jest.fn().mockResolvedValue(withdrawalUser);
    const transaction = { user: { findUnique } } as unknown as AuthTransaction;

    await expect(
      findUserForWithdrawal(transaction, "user-id"),
    ).resolves.toEqual(withdrawalUser);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "user-id" },
      select: expect.objectContaining({
        id: true,
        passwordHash: true,
        socialProvider: true,
        socialId: true,
      }),
    });
  });

  test("Customer 요청 반려와 Mover 본인 반려를 User 삭제 전에 모두 정리한다", async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      requestRejection: { deleteMany },
    } as unknown as AuthTransaction;

    await deleteRestrictedWithdrawalRelations(transaction, withdrawalUser);

    expect(deleteMany).toHaveBeenNthCalledWith(1, {
      where: { moveRequest: { customerId: "customer-id" } },
    });
    expect(deleteMany).toHaveBeenNthCalledWith(2, {
      where: { moverId: "mover-id" },
    });
  });

  test("조회한 passwordHash와 socialProvider가 그대로인 User만 조건부 삭제한다", async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = { user: { deleteMany } } as unknown as AuthTransaction;

    await expect(
      deleteUserWithAuthState(transaction, withdrawalUser),
    ).resolves.toEqual({ count: 1 });

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: "user-id",
        passwordHash: "bcrypt-hash",
        socialProvider: null,
        socialId: null,
      },
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

describe("Signup email verification repository", () => {
  const sentAt = new Date("2026-10-08T00:02:00.000Z");
  const expiresAt = new Date("2026-10-08T00:07:00.000Z");
  const resendAllowedAt = new Date("2026-10-08T00:01:00.000Z");
  const staleBefore = new Date("2026-10-07T23:02:00.000Z");
  const previous = {
    id: "verification-id",
    email: "user@example.com",
    codeHash: "old-hash",
    failedAttempts: 2,
    sentAt: new Date("2026-10-08T00:00:00.000Z"),
    expiresAt: new Date("2026-10-08T00:05:00.000Z"),
    verifiedAt: null,
  };

  beforeEach(() => jest.resetAllMocks());

  test("이메일 lock 안에서 오래된 기록을 정리하고 재발송 간격 확인 뒤 인증 상태를 교체한다", async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      signupEmailVerification: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(previous),
        upsert: jest.fn().mockResolvedValue({ id: "verification-id" }),
      },
    };
    jest.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transaction as never),
    );

    await expect(reserveSignupEmailVerification(
      "user@example.com",
      "new-hash",
      sentAt,
      expiresAt,
      resendAllowedAt,
      staleBefore,
    )).resolves.toEqual({ verificationId: "verification-id", previous });

    // 기대 결과: lock → 정리 → 조회 순서로 실행해 같은 이메일의 동시 요청이 간격 확인을 건너뛰지 못합니다.
    expect(transaction.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.signupEmailVerification.findUnique.mock.invocationCallOrder[0] ?? 0,
    );
    expect(transaction.signupEmailVerification.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: staleBefore } },
    });
    // 새 코드를 보내면 이전 시도 횟수와 검증 완료 상태(=이전 인증 토큰)를 초기화합니다.
    expect(transaction.signupEmailVerification.upsert).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      create: { email: "user@example.com", codeHash: "new-hash", sentAt, expiresAt },
      update: {
        codeHash: "new-hash",
        sentAt,
        expiresAt,
        failedAttempts: 0,
        verifiedAt: null,
      },
      select: { id: true },
    });
  });

  test("아직 재발송할 수 없으면 인증 상태를 교체하지 않는다", async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      signupEmailVerification: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({
          ...previous,
          sentAt: new Date("2026-10-08T00:01:30.000Z"),
        }),
        upsert: jest.fn(),
      },
    };
    jest.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transaction as never),
    );

    await expect(reserveSignupEmailVerification(
      "user@example.com",
      "new-hash",
      sentAt,
      expiresAt,
      resendAllowedAt,
      staleBefore,
    )).resolves.toBeNull();
    expect(transaction.signupEmailVerification.upsert).not.toHaveBeenCalled();
  });

  test("메일 발송에 실패하면 예약 hash가 그대로일 때만 직전 상태를 복원하고 첫 요청이면 삭제한다", async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      signupEmailVerification: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jest.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transaction as never),
    );

    await restoreSignupEmailVerification("user@example.com", "failed-hash", previous);
    expect(transaction.signupEmailVerification.updateMany).toHaveBeenCalledWith({
      where: { email: "user@example.com", codeHash: "failed-hash" },
      data: {
        codeHash: "old-hash",
        failedAttempts: 2,
        expiresAt: previous.expiresAt,
        sentAt: previous.sentAt,
        verifiedAt: null,
      },
    });

    await restoreSignupEmailVerification("user@example.com", "failed-hash", null);
    expect(transaction.signupEmailVerification.deleteMany).toHaveBeenCalledWith({
      where: { email: "user@example.com", codeHash: "failed-hash" },
    });
  });

  test("만료·검증 완료·최대 횟수 조건으로 시도 한 건을 조건부 증가시킨다", async () => {
    const transaction = {
      signupEmailVerification: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
    };
    jest.mocked(prisma.$transaction).mockImplementation(async (operation) =>
      operation(transaction as never),
    );
    const attemptedAt = new Date("2026-10-08T00:03:00.000Z");

    // 조건에 맞는 기록이 없으면(만료·횟수 초과·이미 확인) 다시 조회하지 않고 null을 반환합니다.
    await expect(reserveSignupEmailCodeAttempt(
      "verification-id",
      "code-hash",
      attemptedAt,
      5,
    )).resolves.toBeNull();
    expect(transaction.signupEmailVerification.updateMany).toHaveBeenCalledWith({
      where: {
        id: "verification-id",
        codeHash: "code-hash",
        expiresAt: { gt: attemptedAt },
        failedAttempts: { lt: 5 },
        verifiedAt: null,
      },
      data: { failedAttempts: { increment: 1 } },
    });
    expect(transaction.signupEmailVerification.findUnique).not.toHaveBeenCalled();
  });

  test("가입 transaction은 같은 이메일의 검증 완료된 인증 기록만 삭제해 소비한다", async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      signupEmailVerification: { deleteMany },
    } as unknown as AuthTransaction;

    await expect(
      consumeSignupEmailVerification(transaction, "verification-id", "user@example.com"),
    ).resolves.toEqual({ count: 1 });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: "verification-id",
        email: "user@example.com",
        verifiedAt: { not: null },
      },
    });
  });
});
