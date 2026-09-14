/**
 * opaque cursor가 정렬 키를 왕복하고 잘못된 값을 거절하는지 검증합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  decodeReceivedQuoteCursor,
  encodeReceivedQuoteCursor,
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
});
