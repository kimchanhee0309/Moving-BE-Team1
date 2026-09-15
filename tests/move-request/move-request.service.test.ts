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
  findActiveMoveRequestByCustomerId: jest.fn(),
  findDesignatedRequestByMoveRequestAndMover: jest.fn(),
  findMoveRequestById: jest.fn(),
  findMoverById: jest.fn(),
  findServiceTypeIdByName: jest.fn(),
}));

import { ForbiddenError, NotFoundError } from "../../src/common/errors/app-error";
import type { CreateMoveRequestInput } from "../../src/modules/move-request/move-request.dto";
import {
  countDesignatedRequestsByMoveRequestId,
  createDesignatedRequest,
  createMoveRequest,
  findActiveMoveRequestByCustomerId,
  findDesignatedRequestByMoveRequestAndMover,
  findMoveRequestById,
  findMoverById,
  findServiceTypeIdByName,
  type MoveRequestRecord,
} from "../../src/modules/move-request/move-request.repository";
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
      jest.mocked(findMoveRequestById).mockResolvedValue(null);

      await expect(
        createDesignatedRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validInput),
      ).rejects.toMatchObject(
        new NotFoundError("이사 견적 요청을 찾을 수 없습니다.", "MOVE_REQUEST_NOT_FOUND"),
      );
    });

    test("본인 소유가 아니면 MOVE_REQUEST_FORBIDDEN으로 거절한다", async () => {
      jest
        .mocked(findMoveRequestById)
        .mockResolvedValue(createMoveRequestRecord({ customerId: "other-customer" }));

      await expect(
        createDesignatedRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validInput),
      ).rejects.toMatchObject(
        new ForbiddenError("본인의 이사 견적 요청이 아닙니다.", "MOVE_REQUEST_FORBIDDEN"),
      );
    });

    test("WAITING 상태가 아니면 MOVE_REQUEST_ALREADY_CONFIRMED로 거절한다", async () => {
      jest.mocked(findMoveRequestById).mockResolvedValue(
        createMoveRequestRecord({ status: "CONFIRMED" }),
      );

      await expect(
        createDesignatedRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validInput),
      ).rejects.toMatchObject({ code: "MOVE_REQUEST_ALREADY_CONFIRMED", status: 409 });

      expect(findMoverById).not.toHaveBeenCalled();
    });

    test("mover가 없으면 MOVER_NOT_FOUND로 거절한다", async () => {
      jest.mocked(findMoveRequestById).mockResolvedValue(createMoveRequestRecord());
      jest.mocked(findMoverById).mockResolvedValue(null);

      await expect(
        createDesignatedRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validInput),
      ).rejects.toMatchObject(
        new NotFoundError("기사님을 찾을 수 없습니다.", "MOVER_NOT_FOUND"),
      );

      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("이미 같은 mover에게 지정 요청을 보냈으면 DESIGNATED_REQUEST_ALREADY_EXISTS로 거절한다", async () => {
      jest.mocked(findMoveRequestById).mockResolvedValue(createMoveRequestRecord());
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
      jest.mocked(findMoveRequestById).mockResolvedValue(createMoveRequestRecord());
      jest.mocked(findMoverById).mockResolvedValue({ id: MOVER_ID });
      jest.mocked(findDesignatedRequestByMoveRequestAndMover).mockResolvedValue(null);
      jest.mocked(countDesignatedRequestsByMoveRequestId).mockResolvedValue(3);

      await expect(
        createDesignatedRequestForCustomer(CUSTOMER_ID, MOVE_REQUEST_ID, validInput),
      ).rejects.toMatchObject({ code: "DESIGNATED_REQUEST_LIMIT_EXCEEDED", status: 409 });

      expect(createDesignatedRequest).not.toHaveBeenCalled();
    });

    test("모든 검증을 통과하면 DesignatedRequest를 생성하고 DTO로 반환한다", async () => {
      jest.mocked(findMoveRequestById).mockResolvedValue(createMoveRequestRecord());
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
