/**
 * 이사 요청 생성(createMoveRequestForCustomer)이 NEW_MOVE_REQUEST Notification row 생성뿐
 * 아니라 transaction 커밋 이후 SSE push까지 호출하는지 검증합니다.
 * 실제 DB·transaction 대신 Repository와 notification.hub를 mock합니다.
 */
jest.mock("../../src/modules/move-request/move-request.repository", () => ({
  createMoveRequest: jest.fn(),
  createNewMoveRequestNotifications: jest.fn(),
  findActiveMoveRequestByCustomerId: jest.fn(),
  findCustomerRegionId: jest.fn(),
  findMoversForNewMoveRequestNotification: jest.fn(),
  findServiceTypeIdByName: jest.fn(),
  lockCustomerRow: jest.fn(),
}));

jest.mock("../../src/modules/notification/notification.hub", () => ({
  publishNotificationToUser: jest.fn(),
}));

// prisma.$transaction 자체를 콜백을 즉시 실행하는 형태로 대체해 transaction 경계를 격리합니다.
jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(
      async (callback: (tx: unknown) => unknown) => callback({}),
    ),
  },
}));

import type { CreateMoveRequestInput } from "../../src/modules/move-request/move-request.dto";
import {
  createMoveRequest,
  createNewMoveRequestNotifications,
  findActiveMoveRequestByCustomerId,
  findCustomerRegionId,
  findMoversForNewMoveRequestNotification,
  findServiceTypeIdByName,
  type MoveRequestRecord,
} from "../../src/modules/move-request/move-request.repository";
import { createMoveRequestForCustomer } from "../../src/modules/move-request/move-request.service";
import { publishNotificationToUser } from "../../src/modules/notification/notification.hub";
import { prisma } from "../../src/lib/prisma";

const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440000";
const MOVE_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440001";
const REGION_ID = "550e8400-e29b-41d4-a716-446655440002";
const SERVICE_TYPE_ID = "550e8400-e29b-41d4-a716-446655440003";
const MOVER_USER_ID = "550e8400-e29b-41d4-a716-446655440004";
const OTHER_MOVER_USER_ID = "550e8400-e29b-41d4-a716-446655440005";

const validInput: CreateMoveRequestInput = {
  serviceType: "SMALL",
  moveDate: "2099-11-01",
  fromAddress: "출발지",
  toAddress: "도착지",
};

function createMoveRequestRecord(): MoveRequestRecord {
  return {
    id: MOVE_REQUEST_ID,
    customerId: CUSTOMER_ID,
    moveDate: new Date("2099-11-01T00:00:00.000Z"),
    fromAddress: "출발지",
    toAddress: "도착지",
    status: "WAITING",
    createdAt: new Date("2026-09-14T00:00:00.000Z"),
    updatedAt: new Date("2026-09-14T00:00:00.000Z"),
    serviceType: { name: "SMALL" },
  };
}

describe("createMoveRequestForCustomer의 NEW_MOVE_REQUEST 알림 push", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // resetAllMocks는 module factory에서 지정한 mockImplementation도 지우므로
    // 매 테스트마다 transaction 콜백을 즉시 실행하는 형태로 다시 설정한다.
    jest.mocked(prisma.$transaction).mockImplementation(
      async (callback) =>
        (callback as unknown as (tx: object) => Promise<unknown>)({}),
    );

    jest.mocked(findServiceTypeIdByName).mockResolvedValue({ id: SERVICE_TYPE_ID });
    jest.mocked(findActiveMoveRequestByCustomerId).mockResolvedValue(null);
    jest.mocked(findCustomerRegionId).mockResolvedValue({ regionId: REGION_ID });
    jest.mocked(createMoveRequest).mockResolvedValue(createMoveRequestRecord());
  });

  test("지역·서비스 유형이 일치하는 기사가 있으면 transaction 커밋 후 각 기사에게 push한다", async () => {
    jest.mocked(findMoversForNewMoveRequestNotification).mockResolvedValue([
      { userId: MOVER_USER_ID },
      { userId: OTHER_MOVER_USER_ID },
    ]);
    jest.mocked(createNewMoveRequestNotifications).mockResolvedValue([
      {
        userId: MOVER_USER_ID,
        moveRequestId: MOVE_REQUEST_ID,
        quoteId: null,
        type: "NEW_MOVE_REQUEST",
        title: "새로운 이사 견적 요청이 도착했습니다.",
        content: "고객님이 새로운 이사 견적을 요청했습니다.",
      },
      {
        userId: OTHER_MOVER_USER_ID,
        moveRequestId: MOVE_REQUEST_ID,
        quoteId: null,
        type: "NEW_MOVE_REQUEST",
        title: "새로운 이사 견적 요청이 도착했습니다.",
        content: "고객님이 새로운 이사 견적을 요청했습니다.",
      },
    ]);

    const result = await createMoveRequestForCustomer(CUSTOMER_ID, validInput);

    expect(result.id).toBe(MOVE_REQUEST_ID);

    // 알림 대상 조회·생성이 지역과 서비스 유형 매칭 값 그대로 이루어졌는지 확인한다.
    expect(findMoversForNewMoveRequestNotification).toHaveBeenCalledWith(
      REGION_ID,
      SERVICE_TYPE_ID,
      {},
    );

    expect(publishNotificationToUser).toHaveBeenCalledTimes(2);
    expect(publishNotificationToUser).toHaveBeenCalledWith(MOVER_USER_ID, {
      type: "NEW_MOVE_REQUEST",
      title: "새로운 이사 견적 요청이 도착했습니다.",
      content: "고객님이 새로운 이사 견적을 요청했습니다.",
      moveRequestId: MOVE_REQUEST_ID,
      quoteId: null,
      params: null,
      createdAt: expect.any(String),
    });
    expect(publishNotificationToUser).toHaveBeenCalledWith(OTHER_MOVER_USER_ID, {
      type: "NEW_MOVE_REQUEST",
      title: "새로운 이사 견적 요청이 도착했습니다.",
      content: "고객님이 새로운 이사 견적을 요청했습니다.",
      moveRequestId: MOVE_REQUEST_ID,
      quoteId: null,
      params: null,
      createdAt: expect.any(String),
    });
  });

  test("매칭되는 기사가 없으면 push하지 않는다(0명도 정상 처리)", async () => {
    jest.mocked(findMoversForNewMoveRequestNotification).mockResolvedValue([]);
    jest.mocked(createNewMoveRequestNotifications).mockResolvedValue([]);

    await expect(
      createMoveRequestForCustomer(CUSTOMER_ID, validInput),
    ).resolves.toMatchObject({ id: MOVE_REQUEST_ID });

    expect(createNewMoveRequestNotifications).toHaveBeenCalledWith(
      {},
      { moverUserIds: [], moveRequestId: MOVE_REQUEST_ID },
    );
    expect(publishNotificationToUser).not.toHaveBeenCalled();
  });

  test("이미 활성 요청이 있어 transaction이 실패하면 알림을 생성하거나 push하지 않는다", async () => {
    jest.mocked(findActiveMoveRequestByCustomerId).mockResolvedValue(
      createMoveRequestRecord(),
    );

    await expect(
      createMoveRequestForCustomer(CUSTOMER_ID, validInput),
    ).rejects.toMatchObject({ code: "ACTIVE_MOVE_REQUEST_EXISTS" });

    expect(findMoversForNewMoveRequestNotification).not.toHaveBeenCalled();
    expect(createNewMoveRequestNotifications).not.toHaveBeenCalled();
    expect(publishNotificationToUser).not.toHaveBeenCalled();
  });
});
