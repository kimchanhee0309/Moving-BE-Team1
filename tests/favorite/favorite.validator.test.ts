/**
 * Favorite Validator가 UUID와 목록 Query 범위를 검사하는지 검증합니다.
 *
 * 사전 조건: HTTP·DB 없이 순수 입력만 전달한다.
 * 시나리오: 정상 UUID/기본값, 잘못된 UUID, pageSize 초과, 배열 Query.
 * 기대 결과: 정규화된 DTO 또는 VALIDATION_ERROR details.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  FAVORITE_LIST_DEFAULT_PAGE,
  FAVORITE_LIST_DEFAULT_PAGE_SIZE,
  parseListFavoritesQuery,
  parseMoverIdParam,
} from "../../src/modules/favorite/favorite.validator";

const validMoverId = "11111111-1111-4111-8111-111111111111";

describe("Favorite validator", () => {
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
    expect(parseListFavoritesQuery(undefined)).toEqual({
      page: FAVORITE_LIST_DEFAULT_PAGE,
      pageSize: FAVORITE_LIST_DEFAULT_PAGE_SIZE,
    });
  });

  test("pageSize가 50을 넘으면 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(2);

    try {
      parseListFavoritesQuery({ page: "1", pageSize: "51" });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "pageSize", reason: "50 이하여야 합니다." },
        ]);
      }
    }
  });

  test("page가 1 미만이면 VALIDATION_ERROR를 던진다", () => {
    expect(() => parseListFavoritesQuery({ page: "0" })).toThrow(BadRequestError);
  });
});
