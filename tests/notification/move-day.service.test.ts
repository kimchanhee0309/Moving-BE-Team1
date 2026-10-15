/**
 * MOVE_DAY 알림 핵심 로직(runMoveDayNotificationJob)이
 * - "내일" 날짜를 올바르게 계산해 대상을 조회하는지
 * - 확정 견적 유무에 따라 고객·기사님 알림 대상을 올바르게 판별하는지
 * - 이미 발송된 (moveRequestId, userId) 조합을 제외하는지
 * - 새로 생성한 알림에 대해서만 SSE push하는지
 * 를 검증합니다. 실제 DB·cron 타이밍 대신 Repository와 notification.hub를 mock합니다.
 */
jest.mock("../../src/modules/notification/move-day.repository", () => ({
  createMoveDayNotifications: jest.fn(),
  findConfirmedMoveRequestsByMoveDate: jest.fn(),
  findExistingMoveDayNotificationRecipients: jest.fn(),
}));

jest.mock("../../src/modules/notification/notification.hub", () => ({
  publishNotificationToUser: jest.fn(),
}));

import {
  createMoveDayNotifications,
  findConfirmedMoveRequestsByMoveDate,
  findExistingMoveDayNotificationRecipients,
  type ConfirmedMoveRequestForMoveDay,
} from "../../src/modules/notification/move-day.repository";
import { publishNotificationToUser } from "../../src/modules/notification/notification.hub";
import { runMoveDayNotificationJob } from "../../src/modules/notification/move-day.service";

const MOVE_REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const CUSTOMER_USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const MOVER_USER_ID = "550e8400-e29b-41d4-a716-446655440002";
const QUOTE_ID = "550e8400-e29b-41d4-a716-446655440003";

// 스케줄러는 KST 17:00(=UTC 08:00)에 실행되므로 이 시각을 기준 now로 사용한다.
const NOW = new Date("2026-09-28T08:00:00.000Z");
const TOMORROW_UTC_MIDNIGHT = new Date("2026-09-29T00:00:00.000Z");

// content 조립에 쓰이는 출발지·도착지는 abbreviateAddress로 "경기(일산)"/"서울(영등포)"가
// 되는 실제 도로명 주소 형태를 사용해, move-day.address.ts와의 통합 결과까지 함께 검증한다.
const FROM_ADDRESS = "경기도 고양시 일산동구 중앙로 1000";
const TO_ADDRESS = "서울특별시 영등포구 여의대로 108";
const EXPECTED_CONTENT = "내일은 경기(일산) → 서울(영등포) 이사 예정일이에요.";

function createMoveRequestWithConfirmedQuote(): ConfirmedMoveRequestForMoveDay {
  return {
    id: MOVE_REQUEST_ID,
    fromAddress: FROM_ADDRESS,
    toAddress: TO_ADDRESS,
    customer: {
      userId: CUSTOMER_USER_ID,
      user: { name: "홍길동" },
    },
    quotes: [
      {
        id: QUOTE_ID,
        mover: { userId: MOVER_USER_ID, nickname: "빠른이사" },
      },
    ],
  };
}

function createMoveRequestWithoutConfirmedQuote(): ConfirmedMoveRequestForMoveDay {
  return {
    id: MOVE_REQUEST_ID,
    fromAddress: FROM_ADDRESS,
    toAddress: TO_ADDRESS,
    customer: {
      userId: CUSTOMER_USER_ID,
      user: { name: "홍길동" },
    },
    quotes: [],
  };
}

