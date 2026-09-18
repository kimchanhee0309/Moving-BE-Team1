/**
 * 기사님 찾기 목록 Service가 집계·정렬·페이지와 카드 DTO를 만드는지 검증합니다.
 * 실제 DB 대신 Repository를 mock합니다.
 */
jest.mock("../../src/modules/mover-search/mover-search.repository", () => ({
  findFilteredMoverSortRows: jest.fn(),
  findMoverSearchAggregates: jest.fn(),
  findMoverSearchCardById: jest.fn(),
  findMoverSearchCardsByIds: jest.fn(),
}));

import { NotFoundError } from "../../src/common/errors/app-error";
import {
  findFilteredMoverSortRows,
  findMoverSearchAggregates,
  findMoverSearchCardById,
  findMoverSearchCardsByIds,
  type MoverSearchCardRecord,
} from "../../src/modules/mover-search/mover-search.repository";
import {
  getMoverById,
  listMovers,
  listRecommendedMovers,
} from "../../src/modules/mover-search/mover-search.service";
import type { MoverSearchQuery } from "../../src/modules/mover-search/mover-search.dto";

const moverA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const moverB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const moverC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const moverD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function createCard(
  id: string,
  overrides: Partial<MoverSearchCardRecord> = {},
): MoverSearchCardRecord {
  return {
    id,
    nickname: "김코드",
    shortIntroduction: "꼼꼼하고 안전한 이사를 도와드립니다.",
    description: "서울과 경기 지역을 중심으로 이사를 진행합니다.",
    profileImageUrl: null,
    careerYears: 8,
    serviceTypes: [
      { serviceType: { name: "HOME" } },
      { serviceType: { name: "SMALL" } },
    ],
    regions: [
      { region: { name: "GYEONGGI" } },
      { region: { name: "SEOUL" } },
    ],
    ...overrides,
  };
}

const defaultQuery: MoverSearchQuery = {
  regions: [],
  services: [],
  sort: "reviewCount",
  page: 1,
  pageSize: 5,
};

describe("listMovers", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("리뷰 많은 순으로 정렬하고 카드 필드를 화면 DTO로 매핑한다", async () => {
    jest.mocked(findFilteredMoverSortRows).mockResolvedValue([
      { id: moverA, careerYears: 3 },
      { id: moverB, careerYears: 8 },
    ]);
    jest.mocked(findMoverSearchAggregates).mockResolvedValue({
      reviewCountByMoverId: new Map([
        [moverA, 2],
        [moverB, 10],
      ]),
      ratingByMoverId: new Map([
        [moverA, 4.76],
        [moverB, 4.2],
      ]),
      favoriteCountByMoverId: new Map([[moverB, 4]]),
      confirmedCountByMoverId: new Map([[moverB, 1]]),
    });
    jest.mocked(findMoverSearchCardsByIds).mockResolvedValue([
      createCard(moverA, { nickname: "적은리뷰", careerYears: 3 }),
      createCard(moverB, { nickname: "많은리뷰" }),
    ]);

    const result = await listMovers(defaultQuery);

    expect(findMoverSearchCardsByIds).toHaveBeenCalledWith([moverB, moverA]);
    expect(result).toEqual({
      items: [
        {
          id: moverB,
          serviceType: "SMALL",
          region: "서울",
          moverName: "많은리뷰",
          introduction: "꼼꼼하고 안전한 이사를 도와드립니다.",
          description: "서울과 경기 지역을 중심으로 이사를 진행합니다.",
          profileImageUrl: null,
          rating: 4.2,
          reviewCount: 10,
          careerYears: 8,
          confirmedCount: 1,
          favoriteCount: 4,
        },
        {
          id: moverA,
          serviceType: "SMALL",
          region: "서울",
          moverName: "적은리뷰",
          introduction: "꼼꼼하고 안전한 이사를 도와드립니다.",
          description: "서울과 경기 지역을 중심으로 이사를 진행합니다.",
          profileImageUrl: null,
          rating: 4.8,
          reviewCount: 2,
          careerYears: 3,
          confirmedCount: 0,
          favoriteCount: 0,
        },
      ],
      nextPage: null,
      totalCount: 2,
    });
  });

  test("pageSize보다 많으면 nextPage를 반환한다", async () => {
    jest.mocked(findFilteredMoverSortRows).mockResolvedValue([
      { id: moverA, careerYears: 1 },
      { id: moverB, careerYears: 2 },
      { id: moverC, careerYears: 3 },
    ]);
    jest.mocked(findMoverSearchAggregates).mockResolvedValue({
      reviewCountByMoverId: new Map(),
      ratingByMoverId: new Map(),
      favoriteCountByMoverId: new Map(),
      confirmedCountByMoverId: new Map(),
    });
    jest.mocked(findMoverSearchCardsByIds).mockResolvedValue([
      createCard(moverC, {
        nickname: "경력3",
        serviceTypes: [{ serviceType: { name: "OFFICE" } }],
        regions: [{ region: { name: "BUSAN" } }],
      }),
      createCard(moverB, { nickname: "경력2" }),
    ]);

    const result = await listMovers({
      ...defaultQuery,
      sort: "careerYears",
      pageSize: 2,
    });

    expect(findMoverSearchCardsByIds).toHaveBeenCalledWith([moverC, moverB]);
    expect(result.nextPage).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(result.items.map((item) => item.moverName)).toEqual([
      "경력3",
      "경력2",
    ]);
    expect(result.items[0]?.serviceType).toBe("OFFICE");
    expect(result.items[0]?.region).toBe("부산");
  });

  test("인식 가능한 서비스·지역이 없으면 SMALL이나 빈 지역을 넣지 않는다", async () => {
    // 목록 where는 이런 mover를 totalCount에서 제외합니다.
    // 카드 매핑은 폴백 값을 만들지 않는 방어입니다.
    jest.mocked(findFilteredMoverSortRows).mockResolvedValue([
      { id: moverA, careerYears: 3 },
    ]);
    jest.mocked(findMoverSearchAggregates).mockResolvedValue({
      reviewCountByMoverId: new Map(),
      ratingByMoverId: new Map(),
      favoriteCountByMoverId: new Map(),
      confirmedCountByMoverId: new Map(),
    });
    jest.mocked(findMoverSearchCardsByIds).mockResolvedValue([
      createCard(moverA, {
        serviceTypes: [],
        regions: [{ region: { name: "UNKNOWN" } }],
      }),
    ]);

    const result = await listMovers(defaultQuery);

    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(1);
  });
});

