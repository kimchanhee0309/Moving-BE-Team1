/**
 * 견적 전송(sendQuoteToReceivedRequest)이 Notification row 생성뿐 아니라
 * transaction 커밋 이후 SSE push까지 호출하는지 검증합니다.
 * 실제 DB·Serializable transaction 대신 Repository와 notification.hub를 mock합니다.
 */
jest.mock("../../src/modules/mover-request/mover-request.repository", () => ({
  createNewQuoteNotification: jest.fn(),
  createQuote: jest.fn(),
  createRequestRejection: jest.fn(),
  findReceivedRequestForAction: jest.fn(),
  findReceivedRequests: jest.fn(),
}));

jest.mock("../../src/modules/notification/notification.hub", () => ({
  publishNotificationToUser: jest.fn(),
}));

// runSerializableTransaction은 mover-request.service.ts 내부 함수이므로 직접 mock할 수 없어
// prisma.$transaction 자체를 콜백을 즉시 실행하는 형태로 대체합니다.
jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(
      async (callback: (tx: unknown) => unknown) => callback({}),
    ),
  },
}));

import type { ReceivedRequestActionRecord } from "../../src/modules/mover-request/mover-request.repository";
import {
  createNewQuoteNotification,
  createQuote,
  findReceivedRequestForAction,
} from "../../src/modules/mover-request/mover-request.repository";
import { sendQuoteToReceivedRequest } from "../../src/modules/mover-request/mover-request.service";
import { publishNotificationToUser } from "../../src/modules/notification/notification.hub";
import { prisma } from "../../src/lib/prisma";

const MOVER_ID = "550e8400-e29b-41d4-a716-446655440000";
const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440001";
const CUSTOMER_USER_ID = "550e8400-e29b-41d4-a716-446655440002";
const QUOTE_ID = "550e8400-e29b-41d4-a716-446655440003";
const NOW = new Date("2026-09-14T00:00:00.000Z");

function createActionRecord(): ReceivedRequestActionRecord {
  return {
    id: REQUEST_ID,
    status: "WAITING",
    moveDate: new Date("2026-09-20T00:00:00.000Z"),
    customer: { userId: CUSTOMER_USER_ID },
    serviceType: {
      name: "SMALL",
      moverServiceTypes: [
        {
          id: "service-type-mover-id",
          mover: { nickname: "김코드" },
        },
      ],
    },
    designatedRequests: [],
    quotes: [],
    requestRejections: [],
  };
}

describe("sendQuoteToReceivedRequest의 알림 push", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // resetAllMocks는 module factory에서 지정한 mockImplementation도 지우므로
    // 매 테스트마다 transaction 콜백을 즉시 실행하는 형태로 다시 설정한다.
    jest.mocked(prisma.$transaction).mockImplementation(
      async (callback) =>
        (callback as unknown as (tx: object) => Promise<unknown>)({}),
    );
  });

  test("견적 전송이 성공하면 transaction 커밋 후 고객에게 NEW_QUOTE를 push한다", async () => {
    jest.mocked(findReceivedRequestForAction).mockResolvedValue(createActionRecord());
    jest.mocked(createQuote).mockResolvedValue({
      id: QUOTE_ID,
      moveRequestId: REQUEST_ID,
      price: 150000,
      comment: "안전하게 이사를 도와드리겠습니다.",
      status: "PROPOSED",
      createdAt: new Date("2026-09-14T01:00:00.000Z"),
    });
    jest.mocked(createNewQuoteNotification).mockResolvedValue({
      userId: CUSTOMER_USER_ID,
      moveRequestId: REQUEST_ID,
      quoteId: QUOTE_ID,
      type: "NEW_QUOTE",
      title: "새로운 견적이 도착했습니다.",
      content: "김코드 기사님의 소형이사 견적이 도착했어요",
    });

    const result = await sendQuoteToReceivedRequest(
      MOVER_ID,
      REQUEST_ID,
      { price: 150000, comment: "안전하게 이사를 도와드리겠습니다." },
      NOW,
    );

    expect(result).toEqual({
      quoteId: QUOTE_ID,
      requestId: REQUEST_ID,
      price: 150000,
      comment: "안전하게 이사를 도와드리겠습니다.",
      status: "PROPOSED",
      createdAt: "2026-09-14T01:00:00.000Z",
    });

    expect(publishNotificationToUser).toHaveBeenCalledTimes(1);
    expect(publishNotificationToUser).toHaveBeenCalledWith(CUSTOMER_USER_ID, {
      type: "NEW_QUOTE",
      title: "새로운 견적이 도착했습니다.",
      content: "김코드 기사님의 소형이사 견적이 도착했어요",
      moveRequestId: REQUEST_ID,
      quoteId: QUOTE_ID,
      createdAt: expect.any(String),
    });

    // createNewQuoteNotification에 기사 닉네임·서비스 타입이 select에서 얻은 값 그대로
    // 전달되는지도 함께 검증한다(별도 round-trip 없이 findReceivedRequestForAction의
    // 결과를 재사용해야 하므로).
    expect(createNewQuoteNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        moverNickname: "김코드",
        serviceTypeName: "SMALL",
      }),
    );
  });

  test("요청 상태가 유효하지 않으면 push하지 않는다", async () => {
    jest.mocked(findReceivedRequestForAction).mockResolvedValue({
      ...createActionRecord(),
      status: "CONFIRMED",
    });

    await expect(
      sendQuoteToReceivedRequest(
        MOVER_ID,
        REQUEST_ID,
        { price: 150000, comment: "코멘트" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "REQUEST_NOT_AVAILABLE" });

    expect(createNewQuoteNotification).not.toHaveBeenCalled();
    expect(publishNotificationToUser).not.toHaveBeenCalled();
  });
});
