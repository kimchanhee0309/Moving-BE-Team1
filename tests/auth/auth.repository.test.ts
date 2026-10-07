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
  reservePasswordResetChallenge,
  reservePasswordResetCodeAttempt,
  restorePasswordResetChallenge,
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
