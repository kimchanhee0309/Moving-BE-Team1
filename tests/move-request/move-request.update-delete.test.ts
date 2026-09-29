/**
 * MoveRequest 수정(PATCH)·삭제(DELETE) Service의 소유권/상태 검증과, 삭제 시 견적 상태별
 * 알림 생성·SSE push 시점을 검증합니다. Prisma·Repository·notification.hub는 mock으로 격리합니다.
 */
const mockTransaction = jest.fn(
  (callback: (tx: unknown) => unknown) => callback({}) as unknown,
);

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) => mockTransaction(callback),
  },
}));

jest.mock("../../src/modules/move-request/move-request.repository", () => ({
  createMoveRequestCancelNotifications: jest.fn(),
  deleteMoveRequestById: jest.fn(),
  deleteRequestRejectionsByMoveRequestId: jest.fn(),
  findMoveRequestByIdForUpdate: jest.fn(),
  findMoveRequestForCancelByIdForUpdate: jest.fn(),
  findQuoteRecipientsByMoveRequestIdAndStatus: jest.fn(),
  findServiceTypeIdByName: jest.fn(),
  updateMoveRequest: jest.fn(),
}));

// 알림 push는 transaction 커밋 이후에만 호출돼야 하므로 mock으로 감시한다.
jest.mock("../../src/modules/notification/notification.hub", () => ({
  publishNotificationToUser: jest.fn(),
}));

import { ConflictError, NotFoundError } from "../../src/common/errors/app-error";
import type { UpdateMoveRequestInput } from "../../src/modules/move-request/move-request.dto";
import {
  createMoveRequestCancelNotifications,
  deleteMoveRequestById,
  deleteRequestRejectionsByMoveRequestId,
  findMoveRequestByIdForUpdate,
  findMoveRequestForCancelByIdForUpdate,
  findQuoteRecipientsByMoveRequestIdAndStatus,
  findServiceTypeIdByName,
  updateMoveRequest,
  type MoveRequestForCancelRecord,
  type MoveRequestRecord,
} from "../../src/modules/move-request/move-request.repository";
import { publishNotificationToUser } from "../../src/modules/notification/notification.hub";
import {
  deleteMoveRequestForCustomer,
  updateMoveRequestForCustomer,
} from "../../src/modules/move-request/move-request.service";

const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440099";
const MOVE_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440001";
const MOVER_USER_ID_1 = "550e8400-e29b-41d4-a716-446655440010";
const MOVER_USER_ID_2 = "550e8400-e29b-41d4-a716-446655440011";
const QUOTE_ID_1 = "550e8400-e29b-41d4-a716-446655440020";
const QUOTE_ID_2 = "550e8400-e29b-41d4-a716-446655440021";

const createdAt = new Date("2026-09-15T00:00:00.000Z");
const updatedAt = new Date("2026-09-15T00:00:00.000Z");

const validUpdateInput: UpdateMoveRequestInput = {
  serviceType: "HOME",
  moveDate: "2099-12-25",
  fromAddress: "새 출발지",
  toAddress: "새 도착지",
};

function createMoveRequestRecord(overrides: Partial<MoveRequestRecord> = {}): MoveRequestRecord {
  return {
    id: MOVE_REQUEST_ID,
    customerId: CUSTOMER_ID,
    moveDate: new Date("2099-11-01T00:00:00.000Z"),
    fromAddress: "출발지",
    toAddress: "도착지",
    status: "WAITING",
    createdAt,
    updatedAt,
    serviceType: { name: "SMALL" },
    ...overrides,
  };
}

function createCancelRecord(
  overrides: Partial<MoveRequestForCancelRecord> = {},
): MoveRequestForCancelRecord {
  return {
    id: MOVE_REQUEST_ID,
    customerId: CUSTOMER_ID,
    status: "WAITING",
    customer: { user: { name: "홍길동" } },
    ...overrides,
  };
}

