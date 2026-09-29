/**
 * 회원 탈퇴 Repository가 최신 인증 상태를 조건에 포함하고,
 * Cascade가 아닌 RequestRejection 관계를 Customer/Mover 양쪽에서 먼저 정리하는지 검증합니다.
 */
jest.mock("../../src/lib/prisma", () => ({
  prisma: { $transaction: jest.fn() },
}));

import {
  deleteRestrictedWithdrawalRelations,
  deleteUserWithAuthState,
  findUserForWithdrawal,
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
