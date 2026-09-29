/**
 * PATCH/DELETE /customers/me/move-requests/:moveRequestId 를 위해 새로 추가한 Repository
 * 함수들이 예상한 Prisma where/select/data로 조회·생성·삭제하는지 검증합니다.
 */
const mockMoveRequestUpdate = jest.fn();
const mockMoveRequestDelete = jest.fn();

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    moveRequest: {
      update: (...args: unknown[]) => mockMoveRequestUpdate(...args),
      delete: (...args: unknown[]) => mockMoveRequestDelete(...args),
    },
  },
}));

import {
  createMoveRequestCancelNotifications,
  deleteMoveRequestById,
  deleteRequestRejectionsByMoveRequestId,
  findMoveRequestForCancelByIdForUpdate,
  findQuoteRecipientsByMoveRequestIdAndStatus,
  updateMoveRequest,
} from "../../src/modules/move-request/move-request.repository";

const MOVE_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440001";
const MOVER_USER_ID = "550e8400-e29b-41d4-a716-446655440010";
const QUOTE_ID = "550e8400-e29b-41d4-a716-446655440020";

describe("Move request 수정/삭제 repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("updateMoveRequest는 id로 update하고 전달받은 data를 그대로 넘긴다", async () => {
    const data = {
      serviceTypeId: "service-id",
      moveDate: new Date("2099-12-25T00:00:00.000Z"),
      fromAddress: "새 출발지",
      toAddress: "새 도착지",
    };
    mockMoveRequestUpdate.mockResolvedValue({ id: MOVE_REQUEST_ID });

    await updateMoveRequest(MOVE_REQUEST_ID, data);

    expect(mockMoveRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOVE_REQUEST_ID }, data }),
    );
  });

  test("findMoveRequestForCancelByIdForUpdate는 FOR UPDATE로 잠근 뒤 customer.user.name까지 함께 조회한다", async () => {
    const txQueryRaw = jest.fn().mockResolvedValue([{ id: MOVE_REQUEST_ID }]);
    const txFindUnique = jest.fn().mockResolvedValue({
      id: MOVE_REQUEST_ID,
      customerId: "customer-id",
      status: "WAITING",
      customer: { user: { name: "홍길동" } },
    });
    const tx = { $queryRaw: txQueryRaw, moveRequest: { findUnique: txFindUnique } } as never;

    const result = await findMoveRequestForCancelByIdForUpdate(MOVE_REQUEST_ID, tx);

    expect(txQueryRaw).toHaveBeenCalledTimes(1);
    expect(txFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOVE_REQUEST_ID },
        select: expect.objectContaining({
          customer: { select: { user: { select: { name: true } } } },
        }),
      }),
    );
    expect(result).toMatchObject({ status: "WAITING" });
  });

  test("findMoveRequestForCancelByIdForUpdate는 잠글 row가 없으면 null을 반환하고 추가 조회하지 않는다", async () => {
    const txQueryRaw = jest.fn().mockResolvedValue([]);
    const txFindUnique = jest.fn();
    const tx = { $queryRaw: txQueryRaw, moveRequest: { findUnique: txFindUnique } } as never;

    await expect(
      findMoveRequestForCancelByIdForUpdate(MOVE_REQUEST_ID, tx),
    ).resolves.toBeNull();

    expect(txFindUnique).not.toHaveBeenCalled();
  });

  test("findQuoteRecipientsByMoveRequestIdAndStatus는 moveRequestId+status로 조회해 mover.userId를 꺼낸다", async () => {
    const txFindMany = jest.fn().mockResolvedValue([
      { id: QUOTE_ID, mover: { userId: MOVER_USER_ID } },
    ]);
    const tx = { quote: { findMany: txFindMany } } as never;

    const result = await findQuoteRecipientsByMoveRequestIdAndStatus(
      MOVE_REQUEST_ID,
      "PROPOSED",
      tx,
    );

    expect(txFindMany).toHaveBeenCalledWith({
      where: { moveRequestId: MOVE_REQUEST_ID, status: "PROPOSED" },
      select: { id: true, mover: { select: { userId: true } } },
    });
    expect(result).toEqual([{ quoteId: QUOTE_ID, moverUserId: MOVER_USER_ID }]);
  });

  test("createMoveRequestCancelNotifications는 대상이 없으면 createMany를 호출하지 않고 빈 배열을 반환한다", async () => {
    const txCreateMany = jest.fn();
    const tx = { notification: { createMany: txCreateMany } } as never;

    const result = await createMoveRequestCancelNotifications(tx, {
      type: "MOVE_REQUEST_CANCELED",
      moveRequestId: MOVE_REQUEST_ID,
      customerName: "홍길동",
      recipients: [],
    });

    expect(result).toEqual([]);
    expect(txCreateMany).not.toHaveBeenCalled();
  });

  test("createMoveRequestCancelNotifications는 WAITING 취소 문구로 대상 전원의 Notification을 생성한다", async () => {
    const txCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { notification: { createMany: txCreateMany } } as never;

    const result = await createMoveRequestCancelNotifications(tx, {
      type: "MOVE_REQUEST_CANCELED",
      moveRequestId: MOVE_REQUEST_ID,
      customerName: "홍길동",
      recipients: [{ quoteId: QUOTE_ID, moverUserId: MOVER_USER_ID }],
    });

    expect(txCreateMany).toHaveBeenCalledWith({
      data: [
        {
          userId: MOVER_USER_ID,
          moveRequestId: MOVE_REQUEST_ID,
          quoteId: QUOTE_ID,
          type: "MOVE_REQUEST_CANCELED",
          title: "견적 요청이 취소되었습니다.",
          content: "홍길동 고객님이 계정을 탈퇴하여 보내주신 견적 요청이 취소되었습니다.",
        },
      ],
    });
    expect(result).toHaveLength(1);
  });

  test("createMoveRequestCancelNotifications는 CONFIRMED 취소 문구로 Notification을 생성한다", async () => {
    const txCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { notification: { createMany: txCreateMany } } as never;

    await createMoveRequestCancelNotifications(tx, {
      type: "CONFIRMED_MOVE_CANCELED",
      moveRequestId: MOVE_REQUEST_ID,
      customerName: "홍길동",
      recipients: [{ quoteId: QUOTE_ID, moverUserId: MOVER_USER_ID }],
    });

    expect(txCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          type: "CONFIRMED_MOVE_CANCELED",
          title: "확정된 이사가 취소되었습니다.",
          content: "홍길동 고객님이 계정을 탈퇴하여 확정된 이사 일정이 취소되었습니다.",
        }),
      ],
    });
  });

  test("deleteRequestRejectionsByMoveRequestId는 moveRequestId 기준으로 deleteMany한다", async () => {
    const txDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = { requestRejection: { deleteMany: txDeleteMany } } as never;

    await deleteRequestRejectionsByMoveRequestId(MOVE_REQUEST_ID, tx);

    expect(txDeleteMany).toHaveBeenCalledWith({ where: { moveRequestId: MOVE_REQUEST_ID } });
  });

  test("deleteMoveRequestById는 id로 delete한다", async () => {
    mockMoveRequestDelete.mockResolvedValue({ id: MOVE_REQUEST_ID });

    await deleteMoveRequestById(MOVE_REQUEST_ID);

    expect(mockMoveRequestDelete).toHaveBeenCalledWith({
      where: { id: MOVE_REQUEST_ID },
      select: { id: true },
    });
  });
});
