/**
 * opaque cursor가 정렬 키를 왕복하고 잘못된 값을 거절하는지 검증합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  decodeReceivedQuoteCursor,
  decodeReceivedQuoteHistoryCursor,
  encodeReceivedQuoteCursor,
  encodeReceivedQuoteHistoryCursor,
} from "../../src/modules/customer-quote/customer-quote.cursor";

describe("Received quote cursor", () => {
  test("금액 오름차순 cursor의 null 가격을 왕복한다", () => {
    const encoded = encodeReceivedQuoteCursor({
      sort: "PRICE_ASC",
      id: "11111111-1111-4111-8111-111111111111",
      price: null,
    });

    expect(decodeReceivedQuoteCursor(encoded, "PRICE_ASC")).toEqual({
      sort: "PRICE_ASC",
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: undefined,
      moveDate: undefined,
      price: null,
    });
  });

  test("문자열이 아닌 cursor는 VALIDATION_ERROR다", () => {
    expect(() =>
      decodeReceivedQuoteCursor("not-a-cursor", "CREATED_AT_DESC"),
    ).toThrow(BadRequestError);
  });

  test("날짜만 있는 생성 시각 키는 거절한다", () => {
    const encoded = encodeReceivedQuoteCursor({
      sort: "CREATED_AT_DESC",
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-08-02",
    });

    expect(() =>
      decodeReceivedQuoteCursor(encoded, "CREATED_AT_DESC"),
    ).toThrow(BadRequestError);
  });
});

describe("Received quote history cursor", () => {
  test("확정 시각 최신순 cursor를 왕복한다", () => {
    const encoded = encodeReceivedQuoteHistoryCursor({
      sort: "UPDATED_AT_DESC",
      id: "44444444-4444-4444-8444-444444444444",
      updatedAt: "2026-08-02T05:00:00.000Z",
    });

    expect(decodeReceivedQuoteHistoryCursor(encoded, "UPDATED_AT_DESC")).toEqual({
      sort: "UPDATED_AT_DESC",
      id: "44444444-4444-4444-8444-444444444444",
      updatedAt: "2026-08-02T05:00:00.000Z",
      moveDate: undefined,
    });
  });

  test("날짜만 있는 정렬 키는 거절한다", () => {
    const encoded = encodeReceivedQuoteHistoryCursor({
      sort: "UPDATED_AT_DESC",
      id: "44444444-4444-4444-8444-444444444444",
      updatedAt: "2026-08-02",
    });

    expect(() =>
      decodeReceivedQuoteHistoryCursor(encoded, "UPDATED_AT_DESC"),
    ).toThrow(BadRequestError);
  });
});