describe("runMoveDayNotificationJob", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("내일이 이사일인 CONFIRMED 요청이 없으면 조회조차 없이 빈 배열을 반환한다", async () => {
    jest.mocked(findConfirmedMoveRequestsByMoveDate).mockResolvedValue([]);

    const result = await runMoveDayNotificationJob(NOW);

    expect(result).toEqual([]);
    expect(findConfirmedMoveRequestsByMoveDate).toHaveBeenCalledWith(TOMORROW_UTC_MIDNIGHT);
    expect(findExistingMoveDayNotificationRecipients).not.toHaveBeenCalled();
    expect(createMoveDayNotifications).not.toHaveBeenCalled();
    expect(publishNotificationToUser).not.toHaveBeenCalled();
  });

  test("확정 견적이 있으면 고객·기사님 양쪽 후보를 만들어 생성하고 각각 push한다", async () => {
    jest
      .mocked(findConfirmedMoveRequestsByMoveDate)
      .mockResolvedValue([createMoveRequestWithConfirmedQuote()]);
    jest.mocked(findExistingMoveDayNotificationRecipients).mockResolvedValue([]);
    jest.mocked(createMoveDayNotifications).mockImplementation(async (records) => records);

    const result = await runMoveDayNotificationJob(NOW);

    expect(findExistingMoveDayNotificationRecipients).toHaveBeenCalledWith([MOVE_REQUEST_ID]);
    expect(createMoveDayNotifications).toHaveBeenCalledWith([
      {
        userId: CUSTOMER_USER_ID,
        moveRequestId: MOVE_REQUEST_ID,
        quoteId: QUOTE_ID,
        type: "MOVE_DAY",
        title: "내일은 이사 예정일입니다.",
        content: EXPECTED_CONTENT,
        params: { from: "경기(일산)", to: "서울(영등포)" },
      },
      {
        userId: MOVER_USER_ID,
        moveRequestId: MOVE_REQUEST_ID,
        quoteId: QUOTE_ID,
        type: "MOVE_DAY",
        title: "내일은 이사 예정일입니다.",
        content: EXPECTED_CONTENT,
        params: { from: "경기(일산)", to: "서울(영등포)" },
      },
    ]);

    expect(result).toHaveLength(2);
    expect(publishNotificationToUser).toHaveBeenCalledTimes(2);
    expect(publishNotificationToUser).toHaveBeenCalledWith(
      CUSTOMER_USER_ID,
      expect.objectContaining({ type: "MOVE_DAY", quoteId: QUOTE_ID }),
    );
    expect(publishNotificationToUser).toHaveBeenCalledWith(
      MOVER_USER_ID,
      expect.objectContaining({ type: "MOVE_DAY", quoteId: QUOTE_ID }),
    );
  });

  test("확정 견적이 없는 예외적 데이터는 고객에게만 보내고 기사님에게는 보내지 않는다", async () => {
    jest
      .mocked(findConfirmedMoveRequestsByMoveDate)
      .mockResolvedValue([createMoveRequestWithoutConfirmedQuote()]);
    jest.mocked(findExistingMoveDayNotificationRecipients).mockResolvedValue([]);
    jest.mocked(createMoveDayNotifications).mockImplementation(async (records) => records);

    const result = await runMoveDayNotificationJob(NOW);

    expect(createMoveDayNotifications).toHaveBeenCalledWith([
      {
        userId: CUSTOMER_USER_ID,
        moveRequestId: MOVE_REQUEST_ID,
        quoteId: null,
        type: "MOVE_DAY",
        title: "내일은 이사 예정일입니다.",
        content: EXPECTED_CONTENT,
        params: { from: "경기(일산)", to: "서울(영등포)" },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(publishNotificationToUser).toHaveBeenCalledTimes(1);
    expect(publishNotificationToUser).toHaveBeenCalledWith(
      CUSTOMER_USER_ID,
      expect.objectContaining({ quoteId: null }),
    );
  });

  test("이미 발송된 조합은 제외하고 아직 발송하지 않은 대상에게만 생성·push한다", async () => {
    jest
      .mocked(findConfirmedMoveRequestsByMoveDate)
      .mockResolvedValue([createMoveRequestWithConfirmedQuote()]);
    // 고객에게는 이미 MOVE_DAY 알림이 발송된 상태(예: 이전 스케줄러 실행 또는 재배포로 중복 실행).
    jest
      .mocked(findExistingMoveDayNotificationRecipients)
      .mockResolvedValue([{ moveRequestId: MOVE_REQUEST_ID, userId: CUSTOMER_USER_ID }]);
    jest.mocked(createMoveDayNotifications).mockImplementation(async (records) => records);

    const result = await runMoveDayNotificationJob(NOW);

    expect(createMoveDayNotifications).toHaveBeenCalledWith([
      {
        userId: MOVER_USER_ID,
        moveRequestId: MOVE_REQUEST_ID,
        quoteId: QUOTE_ID,
        type: "MOVE_DAY",
        title: "내일은 이사 예정일입니다.",
        content: EXPECTED_CONTENT,
        params: { from: "경기(일산)", to: "서울(영등포)" },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(publishNotificationToUser).toHaveBeenCalledTimes(1);
    expect(publishNotificationToUser).toHaveBeenCalledWith(
      MOVER_USER_ID,
      expect.objectContaining({ moveRequestId: MOVE_REQUEST_ID, quoteId: QUOTE_ID }),
    );
  });

  test("모든 대상이 이미 발송된 상태면 생성도 push도 하지 않는다", async () => {
    jest
      .mocked(findConfirmedMoveRequestsByMoveDate)
      .mockResolvedValue([createMoveRequestWithConfirmedQuote()]);
    jest.mocked(findExistingMoveDayNotificationRecipients).mockResolvedValue([
      { moveRequestId: MOVE_REQUEST_ID, userId: CUSTOMER_USER_ID },
      { moveRequestId: MOVE_REQUEST_ID, userId: MOVER_USER_ID },
    ]);
    jest.mocked(createMoveDayNotifications).mockImplementation(async (records) => records);

    const result = await runMoveDayNotificationJob(NOW);

    expect(createMoveDayNotifications).toHaveBeenCalledWith([]);
    expect(result).toEqual([]);
    expect(publishNotificationToUser).not.toHaveBeenCalled();
  });
});
