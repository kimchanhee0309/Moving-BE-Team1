/**
 * MoveRequest/DesignatedRequest Service의 활성 요청 중복, moveDate 미래 검증, 소유권·상태·인원 제한
 * 검증 순서와 Repository 결과의 DTO 변환을 검증합니다. Prisma·Repository는 mock으로 격리합니다.
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
  countDesignatedRequestsByMoveRequestId: jest.fn(),
  createDesignatedRequest: jest.fn(),
  createMoveRequest: jest.fn(),
  createNewMoveRequestNotifications: jest.fn(),
  findActiveMoveRequestByCustomerId: jest.fn(),
  findCustomerRegionId: jest.fn(),
  findDesignatedRequestByMoveRequestAndMover: jest.fn(),
  findMoversForNewMoveRequestNotification: jest.fn(),
  findMoveRequestByIdForUpdate: jest.fn(),
  findMoverById: jest.fn(),
  findServiceTypeIdByName: jest.fn(),
  lockCustomerRow: jest.fn(),
}));

// NEW_MOVE_REQUEST 알림 push는 transaction 커밋 이후에만 호출돼야 하므로 mock으로 감시한다.
// push 자체의 payload·시점 검증은 move-request.notification-trigger.test.ts에서 다룬다.
jest.mock("../../src/modules/notification/notification.hub", () => ({
  publishNotificationToUser: jest.fn(),
}));

import { ForbiddenError, NotFoundError } from "../../src/common/errors/app-error";
import type { CreateMoveRequestInput } from "../../src/modules/move-request/move-request.dto";
import {
  countDesignatedRequestsByMoveRequestId,
  createDesignatedRequest,
  createMoveRequest,
  createNewMoveRequestNotifications,
  findActiveMoveRequestByCustomerId,
  findCustomerRegionId,
  findDesignatedRequestByMoveRequestAndMover,
  findMoversForNewMoveRequestNotification,
  findMoveRequestByIdForUpdate,
  findMoverById,
  findServiceTypeIdByName,
  lockCustomerRow,
  type MoveRequestRecord,
} from "../../src/modules/move-request/move-request.repository";
import { publishNotificationToUser } from "../../src/modules/notification/notification.hub";
import {
  createDesignatedRequestForCustomer,
  createMoveRequestForCustomer,
  getActiveMoveRequestForCustomer,
} from "../../src/modules/move-request/move-request.service";

const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440000";
const MOVE_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440001";
const MOVER_ID = "550e8400-e29b-41d4-a716-446655440002";

const createdAt = new Date("2026-09-15T00:00:00.000Z");
const updatedAt = new Date("2026-09-15T00:00:00.000Z");

function createMoveRequestRecord(
  overrides: Partial<MoveRequestRecord> = {},
): MoveRequestRecord {
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

const validCreateInput: CreateMoveRequestInput = {
  serviceType: "SMALL",
  moveDate: "2099-11-01",
  fromAddress: "출발지",
  toAddress: "도착지",
};

describe("Move request service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({}),
    );

    // NEW_MOVE_REQUEST 알림 관련 함수의 기본값: 매칭 기사 없음(알림 0건). createMoveRequest를
    // 검증하는 다른 테스트들이 이 알림 흐름의 영향을 받지 않도록 안전한 기본값을 둔다.
    jest.mocked(findCustomerRegionId).mockResolvedValue({ regionId: "region-id" });
    jest.mocked(findMoversForNewMoveRequestNotification).mockResolvedValue([]);
    jest.mocked(createNewMoveRequestNotifications).mockResolvedValue([]);
  });

  describe("createMoveRequestForCustomer", () => {
    test("활성 요청이 없으면 새 MoveRequest를 생성하고 DTO로 반환한다", async () => {
      jest.mocked(findServiceTypeIdByName).mockResolvedValue({ id: "service-id" });
      jest.mocked(findActiveMoveRequestByCustomerId).mockResolvedValue(null);
      jest.mocked(createMoveRequest).mockResolvedValue(createMoveRequestRecord());

      const result = await createMoveRequestForCustomer(CUSTOMER_ID, validCreateInput);

      expect(result).toEqual({
        id: MOVE_REQUEST_ID,
        serviceType: "SMALL",
        moveDate: "2099-11-01T00:00:00.000Z",
        fromAddress: "출발지",
        toAddress: "도착지",
        status: "WAITING",
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });

      expect(findServiceTypeIdByName).toHaveBeenCalledWith("SMALL");
      expect(lockCustomerRow).toHaveBeenCalledWith(CUSTOMER_ID, {});
      expect(createMoveRequest).toHaveBeenCalledWith(
        {
          customerId: CUSTOMER_ID,
          serviceTypeId: "service-id",
          moveDate: new Date("2099-11-01T00:00:00.000Z"),
          fromAddress: "출발지",
          toAddress: "도착지",
        },
        {},
      );

      // Customer row 잠금이 활성 요청 확인보다 먼저 실행돼야 경쟁을 막는 의미가 있다.
      const lockOrder = jest.mocked(lockCustomerRow).mock.invocationCallOrder[0];
      const checkOrder = jest.mocked(findActiveMoveRequestByCustomerId).mock
        .invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(checkOrder as number);

      // 매칭 기사를 찾을 때 고객이 실제로 선택한 지역과 새로 만든 요청의 서비스 유형을
      // 그대로 넘겨야 한다.
      expect(findMoversForNewMoveRequestNotification).toHaveBeenCalledWith(
        "region-id",
        "service-id",
        {},
      );
      expect(createNewMoveRequestNotifications).toHaveBeenCalledWith(
        {},
        { moverUserIds: [], moveRequestId: MOVE_REQUEST_ID },
      );
    });

    test("지역·서비스 유형이 일치하는 기사가 있으면 각 기사에게 NEW_MOVE_REQUEST 알림을 push한다", async () => {
      const FIRST_MOVER_USER_ID = "550e8400-e29b-41d4-a716-446655440010";
      const SECOND_MOVER_USER_ID = "550e8400-e29b-41d4-a716-446655440011";

      jest.mocked(findServiceTypeIdByName).mockResolvedValue({ id: "service-id" });
      jest.mocked(findActiveMoveRequestByCustomerId).mockResolvedValue(null);
      jest.mocked(createMoveRequest).mockResolvedValue(createMoveRequestRecord());
      jest.mocked(findMoversForNewMoveRequestNotification).mockResolvedValue([
        { userId: FIRST_MOVER_USER_ID },
        { userId: SECOND_MOVER_USER_ID },
      ]);

      const savedNotifications = [
        {
          userId: FIRST_MOVER_USER_ID,
          moveRequestId: MOVE_REQUEST_ID,
          quoteId: null,
          type: "NEW_MOVE_REQUEST" as const,
          title: "새로운 이사 견적 요청이 도착했습니다.",
          content: "고객님이 새로운 이사 견적을 요청했습니다.",
        },
        {
          userId: SECOND_MOVER_USER_ID,
          moveRequestId: MOVE_REQUEST_ID,
          quoteId: null,
          type: "NEW_MOVE_REQUEST" as const,
          title: "새로운 이사 견적 요청이 도착했습니다.",
          content: "고객님이 새로운 이사 견적을 요청했습니다.",
        },
      ];
      jest.mocked(createNewMoveRequestNotifications).mockResolvedValue(savedNotifications);

      await createMoveRequestForCustomer(CUSTOMER_ID, validCreateInput);

      expect(createNewMoveRequestNotifications).toHaveBeenCalledWith(
        {},
        { moverUserIds: [FIRST_MOVER_USER_ID, SECOND_MOVER_USER_ID], moveRequestId: MOVE_REQUEST_ID },
      );

      expect(publishNotificationToUser).toHaveBeenCalledTimes(2);
      expect(publishNotificationToUser).toHaveBeenNthCalledWith(1, FIRST_MOVER_USER_ID, {
        type: "NEW_MOVE_REQUEST",
        title: "새로운 이사 견적 요청이 도착했습니다.",
        content: "고객님이 새로운 이사 견적을 요청했습니다.",
        moveRequestId: MOVE_REQUEST_ID,
        quoteId: null,
        params: null,
        createdAt: expect.any(String),
      });
      expect(publishNotificationToUser).toHaveBeenNthCalledWith(2, SECOND_MOVER_USER_ID, {
        type: "NEW_MOVE_REQUEST",
        title: "새로운 이사 견적 요청이 도착했습니다.",
        content: "고객님이 새로운 이사 견적을 요청했습니다.",
        moveRequestId: MOVE_REQUEST_ID,
        quoteId: null,
        params: null,
        createdAt: expect.any(String),
      });
    });

    test("매칭되는 기사가 없으면 알림을 push하지 않는다", async () => {
      jest.mocked(findServiceTypeIdByName).mockResolvedValue({ id: "service-id" });
      jest.mocked(findActiveMoveRequestByCustomerId).mockResolvedValue(null);
      jest.mocked(createMoveRequest).mockResolvedValue(createMoveRequestRecord());
      jest.mocked(findMoversForNewMoveRequestNotification).mockResolvedValue([]);
      jest.mocked(createNewMoveRequestNotifications).mockResolvedValue([]);

      await createMoveRequestForCustomer(CUSTOMER_ID, validCreateInput);

      expect(publishNotificationToUser).not.toHaveBeenCalled();
    });

    test("moveDate가 오늘(UTC)보다 미래가 아니면 VALIDATION_ERROR를 던지고 조회하지 않는다", async () => {
      await expect(
        createMoveRequestForCustomer(CUSTOMER_ID, {
          ...validCreateInput,
          moveDate: "2020-01-01",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });

      expect(findServiceTypeIdByName).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("형식은 맞지만 실존하지 않는 날짜(2월 30일)를 거절한다", async () => {
      // 과거 날짜 검증만으로도 거절되지 않도록 미래 연도를 써서 캘린더 유효성 검사 자체를 검증한다.
      await expect(
        createMoveRequestForCustomer(CUSTOMER_ID, {
          ...validCreateInput,
          moveDate: "2099-02-30",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });

      expect(findServiceTypeIdByName).not.toHaveBeenCalled();
    });

    test("serviceType을 찾지 못하면 AppError가 아닌 일반 Error를 던진다", async () => {
      jest.mocked(findServiceTypeIdByName).mockResolvedValue(null);

      await expect(
        createMoveRequestForCustomer(CUSTOMER_ID, validCreateInput),
      ).rejects.toThrow(Error);
      await expect(
        createMoveRequestForCustomer(CUSTOMER_ID, validCreateInput),
      ).rejects.not.toHaveProperty("code");

      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("이미 활성 요청이 있으면 ACTIVE_MOVE_REQUEST_EXISTS로 거절하고 생성하지 않는다", async () => {
      jest.mocked(findServiceTypeIdByName).mockResolvedValue({ id: "service-id" });
      jest.mocked(findActiveMoveRequestByCustomerId).mockResolvedValue(
        createMoveRequestRecord(),
      );

      await expect(
        createMoveRequestForCustomer(CUSTOMER_ID, validCreateInput),
      ).rejects.toMatchObject({ code: "ACTIVE_MOVE_REQUEST_EXISTS", status: 409 });

      expect(createMoveRequest).not.toHaveBeenCalled();
      // 요청 생성 자체가 막혔으므로 알림 대상 조회·생성·push도 전혀 일어나면 안 된다.
      expect(findCustomerRegionId).not.toHaveBeenCalled();
      expect(findMoversForNewMoveRequestNotification).not.toHaveBeenCalled();
      expect(createNewMoveRequestNotifications).not.toHaveBeenCalled();
      expect(publishNotificationToUser).not.toHaveBeenCalled();
    });
  });

  describe("getActiveMoveRequestForCustomer", () => {
    test("활성 요청이 없으면 null을 반환한다", async () => {
      jest.mocked(findActiveMoveRequestByCustomerId).mockResolvedValue(null);

      await expect(getActiveMoveRequestForCustomer(CUSTOMER_ID)).resolves.toBeNull();
    });

    test("활성 요청이 있으면 DTO로 변환해 반환한다", async () => {
      jest
        .mocked(findActiveMoveRequestByCustomerId)
        .mockResolvedValue(createMoveRequestRecord({ status: "CONFIRMED" }));

      await expect(getActiveMoveRequestForCustomer(CUSTOMER_ID)).resolves.toMatchObject({
        id: MOVE_REQUEST_ID,
        status: "CONFIRMED",
      });
    });
  });

  describe("createDesignatedRequestForCustomer", () => {
    const validInput = { moverId: MOVER_ID };

    test("MoveRequest가 없으면 MOVE_REQUEST_NOT_FOUND로 거절한다", async () => {
      jest.mocked(findMoveRequestByIdForUpdate).mockResolvedValue(null);

      await expect(
        createDesignatedRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validInput),
      ).rejects.toMatchObject(
        new NotFoundError("이사 견적 요청을 찾을 수 없습니다.", "MOVE_REQUEST_NOT_FOUND"),
      );
    });

    test("본인 소유가 아니면 MOVE_REQUEST_FORBIDDEN으로 거절한다", async () => {
      jest
        .mocked(findMoveRequestByIdForUpdate)
        .mockResolvedValue(createMoveRequestRecord({ customerId: "other-customer" }));

      await expect(
        createDesignatedRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validInput),
      ).rejects.toMatchObject(
        new ForbiddenError("본인의 이사 견적 요청이 아닙니다.", "MOVE_REQUEST_FORBIDDEN"),
      );
    });

    test("WAITING 상태가 아니면 MOVE_REQUEST_ALREADY_CONFIRMED로 거절한다", async () => {
      jest.mocked(findMoveRequestByIdForUpdate).mockResolvedValue(
        createMoveRequestRecord({ status: "CONFIRMED" }),
      );

      await expect(
        createDesignatedRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validInput),
      ).rejects.toMatchObject({ code: "MOVE_REQUEST_ALREADY_CONFIRMED", status: 409 });

      expect(findMoverById).not.toHaveBeenCalled();
    });

    test("mover가 없으면 MOVER_NOT_FOUND로 거절한다", async () => {
      jest.mocked(findMoveRequestByIdForUpdate).mockResolvedValue(createMoveRequestRecord());
      jest.mocked(findMoverById).mockResolvedValue(null);

      await expect(
        createDesignatedRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validInput),
      ).rejects.toMatchObject(
        new NotFoundError("기사님을 찾을 수 없습니다.", "MOVER_NOT_FOUND"),
      );

      expect(createDesignatedRequest).not.toHaveBeenCalled();
    });

    test("이미 같은 mover에게 지정 요청을 보냈으면 DESIGNATED_REQUEST_ALREADY_EXISTS로 거절한다", async () => {
      jest.mocked(findMoveRequestByIdForUpdate).mockResolvedValue(createMoveRequestRecord());
      jest.mocked(findMoverById).mockResolvedValue({ id: MOVER_ID });
      jest
        .mocked(findDesignatedRequestByMoveRequestAndMover)
        .mockResolvedValue({ id: "existing-id" });

      await expect(
        createDesignatedRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validInput),
      ).rejects.toMatchObject({ code: "DESIGNATED_REQUEST_ALREADY_EXISTS", status: 409 });

      expect(createDesignatedRequest).not.toHaveBeenCalled();
    });

    test("지정 요청이 이미 3명이면 DESIGNATED_REQUEST_LIMIT_EXCEEDED로 거절한다", async () => {
      jest.mocked(findMoveRequestByIdForUpdate).mockResolvedValue(createMoveRequestRecord());
      jest.mocked(findMoverById).mockResolvedValue({ id: MOVER_ID });
      jest.mocked(findDesignatedRequestByMoveRequestAndMover).mockResolvedValue(null);
      jest.mocked(countDesignatedRequestsByMoveRequestId).mockResolvedValue(3);

      await expect(
        createDesignatedRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validInput),
      ).rejects.toMatchObject({ code: "DESIGNATED_REQUEST_LIMIT_EXCEEDED", status: 409 });

      expect(createDesignatedRequest).not.toHaveBeenCalled();
    });

    test("모든 검증을 통과하면 DesignatedRequest를 생성하고 DTO로 반환한다", async () => {
      jest.mocked(findMoveRequestByIdForUpdate).mockResolvedValue(createMoveRequestRecord());
      jest.mocked(findMoverById).mockResolvedValue({ id: MOVER_ID });
      jest.mocked(findDesignatedRequestByMoveRequestAndMover).mockResolvedValue(null);
      jest.mocked(countDesignatedRequestsByMoveRequestId).mockResolvedValue(2);
      jest.mocked(createDesignatedRequest).mockResolvedValue({
        id: "designated-id",
        moveRequestId: MOVE_REQUEST_ID,
        moverId: MOVER_ID,
        createdAt,
        updatedAt,
      });

      const result = await createDesignatedRequestForCustomer(
        CUSTOMER_ID,
        MOVE_REQUEST_ID,
        validInput,
      );

      expect(result).toEqual({
        id: "designated-id",
        moveRequestId: MOVE_REQUEST_ID,
        moverId: MOVER_ID,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });

      expect(createDesignatedRequest).toHaveBeenCalledWith(
        { moveRequestId: MOVE_REQUEST_ID, moverId: MOVER_ID },
        {},
      );
    });
  });
});
