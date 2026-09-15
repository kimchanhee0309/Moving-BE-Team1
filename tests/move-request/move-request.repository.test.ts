/**
 * MoveRequest/DesignatedRequest Repository가 예상한 Prisma where/select로 조회·생성하고,
 * `client` 인자로 받은 transaction client를 기본 prisma 대신 실제로 사용하는지 검증합니다.
 */
const mockServiceTypeFindUnique = jest.fn();
const mockMoveRequestFindFirst = jest.fn();
const mockMoveRequestFindUnique = jest.fn();
const mockMoveRequestCreate = jest.fn();
const mockMoverFindUnique = jest.fn();
const mockDesignatedRequestFindUnique = jest.fn();
const mockDesignatedRequestCount = jest.fn();
const mockDesignatedRequestCreate = jest.fn();

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    serviceType: { findUnique: (...args: unknown[]) => mockServiceTypeFindUnique(...args) },
    moveRequest: {
      findFirst: (...args: unknown[]) => mockMoveRequestFindFirst(...args),
      findUnique: (...args: unknown[]) => mockMoveRequestFindUnique(...args),
      create: (...args: unknown[]) => mockMoveRequestCreate(...args),
    },
    mover: { findUnique: (...args: unknown[]) => mockMoverFindUnique(...args) },
    designatedRequest: {
      findUnique: (...args: unknown[]) => mockDesignatedRequestFindUnique(...args),
      count: (...args: unknown[]) => mockDesignatedRequestCount(...args),
      create: (...args: unknown[]) => mockDesignatedRequestCreate(...args),
    },
  },
}));

import {
  countDesignatedRequestsByMoveRequestId,
  createDesignatedRequest,
  createMoveRequest,
  findActiveMoveRequestByCustomerId,
  findDesignatedRequestByMoveRequestAndMover,
  findMoveRequestById,
  findMoveRequestByIdForUpdate,
  findMoverById,
  findServiceTypeIdByName,
  lockCustomerRow,
} from "../../src/modules/move-request/move-request.repository";

const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440000";
const MOVE_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440001";
const MOVER_ID = "550e8400-e29b-41d4-a716-446655440002";

