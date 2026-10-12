/**
 * 개인정보 변경 transaction이 회원 탈퇴와 직렬화되도록 User row를 잠그고 활성 계정만 통과시키는지 검증합니다.
 * 실제 DB 없이 transaction client의 raw query 경계만 확인합니다.
 */
import type { Prisma } from "../../src/generated/prisma/client";
import {
  lockActiveUserByCustomerId,
  lockActiveUserById,
  lockActiveUserByMoverId,
} from "../../src/common/utils/active-user-lock";

const ID = "550e8400-e29b-41d4-a716-446655440000";

function createTransaction(rows: Array<{ id: string }>) {
  const queryRaw = jest.fn().mockResolvedValue(rows);
  return {
    queryRaw,
    transaction: { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient,
  };
}

function readSql(queryRaw: jest.Mock): string {
  const [strings] = queryRaw.mock.calls[0] ?? [];
  return (strings as string[]).join("?").replace(/\s+/g, " ").trim();
}

describe("Active user lock", () => {
  test("User ID로 탈퇴하지 않은 계정의 row만 FOR UPDATE로 잠근다", async () => {
    const { queryRaw, transaction } = createTransaction([{ id: ID }]);

    await expect(lockActiveUserById(transaction, ID)).resolves.toBeUndefined();

    expect(readSql(queryRaw)).toBe(
      'SELECT u."id" FROM "User" u WHERE u."id" = ?::uuid AND u."deletedAt" IS NULL FOR UPDATE OF u',
    );
    expect(queryRaw.mock.calls[0]?.[1]).toBe(ID);
  });

  test("Customer·Mover profile ID로는 소유자의 User row만 잠근다", async () => {
    const customer = createTransaction([{ id: ID }]);
    const mover = createTransaction([{ id: ID }]);

    await lockActiveUserByCustomerId(customer.transaction, ID);
    await lockActiveUserByMoverId(mover.transaction, ID);

    // 기대 결과: profile row가 아니라 탈퇴가 잠그는 것과 같은 User row(OF u)를 잠가야 두 작업이 직렬화됩니다.
    expect(readSql(customer.queryRaw)).toBe(
      'SELECT u."id" FROM "User" u JOIN "Customer" c ON c."userId" = u."id" WHERE c."id" = ?::uuid AND u."deletedAt" IS NULL FOR UPDATE OF u',
    );
    expect(readSql(mover.queryRaw)).toBe(
      'SELECT u."id" FROM "User" u JOIN "Mover" m ON m."userId" = u."id" WHERE m."id" = ?::uuid AND u."deletedAt" IS NULL FOR UPDATE OF u',
    );
  });

  test("계정이 없거나 이미 탈퇴했으면 세 함수 모두 USER_NOT_FOUND(401)로 거절한다", async () => {
    const notFound = expect.objectContaining({ code: "USER_NOT_FOUND", status: 401 });

    await expect(lockActiveUserById(createTransaction([]).transaction, ID)).rejects.toEqual(notFound);
    await expect(
      lockActiveUserByCustomerId(createTransaction([]).transaction, ID),
    ).rejects.toEqual(notFound);
    await expect(
      lockActiveUserByMoverId(createTransaction([]).transaction, ID),
    ).rejects.toEqual(notFound);
  });
});
