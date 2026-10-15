/**
 * 받은 요청 Repository가 기사님이 처리할 수 있는 요청만 조회하도록
 * Prisma 조회 조건을 생성하는지 검증합니다.
 */
const mockFindMany = jest.fn();

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    moveRequest: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: jest.fn(),
    },
  },
}));

import { findReceivedRequests } from "../../src/modules/mover-request/mover-request.repository";

describe("Mover request repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  test("대기 중이고 이사일이 지나지 않은 요청만 조회한다", async () => {
    const now = new Date("2026-09-14T00:00:00.000Z");
    const moverId = "550e8400-e29b-41d4-a716-446655440000";

    await findReceivedRequests({
      moverId,
      now,
      keyword: undefined,
      serviceType: undefined,
      isDesignated: undefined,
      sort: "REQUESTED_AT_DESC",
      cursor: undefined,
      limit: 10,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "WAITING",

          moveDate: {
            gte: now,
          },

          serviceType: {
            moverServiceTypes: {
              some: {
                moverId,
              },
            },
          },

          quotes: {
            none: {
              moverId,
            },
          },

          requestRejections: {
            none: {
              moverId,
            },
          },
        }),

        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 11,
      }),
    );

    expect(mockFindMany.mock.calls[0]?.[0]).not.toHaveProperty("cursor");
    expect(mockFindMany.mock.calls[0]?.[0]).not.toHaveProperty("skip");
  });

  test("검색어와 서비스 유형 및 지정 요청 필터를 적용한다", async () => {
    const now = new Date("2026-09-14T00:00:00.000Z");
    const moverId = "550e8400-e29b-41d4-a716-446655440000";

    await findReceivedRequests({
      moverId,
      now,
      keyword: "김인서",
      serviceType: "HOME",
      isDesignated: true,
      sort: "MOVE_DATE_ASC",
      cursor: undefined,
      limit: 5,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customer: {
            user: {
              name: {
                contains: "김인서",
                mode: "insensitive",
              },
            },
          },

          serviceType: {
            moverServiceTypes: {
              some: {
                moverId,
              },
            },
            name: "HOME",
          },

          designatedRequests: {
            some: {
              moverId,
            },
          },
        }),

        orderBy: [{ moveDate: "asc" }, { id: "asc" }],
        take: 6,
      }),
    );
  });

  test("일반 요청 필터에서는 현재 기사님의 지정 요청을 제외한다", async () => {
    const now = new Date("2026-09-14T00:00:00.000Z");
    const moverId = "550e8400-e29b-41d4-a716-446655440000";

    await findReceivedRequests({
      moverId,
      now,
      keyword: undefined,
      serviceType: undefined,
      isDesignated: false,
      sort: "REQUESTED_AT_DESC",
      cursor: undefined,
      limit: 10,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          designatedRequests: {
            none: {
              moverId,
            },
          },
        }),
      }),
    );
  });

  test("cursor가 있으면 해당 요청 다음부터 조회한다", async () => {
    const cursor = "550e8400-e29b-41d4-a716-446655440001";

    await findReceivedRequests({
      moverId: "550e8400-e29b-41d4-a716-446655440000",
      now: new Date("2026-09-14T00:00:00.000Z"),
      keyword: undefined,
      serviceType: undefined,
      isDesignated: undefined,
      sort: "REQUESTED_AT_DESC",
      cursor,
      limit: 10,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: {
          id: cursor,
        },
        skip: 1,
        take: 11,
      }),
    );
  });
});
