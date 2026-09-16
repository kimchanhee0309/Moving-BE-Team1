/**
 * 받은 요청 목록 Query Parameter의 기본값, 정규화 및 오류 처리를 검증합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import { parseGetReceivedRequestsQuery } from "../../src/modules/mover-request/mover-request.validator";

describe("Mover request validator", () => {
  test("Query Parameter가 없으면 기본값을 반환한다", () => {
    const result = parseGetReceivedRequestsQuery({});

    expect(result).toEqual({
      keyword: undefined,
      serviceType: undefined,
      isDesignated: undefined,
      sort: "REQUESTED_AT_DESC",
      cursor: undefined,
      limit: 10,
    });
  });

  test("검색어 공백을 제거하고 필터 값을 변환한다", () => {
    const cursor = "550e8400-e29b-41d4-a716-446655440000";

    const result = parseGetReceivedRequestsQuery({
      keyword: " 김인서 ",
      serviceType: "HOME",
      isDesignated: "true",
      sort: "MOVE_DATE_ASC",
      cursor,
      limit: "20",
    });

    expect(result).toEqual({
      keyword: "김인서",
      serviceType: "HOME",
      isDesignated: true,
      sort: "MOVE_DATE_ASC",
      cursor,
      limit: 20,
    });
  });

  test("isDesignated가 false 문자열이면 boolean false로 변환한다", () => {
    const result = parseGetReceivedRequestsQuery({
      isDesignated: "false",
    });

    expect(result.isDesignated).toBe(false);
  });

  test("잘못된 Query Parameter를 details 배열에 모두 기록한다", () => {
    expect.assertions(2);

    try {
      parseGetReceivedRequestsQuery({
        keyword: "가".repeat(51),
        serviceType: "INVALID",
        isDesignated: "yes",
        sort: "OLDEST",
        cursor: "invalid-uuid",
        limit: "51",
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details?.map((detail) => detail.field)).toEqual(
          expect.arrayContaining([
            "keyword",
            "serviceType",
            "isDesignated",
            "sort",
            "cursor",
            "limit",
          ]),
        );
      }
    }
  });

  test("limit이 정수가 아니면 오류를 반환한다", () => {
    expect(() =>
      parseGetReceivedRequestsQuery({
        limit: "1.5",
      }),
    ).toThrow(BadRequestError);
  });

  test("Query Parameter가 객체가 아니면 오류를 반환한다", () => {
    expect(() => parseGetReceivedRequestsQuery([])).toThrow(BadRequestError);
  });
});
