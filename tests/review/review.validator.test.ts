/**
 * Review Validator가 UUID·평점·본문·목록 Query 범위를 검사하는지 검증합니다.
 *
 * 사전 조건: HTTP·DB 없이 순수 입력만 전달한다.
 * 시나리오: 정상 UUID/기본값, 잘못된 type, pageSize 초과, rating 범위, content 길이.
 * 기대 결과: 정규화된 DTO 또는 VALIDATION_ERROR details.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  REVIEW_LIST_DEFAULT_PAGE,
  REVIEW_LIST_DEFAULT_PAGE_SIZE,
  parseCreateReviewInput,
  parseListCustomerReviewsQuery,
  parseListReviewsQuery,
  parseMoverIdParam,
} from "../../src/modules/review/review.validator";

const validMoverId = "11111111-1111-4111-8111-111111111111";
const validMoveRequestId = "55555555-5555-4555-8555-555555555555";

describe("Review validator", () => {
  test("moverId UUID를 정규화한다", () => {
    expect(parseMoverIdParam({ moverId: ` ${validMoverId} ` })).toEqual({
      moverId: validMoverId,
    });
  });

  test("moverId가 UUID가 아니면 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(3);

    try {
      parseMoverIdParam({ moverId: "not-a-uuid" });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.details).toEqual([
          { field: "moverId", reason: "UUID 형식이어야 합니다." },
        ]);
      }
    }
  });

  test("목록 Query가 없으면 page와 pageSize 기본값을 사용한다", () => {
    expect(parseListReviewsQuery(undefined)).toEqual({
      page: REVIEW_LIST_DEFAULT_PAGE,
      pageSize: REVIEW_LIST_DEFAULT_PAGE_SIZE,
    });
  });

  test("pageSize가 50을 넘으면 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(2);

    try {
      parseListReviewsQuery({ page: "1", pageSize: "51" });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "pageSize", reason: "50 이하여야 합니다." },
        ]);
      }
    }
  });

  test("고객 목록 type이 없으면 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(2);

    try {
      parseListCustomerReviewsQuery({ page: "1" });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          {
            field: "type",
            reason: "WRITABLE 또는 WRITTEN만 사용할 수 있습니다.",
          },
        ]);
      }
    }
  });

  test("고객 목록 type을 대소문자 없이 WRITTEN으로 정규화한다", () => {
    expect(parseListCustomerReviewsQuery({ type: " written " })).toEqual({
      type: "WRITTEN",
      page: REVIEW_LIST_DEFAULT_PAGE,
      pageSize: REVIEW_LIST_DEFAULT_PAGE_SIZE,
    });
  });

  test("리뷰 작성 Body를 정규화한다", () => {
    expect(
      parseCreateReviewInput({
        moveRequestId: validMoveRequestId,
        rating: 5,
        content: "친절하고 꼼꼼하게 이사를 진행해 주셔서 만족했습니다.",
      }),
    ).toEqual({
      moveRequestId: validMoveRequestId,
      rating: 5,
      content: "친절하고 꼼꼼하게 이사를 진행해 주셔서 만족했습니다.",
    });
  });

  test("rating이 1~5가 아니면 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(2);

    try {
      parseCreateReviewInput({
        moveRequestId: validMoveRequestId,
        rating: 6,
        content: "친절하고 꼼꼼하게 이사를 진행해 주셔서 만족했습니다.",
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "rating", reason: "1부터 5 사이의 정수여야 합니다." },
        ]);
      }
    }
  });

  test("content가 10자 미만이면 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(2);

    try {
      parseCreateReviewInput({
        moveRequestId: validMoveRequestId,
        rating: 5,
        content: "짧음",
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "content", reason: "10자 이상이어야 합니다." },
        ]);
      }
    }
  });

  test("허용되지 않은 Body 필드는 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(2);

    try {
      parseCreateReviewInput({
        moveRequestId: validMoveRequestId,
        rating: 5,
        content: "친절하고 꼼꼼하게 이사를 진행해 주셔서 만족했습니다.",
        moverId: validMoverId,
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "moverId", reason: "허용되지 않은 필드입니다." },
        ]);
      }
    }
  });

  test("Body가 객체가 아니면 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(2);

    try {
      parseCreateReviewInput(null);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "body", reason: "요청 Body가 필요합니다." },
        ]);
      }
    }
  });
});
