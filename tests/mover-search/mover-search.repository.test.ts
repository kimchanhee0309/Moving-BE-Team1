/**
 * 찾기 목록 where가 서비스·지역 없는 mover를 검색 대상에서 빼는지 검증합니다.
 * 이 조건이 totalCount와 페이지 계산의 기준이 됩니다.
 */
jest.mock("../../src/lib/prisma", () => ({
  prisma: {},
}));

import {
  MOVER_SERVICE_TYPES,
  REGION_DB_NAMES,
} from "../../src/modules/mover-search/mover-search.constants";
import type { MoverSearchQuery } from "../../src/modules/mover-search/mover-search.dto";
import { createMoverSearchWhere } from "../../src/modules/mover-search/mover-search.repository";

const emptyQuery: MoverSearchQuery = {
  regions: [],
  services: [],
  sort: "reviewCount",
  page: 1,
  pageSize: 5,
};

describe("createMoverSearchWhere", () => {
  test("필터가 없어도 인식 가능한 서비스·지역이 있는 mover만 조회한다", () => {
    expect(createMoverSearchWhere(emptyQuery)).toEqual({
      serviceTypes: {
        some: {
          serviceType: {
            name: { in: [...MOVER_SERVICE_TYPES] },
          },
        },
      },
      regions: {
        some: {
          region: {
            name: { in: [...REGION_DB_NAMES] },
          },
        },
      },
    });
  });

  test("서비스·지역 필터가 있으면 해당 값으로 좁히되 관계 조건은 유지한다", () => {
    expect(
      createMoverSearchWhere({
        ...emptyQuery,
        services: ["SMALL"],
        regions: ["서울"],
      }),
    ).toEqual({
      serviceTypes: {
        some: {
          serviceType: {
            name: { in: ["SMALL"] },
          },
        },
      },
      regions: {
        some: {
          region: {
            name: { in: ["SEOUL"] },
          },
        },
      },
    });
  });
});