describe("getMoverById", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("목록 필드에 서비스·지역 배열을 더해 상세 DTO를 만든다", async () => {
    jest.mocked(findMoverSearchCardById).mockResolvedValue(createCard(moverA));
    jest.mocked(findMoverSearchAggregates).mockResolvedValue({
      reviewCountByMoverId: new Map([[moverA, 2]]),
      ratingByMoverId: new Map([[moverA, 4.76]]),
      favoriteCountByMoverId: new Map([[moverA, 4]]),
      confirmedCountByMoverId: new Map([[moverA, 1]]),
    });

    await expect(getMoverById(moverA)).resolves.toEqual({
      id: moverA,
      serviceType: "SMALL",
      region: "서울",
      serviceTypes: ["SMALL", "HOME"],
      regions: ["서울", "경기"],
      moverName: "김코드",
      introduction: "꼼꼼하고 안전한 이사를 도와드립니다.",
      description: "서울과 경기 지역을 중심으로 이사를 진행합니다.",
      profileImageUrl: null,
      rating: 4.8,
      reviewCount: 2,
      careerYears: 8,
      confirmedCount: 1,
      favoriteCount: 4,
    });
  });

  test("기사님이 없으면 MOVER_NOT_FOUND를 던진다", async () => {
    expect.assertions(2);
    jest.mocked(findMoverSearchCardById).mockResolvedValue(null);

    try {
      await getMoverById(moverA);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NotFoundError);
      if (error instanceof NotFoundError) {
        expect(error.code).toBe("MOVER_NOT_FOUND");
      }
    }
  });

  test("인식 가능한 서비스·지역이 없으면 404로 거절한다", async () => {
    jest.mocked(findMoverSearchCardById).mockResolvedValue(
      createCard(moverA, {
        serviceTypes: [],
        regions: [{ region: { name: "UNKNOWN" } }],
      }),
    );
    jest.mocked(findMoverSearchAggregates).mockResolvedValue({
      reviewCountByMoverId: new Map(),
      ratingByMoverId: new Map(),
      favoriteCountByMoverId: new Map(),
      confirmedCountByMoverId: new Map(),
    });

    await expect(getMoverById(moverA)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listRecommendedMovers", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("찜 수·평점 순으로 최대 3명을 반환한다", async () => {
    jest.mocked(findFilteredMoverSortRows).mockResolvedValue([
      { id: moverA, careerYears: 1 },
      { id: moverB, careerYears: 2 },
      { id: moverC, careerYears: 3 },
      { id: moverD, careerYears: 4 },
    ]);
    jest.mocked(findMoverSearchAggregates).mockResolvedValue({
      reviewCountByMoverId: new Map(),
      ratingByMoverId: new Map([
        [moverA, 5],
        [moverB, 3],
        [moverC, 4.2],
        [moverD, 4.9],
      ]),
      favoriteCountByMoverId: new Map([
        [moverA, 2],
        [moverB, 5],
        [moverC, 5],
        [moverD, 1],
      ]),
      confirmedCountByMoverId: new Map(),
    });
    jest.mocked(findMoverSearchCardsByIds).mockResolvedValue([
      createCard(moverC, { nickname: "찜같음평점높음" }),
      createCard(moverB, { nickname: "찜같음평점낮음" }),
      createCard(moverA, { nickname: "찜중간" }),
    ]);

    const result = await listRecommendedMovers();

    expect(findMoverSearchCardsByIds).toHaveBeenCalledWith([
      moverC,
      moverB,
      moverA,
    ]);
    expect(result.items.map((item) => item.moverName)).toEqual([
      "찜같음평점높음",
      "찜같음평점낮음",
      "찜중간",
    ]);
    expect(result.items).toHaveLength(3);
  });
});
