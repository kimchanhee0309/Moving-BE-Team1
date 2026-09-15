/**
 * 받은 견적 목록 query가 기본값을 채우고 잘못된 필드를 details로 거절하는지 검증합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import { encodeReceivedQuoteCursor } from "../../src/modules/customer-quote/customer-quote.cursor";
import {
  parseQuoteIdParams,
  parseReceivedQuoteHistoryQuery,
  parseReceivedQuotesQuery,
} from "../../src/modules/customer-quote/customer-quote.validator";

describe("Received quotes query validator", () => {
  test("비어 있는 query는 최신순과 limit 10을 사용한다", () => {
    expect(parseReceivedQuotesQuery({})).toEqual({
      keyword: undefined,
      serviceType: undefined,
      isDesignated: undefined,
      sort: "CREATED_AT_DESC",
      cursor: undefined,
      limit: 10,
    });
  });

  test("검색어를 자르고 지정 견적·서비스 유형 필터를 파싱한다", () => {
    expect(
      parseReceivedQuotesQuery({
        keyword: " 김코드 ",
        serviceType: "SMALL",
        isDesignated: "true",
        sort: "PRICE_ASC",
        limit: "20",
      }),
    ).toEqual({
      keyword: "김코드",
      serviceType: "SMALL",
      isDesignated: true,
      sort: "PRICE_ASC",
      cursor: undefined,
      limit: 20,
    });
  });

  test("같은 sort의 cursor를 복원한다", () => {
    const cursor = encodeReceivedQuoteCursor({
      sort: "CREATED_AT_DESC",
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-09-11T03:00:00.000Z",
    });

    const query = parseReceivedQuotesQuery({ cursor });

    expect(query.cursor).toEqual({
      sort: "CREATED_AT_DESC",
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-09-11T03:00:00.000Z",
      moveDate: undefined,
      price: undefined,
    });
  });

  test("limit이 범위를 벗어나면 VALIDATION_ERROR를 반환한다", () => {
    expect.assertions(2);

    try {
      parseReceivedQuotesQuery({ limit: "51" });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "limit", reason: "1 이상 50 이하의 정수여야 합니다." },
        ]);
      }
    }
  });

  test("허용되지 않은 정렬과 서비스 유형을 함께 거절한다", () => {
    expect.assertions(2);

    try {
      parseReceivedQuotesQuery({
        serviceType: "PENDING",
        sort: "STATUS_ASC",
        isDesignated: "yes",
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details?.map((detail) => detail.field)).toEqual(
          expect.arrayContaining(["serviceType", "sort", "isDesignated"]),
        );
      }
    }
  });

  test("다른 sort로 만든 cursor는 거절한다", () => {
    const cursor = encodeReceivedQuoteCursor({
      sort: "PRICE_ASC",
      id: "11111111-1111-4111-8111-111111111111",
      price: 150000,
    });

    expect(() =>
      parseReceivedQuotesQuery({
        sort: "CREATED_AT_DESC",
        cursor,
      }),
    ).toThrow(BadRequestError);
  });

  test("50자를 넘는 검색어는 거절한다", () => {
    expect(() =>
      parseReceivedQuotesQuery({ keyword: "가".repeat(51) }),
    ).toThrow(BadRequestError);
  });
});

describe("Quote id params validator", () => {
  test("UUID quoteId를 통과시킨다", () => {
    expect(
      parseQuoteIdParams({ quoteId: "11111111-1111-4111-8111-111111111111" }),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("UUID가 아니면 VALIDATION_ERROR를 반환한다", () => {
    expect.assertions(2);

    try {
      parseQuoteIdParams({ quoteId: "history" });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "quoteId", reason: "UUID 형식이어야 합니다." },
        ]);
      }
    }
  });
});

describe("Received quotes history query validator", () => {
  test("비어 있는 query는 확정 시각 최신순과 limit 10을 사용한다", () => {
    expect(parseReceivedQuoteHistoryQuery({})).toEqual({
      keyword: undefined,
      serviceType: undefined,
      moveRequestStatus: undefined,
      sort: "UPDATED_AT_DESC",
      cursor: undefined,
      limit: 10,
    });
  });

  test("요청 상태와 정렬을 파싱한다", () => {
    expect(
      parseReceivedQuoteHistoryQuery({
        moveRequestStatus: "COMPLETED",
        sort: "MOVE_DATE_DESC",
        limit: "5",
      }),
    ).toEqual({
      keyword: undefined,
      serviceType: undefined,
      moveRequestStatus: "COMPLETED",
      sort: "MOVE_DATE_DESC",
      cursor: undefined,
      limit: 5,
    });
  });

  test("WAITING 요청 상태는 거절한다", () => {
    expect(() =>
      parseReceivedQuoteHistoryQuery({ moveRequestStatus: "WAITING" }),
    ).toThrow(BadRequestError);
  });
});