describe("Move request repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("findServiceTypeIdByName은 name으로 id만 조회한다", async () => {
    mockServiceTypeFindUnique.mockResolvedValue({ id: "service-id" });

    await expect(findServiceTypeIdByName("SMALL")).resolves.toEqual({ id: "service-id" });

    expect(mockServiceTypeFindUnique).toHaveBeenCalledWith({
      where: { name: "SMALL" },
      select: { id: true },
    });
  });

  test("lockCustomerRow는 Customer id로 FOR UPDATE 잠금 쿼리를 실행한다", async () => {
    const txQueryRaw = jest.fn().mockResolvedValue([]);
    const tx = { $queryRaw: txQueryRaw } as never;

    await lockCustomerRow(CUSTOMER_ID, tx);

    expect(txQueryRaw).toHaveBeenCalledTimes(1);
  });

  test("findActiveMoveRequestByCustomerId는 WAITING이거나 CONFIRMED+오늘(UTC) 이후 moveDate를 OR로 조회한다", async () => {
    // now가 자정이 아니어도 오늘 UTC 자정으로 truncate해서 비교해야 한다.
    const now = new Date("2026-09-15T13:45:00.000Z");
    const todayUtcMidnight = new Date("2026-09-15T00:00:00.000Z");
    mockMoveRequestFindFirst.mockResolvedValue(null);

    await findActiveMoveRequestByCustomerId(CUSTOMER_ID, now);

    expect(mockMoveRequestFindFirst).toHaveBeenCalledWith({
      where: {
        customerId: CUSTOMER_ID,
        OR: [
          { status: "WAITING" },
          { status: "CONFIRMED", moveDate: { gte: todayUtcMidnight } },
        ],
      },
      select: expect.objectContaining({
        id: true,
        status: true,
        serviceType: { select: { name: true } },
      }),
    });
  });

  test("createMoveRequest는 전달받은 data 그대로 생성한다", async () => {
    const data = {
      customerId: CUSTOMER_ID,
      serviceTypeId: "service-id",
      moveDate: new Date("2026-11-01T00:00:00.000Z"),
      fromAddress: "출발지",
      toAddress: "도착지",
    };
    mockMoveRequestCreate.mockResolvedValue({ id: MOVE_REQUEST_ID });

    await createMoveRequest(data);

    expect(mockMoveRequestCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data }),
    );
  });

  test("findMoveRequestById는 id로 단건 조회한다", async () => {
    mockMoveRequestFindUnique.mockResolvedValue(null);

    await findMoveRequestById(MOVE_REQUEST_ID);

    expect(mockMoveRequestFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOVE_REQUEST_ID } }),
    );
  });

  test("findMoveRequestByIdForUpdate는 FOR UPDATE로 잠근 뒤 존재하면 findMoveRequestById로 재조회한다", async () => {
    const txQueryRaw = jest.fn().mockResolvedValue([{ id: MOVE_REQUEST_ID }]);
    const txFindUnique = jest.fn().mockResolvedValue({ id: MOVE_REQUEST_ID, status: "WAITING" });
    const tx = { $queryRaw: txQueryRaw, moveRequest: { findUnique: txFindUnique } } as never;

    const result = await findMoveRequestByIdForUpdate(MOVE_REQUEST_ID, tx);

    expect(txQueryRaw).toHaveBeenCalledTimes(1);
    expect(txFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOVE_REQUEST_ID } }),
    );
    expect(result).toEqual({ id: MOVE_REQUEST_ID, status: "WAITING" });
  });

  test("findMoveRequestByIdForUpdate는 잠글 row가 없으면 null을 반환하고 추가 조회하지 않는다", async () => {
    const txQueryRaw = jest.fn().mockResolvedValue([]);
    const txFindUnique = jest.fn();
    const tx = { $queryRaw: txQueryRaw, moveRequest: { findUnique: txFindUnique } } as never;

    await expect(findMoveRequestByIdForUpdate(MOVE_REQUEST_ID, tx)).resolves.toBeNull();

    expect(txFindUnique).not.toHaveBeenCalled();
  });

  test("findMoverById는 id만 select해서 존재 여부를 확인한다", async () => {
    mockMoverFindUnique.mockResolvedValue(null);

    await findMoverById(MOVER_ID);

    expect(mockMoverFindUnique).toHaveBeenCalledWith({
      where: { id: MOVER_ID },
      select: { id: true },
    });
  });

  test("findDesignatedRequestByMoveRequestAndMover는 복합 unique key로 조회한다", async () => {
    mockDesignatedRequestFindUnique.mockResolvedValue(null);

    await findDesignatedRequestByMoveRequestAndMover(MOVE_REQUEST_ID, MOVER_ID);

    expect(mockDesignatedRequestFindUnique).toHaveBeenCalledWith({
      where: { moveRequestId_moverId: { moveRequestId: MOVE_REQUEST_ID, moverId: MOVER_ID } },
      select: { id: true },
    });
  });

  test("countDesignatedRequestsByMoveRequestId는 moveRequestId 기준으로 개수를 센다", async () => {
    mockDesignatedRequestCount.mockResolvedValue(2);

    await expect(countDesignatedRequestsByMoveRequestId(MOVE_REQUEST_ID)).resolves.toBe(2);

    expect(mockDesignatedRequestCount).toHaveBeenCalledWith({
      where: { moveRequestId: MOVE_REQUEST_ID },
    });
  });

  test("createDesignatedRequest는 moveRequestId와 moverId로 생성한다", async () => {
    mockDesignatedRequestCreate.mockResolvedValue({ id: "designated-id" });

    await createDesignatedRequest({ moveRequestId: MOVE_REQUEST_ID, moverId: MOVER_ID });

    expect(mockDesignatedRequestCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { moveRequestId: MOVE_REQUEST_ID, moverId: MOVER_ID },
      }),
    );
  });

  test("client 인자를 넘기면 기본 prisma 대신 그 client로 조회한다(transaction 재사용)", async () => {
    const txFindUnique = jest.fn().mockResolvedValue({ id: "tx-service-id" });
    const tx = { serviceType: { findUnique: txFindUnique } } as never;

    await findServiceTypeIdByName("HOME", tx);

    expect(txFindUnique).toHaveBeenCalledTimes(1);
    expect(mockServiceTypeFindUnique).not.toHaveBeenCalled();
  });
});
