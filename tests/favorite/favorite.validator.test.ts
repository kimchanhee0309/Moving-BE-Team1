/**
 * Favorite Validator가 UUID와 목록 Query 범위를 검사하는지 검증합니다.
 *
 * 사전 조건: HTTP·DB 없이 순수 입력만 전달한다.
 * 시나리오: 정상 UUID/기본값, 잘못된 UUID, pageSize 초과, page 상한, skip 상한, 큰 정수·정밀도 손실.
 * 기대 결과: 정규화된 DTO 또는 VALIDATION_ERROR details.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import {
  FAVORITE_LIST_DEFAULT_PAGE,
  FAVORITE_LIST_DEFAULT_PAGE_SIZE,
  FAVORITE_LIST_MAX_PAGE,
  FAVORITE_LIST_MAX_PAGE_SIZE,
  FAVORITE_LIST_MAX_SKIP,
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

  test("page 최댓값과 pageSize 1은 허용한다", () => {
    expect(
      parseListFavoritesQuery({
        page: String(FAVORITE_LIST_MAX_PAGE),
        pageSize: "1",
      }),
    ).toEqual({
      page: FAVORITE_LIST_MAX_PAGE,
      pageSize: 1,
    });
  });

  test("page가 최댓값을 넘으면 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(2);

    try {
      parseListFavoritesQuery({
        page: String(FAVORITE_LIST_MAX_PAGE + 1),
        pageSize: "1",
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "page", reason: `${FAVORITE_LIST_MAX_PAGE} 이하여야 합니다.` },
        ]);
      }
    }
  });

  test("pageSize 최댓값에서 skip 상한 안의 page는 허용한다", () => {
    const maxPageForMaxPageSize =
      Math.floor(FAVORITE_LIST_MAX_SKIP / FAVORITE_LIST_MAX_PAGE_SIZE) + 1;

    expect(
      parseListFavoritesQuery({
        page: String(maxPageForMaxPageSize),
        pageSize: String(FAVORITE_LIST_MAX_PAGE_SIZE),
      }),
    ).toEqual({
      page: maxPageForMaxPageSize,
      pageSize: FAVORITE_LIST_MAX_PAGE_SIZE,
    });
  });

  test("계산된 skip이 상한을 넘으면 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(3);

    const overflowingPage =
      Math.floor(FAVORITE_LIST_MAX_SKIP / FAVORITE_LIST_MAX_PAGE_SIZE) + 2;

    try {
      parseListFavoritesQuery({
        page: String(overflowingPage),
        pageSize: String(FAVORITE_LIST_MAX_PAGE_SIZE),
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.details).toEqual([
          { field: "page", reason: "조회 위치가 허용 범위를 넘습니다." },
        ]);
      }
    }
  });

  test("JS 정밀도를 넘는 page는 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(3);

    try {
      parseListFavoritesQuery({ page: "9007199254740993" });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.details).toEqual([
          { field: "page", reason: "허용된 정수 범위를 벗어났습니다." },
        ]);
      }
    }
  });

  test("과도하게 큰 page는 VALIDATION_ERROR를 던진다", () => {
    expect.assertions(2);

    try {
      parseListFavoritesQuery({ page: "100000000000000000000" });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "page", reason: "허용된 정수 범위를 벗어났습니다." },
        ]);
      }
    }
  });
});