describe("Move request 수정/삭제 service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({}),
    );
  });

  describe("updateMoveRequestForCustomer", () => {
    test("WAITING 상태면 수정하고 DTO로 반환한다", async () => {
      jest.mocked(findMoveRequestByIdForUpdate).mockResolvedValue(createMoveRequestRecord());
      jest.mocked(findServiceTypeIdByName).mockResolvedValue({ id: "home-service-id" });
      jest.mocked(updateMoveRequest).mockResolvedValue(
        createMoveRequestRecord({
          serviceType: { name: "HOME" },
          moveDate: new Date("2099-12-25T00:00:00.000Z"),
          fromAddress: "새 출발지",
          toAddress: "새 도착지",
        }),
      );

      const result = await updateMoveRequestForCustomer(
        CUSTOMER_ID,
        MOVE_REQUEST_ID,
        validUpdateInput,
      );

      expect(result).toMatchObject({
        id: MOVE_REQUEST_ID,
        serviceType: "HOME",
        fromAddress: "새 출발지",
        toAddress: "새 도착지",
      });
      expect(updateMoveRequest).toHaveBeenCalledWith(
        MOVE_REQUEST_ID,
        {
          serviceTypeId: "home-service-id",
          moveDate: new Date("2099-12-25T00:00:00.000Z"),
          fromAddress: "새 출발지",
          toAddress: "새 도착지",
        },
        {},
      );
    });

    test("다른 고객 소유면 존재 여부를 구분하지 않고 NotFoundError(MOVE_REQUEST_NOT_FOUND)를 던진다", async () => {
      jest.mocked(findMoveRequestByIdForUpdate).mockResolvedValue(
        createMoveRequestRecord({ customerId: OTHER_CUSTOMER_ID }),
      );
      jest.mocked(findServiceTypeIdByName).mockResolvedValue({ id: "home-service-id" });

      await expect(
        updateMoveRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validUpdateInput),
      ).rejects.toMatchObject(
        expect.objectContaining({ code: "MOVE_REQUEST_NOT_FOUND", status: 404 }),
      );

      expect(updateMoveRequest).not.toHaveBeenCalled();
    });

    test("요청이 존재하지 않으면 NotFoundError(MOVE_REQUEST_NOT_FOUND)를 던진다", async () => {
      jest.mocked(findMoveRequestByIdForUpdate).mockResolvedValue(null);
      jest.mocked(findServiceTypeIdByName).mockResolvedValue({ id: "home-service-id" });

      await expect(
        updateMoveRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validUpdateInput),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(updateMoveRequest).not.toHaveBeenCalled();
    });

    test("CONFIRMED/COMPLETED 상태면 ConflictError(MOVE_REQUEST_NOT_EDITABLE)를 던진다", async () => {
      jest.mocked(findMoveRequestByIdForUpdate).mockResolvedValue(
        createMoveRequestRecord({ status: "CONFIRMED" }),
      );
      jest.mocked(findServiceTypeIdByName).mockResolvedValue({ id: "home-service-id" });

      await expect(
        updateMoveRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validUpdateInput),
      ).rejects.toMatchObject(
        expect.objectContaining({ code: "MOVE_REQUEST_NOT_EDITABLE", status: 409 }),
      );

      expect(updateMoveRequest).not.toHaveBeenCalled();
    });
  });

  describe("deleteMoveRequestForCustomer", () => {
    test("WAITING 요청을 삭제하면 PROPOSED 견적을 보낸 기사 전원에게 알림을 만들고 커밋 후 push한다", async () => {
      jest.mocked(findMoveRequestForCancelByIdForUpdate).mockResolvedValue(
        createCancelRecord({ status: "WAITING" }),
      );
      jest.mocked(findQuoteRecipientsByMoveRequestIdAndStatus).mockResolvedValue([
        { quoteId: QUOTE_ID_1, moverUserId: MOVER_USER_ID_1 },
        { quoteId: QUOTE_ID_2, moverUserId: MOVER_USER_ID_2 },
      ]);
      jest.mocked(createMoveRequestCancelNotifications).mockResolvedValue([
        {
          userId: MOVER_USER_ID_1,
          moveRequestId: MOVE_REQUEST_ID,
          quoteId: QUOTE_ID_1,
          type: "MOVE_REQUEST_CANCELED",
          title: "견적 요청이 취소되었습니다.",
          content: "홍길동 고객님이 계정을 탈퇴하여 보내주신 견적 요청이 취소되었습니다.",
        },
        {
          userId: MOVER_USER_ID_2,
          moveRequestId: MOVE_REQUEST_ID,
          quoteId: QUOTE_ID_2,
          type: "MOVE_REQUEST_CANCELED",
          title: "견적 요청이 취소되었습니다.",
          content: "홍길동 고객님이 계정을 탈퇴하여 보내주신 견적 요청이 취소되었습니다.",
        },
      ]);

      await deleteMoveRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID);

      // WAITING 취소는 PROPOSED 견적 기사만 대상으로 조회해야 한다.
      expect(findQuoteRecipientsByMoveRequestIdAndStatus).toHaveBeenCalledWith(
        MOVE_REQUEST_ID,
        "PROPOSED",
        {},
      );
      expect(createMoveRequestCancelNotifications).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          type: "MOVE_REQUEST_CANCELED",
          moveRequestId: MOVE_REQUEST_ID,
          customerName: "홍길동",
        }),
      );

      // RequestRejection(ON DELETE RESTRICT)을 먼저 지운 뒤에만 MoveRequest 삭제가 안전하다.
      const rejectionDeleteOrder = jest.mocked(deleteRequestRejectionsByMoveRequestId).mock
        .invocationCallOrder[0];
      const moveRequestDeleteOrder = jest.mocked(deleteMoveRequestById).mock
        .invocationCallOrder[0];
      expect(rejectionDeleteOrder).toBeLessThan(moveRequestDeleteOrder as number);
      expect(deleteMoveRequestById).toHaveBeenCalledWith(MOVE_REQUEST_ID, {});

      expect(publishNotificationToUser).toHaveBeenCalledTimes(2);
      expect(publishNotificationToUser).toHaveBeenCalledWith(MOVER_USER_ID_1, {
        type: "MOVE_REQUEST_CANCELED",
        title: "견적 요청이 취소되었습니다.",
        content: "홍길동 고객님이 계정을 탈퇴하여 보내주신 견적 요청이 취소되었습니다.",
        moveRequestId: MOVE_REQUEST_ID,
        quoteId: QUOTE_ID_1,
        createdAt: expect.any(String),
      });
    });

    test("CONFIRMED 요청을 삭제하면 확정 기사 한 명에게만 알림을 만든다", async () => {
      jest.mocked(findMoveRequestForCancelByIdForUpdate).mockResolvedValue(
        createCancelRecord({ status: "CONFIRMED" }),
      );
      jest.mocked(findQuoteRecipientsByMoveRequestIdAndStatus).mockResolvedValue([
        { quoteId: QUOTE_ID_1, moverUserId: MOVER_USER_ID_1 },
      ]);
      jest.mocked(createMoveRequestCancelNotifications).mockResolvedValue([
        {
          userId: MOVER_USER_ID_1,
          moveRequestId: MOVE_REQUEST_ID,
          quoteId: QUOTE_ID_1,
          type: "CONFIRMED_MOVE_CANCELED",
          title: "확정된 이사가 취소되었습니다.",
          content: "홍길동 고객님이 계정을 탈퇴하여 확정된 이사 일정이 취소되었습니다.",
        },
      ]);

      await deleteMoveRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID);

      expect(findQuoteRecipientsByMoveRequestIdAndStatus).toHaveBeenCalledWith(
        MOVE_REQUEST_ID,
        "CONFIRMED",
        {},
      );
      expect(createMoveRequestCancelNotifications).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ type: "CONFIRMED_MOVE_CANCELED" }),
      );
      expect(publishNotificationToUser).toHaveBeenCalledTimes(1);
    });

    test("일치하는 견적이 없으면(0명) 알림 없이 정상 삭제한다", async () => {
      jest.mocked(findMoveRequestForCancelByIdForUpdate).mockResolvedValue(
        createCancelRecord({ status: "WAITING" }),
      );
      jest.mocked(findQuoteRecipientsByMoveRequestIdAndStatus).mockResolvedValue([]);
      jest.mocked(createMoveRequestCancelNotifications).mockResolvedValue([]);

      await deleteMoveRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID);

      expect(deleteMoveRequestById).toHaveBeenCalledWith(MOVE_REQUEST_ID, {});
      expect(publishNotificationToUser).not.toHaveBeenCalled();
    });

    test("다른 고객 소유거나 요청이 없으면 NotFoundError(MOVE_REQUEST_NOT_FOUND)를 던지고 아무것도 지우지 않는다", async () => {
      jest.mocked(findMoveRequestForCancelByIdForUpdate).mockResolvedValue(
        createCancelRecord({ customerId: OTHER_CUSTOMER_ID }),
      );

      await expect(
        deleteMoveRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID),
      ).rejects.toMatchObject(
        expect.objectContaining({ code: "MOVE_REQUEST_NOT_FOUND", status: 404 }),
      );

      expect(deleteMoveRequestById).not.toHaveBeenCalled();
      expect(publishNotificationToUser).not.toHaveBeenCalled();
    });

    test("COMPLETED 요청이면 ConflictError(MOVE_REQUEST_NOT_DELETABLE)를 던지고 삭제·알림이 없다", async () => {
      jest.mocked(findMoveRequestForCancelByIdForUpdate).mockResolvedValue(
        createCancelRecord({ status: "COMPLETED" }),
      );

      await expect(
        deleteMoveRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID),
      ).rejects.toBeInstanceOf(ConflictError);

      expect(findQuoteRecipientsByMoveRequestIdAndStatus).not.toHaveBeenCalled();
      expect(deleteMoveRequestById).not.toHaveBeenCalled();
      expect(publishNotificationToUser).not.toHaveBeenCalled();
    });
  });
});
