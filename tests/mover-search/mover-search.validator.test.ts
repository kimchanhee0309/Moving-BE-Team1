/**
 * 기사님 찾기 목록 query가 기본값을 채우고 잘못된 필드를 details로 거절하는지 검증합니다.
 */
import { BadRequestError } from "../../src/common/errors/app-error";
import { parseMoverSearchQuery } from "../../src/modules/mover-search/mover-search.validator";

describe("Mover search query validator", () => {
  test("비어 있는 query는 reviewCount 정렬과 pageSize 5를 사용한다", () => {
    expect(parseMoverSearchQuery({})).toEqual({
      search: undefined,
      regions: [],
      services: [],
      sort: "reviewCount",
      page: 1,
      pageSize: 5,
    });
  });

  test("검색어를 자르고 쉼표 구분 지역·서비스를 파싱한다", () => {
    expect(
      parseMoverSearchQuery({
        search: " 김코드 ",
        regions: "서울, 경기",
        services: "SMALL,HOME",
        sort: "careerYears",
        page: "2",
        pageSize: "5",
      }),
    ).toEqual({
      search: "김코드",
      regions: ["서울", "경기"],
      services: ["SMALL", "HOME"],
      sort: "careerYears",
      page: 2,
      pageSize: 5,
    });
  });

  test("pageSize가 범위를 벗어나면 VALIDATION_ERROR를 반환한다", () => {
    expect.assertions(2);

    try {
      parseMoverSearchQuery({ pageSize: "21" });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "pageSize", reason: "1 이상 20 이하의 정수여야 합니다." },
        ]);
      }
    }
  });

  test("허용되지 않은 정렬과 지역을 거절한다", () => {
    expect.assertions(2);

    try {
      parseMoverSearchQuery({
        sort: "favoriteCount",
        regions: "seoul",
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          {
            field: "regions",
            reason:
              "서울, 경기, 인천, 강원, 충북, 충남, 세종, 대전, 전북, 전남, 광주, 경북, 경남, 대구, 울산, 부산, 제주만 사용할 수 있습니다.",
          },
          {
            field: "sort",
            reason:
              "reviewCount, rating, careerYears, confirmedCount만 사용할 수 있습니다.",
          },
        ]);
      }
    }
  });

  test("같은 키를 배열로 보내면 거절한다", () => {
    expect.assertions(2);

    try {
      parseMoverSearchQuery({ regions: ["서울", "경기"] });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestError);

      if (error instanceof BadRequestError) {
        expect(error.details).toEqual([
          { field: "regions", reason: "하나의 값만 허용합니다." },
        ]);
      }
    }
  });
});
