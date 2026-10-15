/**
 * 기사님 견적 관리 Validator의 기본값, 상태 필터, UUID와 pagination 검증을 확인합니다.
 * DB와 인증 없이 외부 Query 및 Path Parameter 계약만 검증합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  parseGetMoverQuotesQuery,
  parseGetRejectedRequestsQuery,
  parseMoverQuoteId,
} from "../../src/modules/mover-quote/mover-quote.validator";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("Mover quote validator", () => {
  test("보낸 견적 Query가 없으면 기본 limit을 반환한다", () => {
    expect(parseGetMoverQuotesQuery({})).toEqual({
      status: undefined,
      cursor: undefined,
      limit: 10,
    });
  });

  test("견적 상태와 pagination Query를 변환한다", () => {
    expect(
      parseGetMoverQuotesQuery({
        status: "CONFIRMED",
        cursor: VALID_UUID,
        limit: "20",
      }),
    ).toEqual({
      status: "CONFIRMED",
      cursor: VALID_UUID,
      limit: 20,
    });
  });

  test("지원하지 않는 견적 상태를 거절한다", () => {
    expect(() =>
      parseGetMoverQuotesQuery({
        status: "PENDING",
      }),
    ).toThrow(BadRequestError);
  });

  test("limit 범위를 벗어나면 거절한다", () => {
    expect(() =>
      parseGetMoverQuotesQuery({
        limit: "51",
      }),
    ).toThrow(BadRequestError);

    expect(() =>
      parseGetMoverQuotesQuery({
        limit: "0",
      }),
    ).toThrow(BadRequestError);
  });

  test("허용되지 않은 Query 필드를 거절한다", () => {
    expect(() =>
      parseGetMoverQuotesQuery({
        customerId: VALID_UUID,
      }),
    ).toThrow(BadRequestError);
  });

  test("반려 요청 Query의 기본값을 반환한다", () => {
    expect(parseGetRejectedRequestsQuery({})).toEqual({
      cursor: undefined,
      limit: 10,
    });
  });

  test("반려 요청 Query에는 status를 허용하지 않는다", () => {
    expect(() =>
      parseGetRejectedRequestsQuery({
        status: "REJECTED",
      }),
    ).toThrow(BadRequestError);
  });

  test("올바른 quoteId UUID를 반환한다", () => {
    expect(parseMoverQuoteId(VALID_UUID)).toBe(VALID_UUID);
  });

  test("잘못된 quoteId를 거절한다", () => {
    expect(() => parseMoverQuoteId("invalid-quote-id")).toThrow(
      BadRequestError,
    );
  });
});
