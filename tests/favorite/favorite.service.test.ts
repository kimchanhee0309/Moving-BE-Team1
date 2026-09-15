/**
 * Favorite Service의 등록·목록·해제 규칙과 오류 코드를 검증합니다.
 *
 * 사전 조건: Repository와 Prisma는 mock하고 실제 DB는 사용하지 않는다.
 * 시나리오: 정상 등록, 없는 기사님, 중복 찜, 본인 목록만 조회, 없는 찜 해제.
 * 기대 결과: DTO 변환과 MOVER_NOT_FOUND, FAVORITE_ALREADY_EXISTS, FAVORITE_NOT_FOUND.
 */
jest.mock("../../src/modules/favorite/favorite.repository", () => ({
  countFavoritesByCustomer: jest.fn(),
  createFavorite: jest.fn(),
  deleteFavoriteByCustomerAndMover: jest.fn(),
  findFavoriteByCustomerAndMover: jest.fn(),
  findFavoritesByCustomer: jest.fn(),
  findMoverId: jest.fn(),
}));

import { ConflictError, NotFoundError } from "../../src/common/errors/app-error";
import type { FavoriteRecord } from "../../src/modules/favorite/favorite.repository";
import {
  countFavoritesByCustomer,
  createFavorite,
  deleteFavoriteByCustomerAndMover,
  findFavoriteByCustomerAndMover,
  findFavoritesByCustomer,
  findMoverId,
} from "../../src/modules/favorite/favorite.repository";
import {
  addFavorite,
  listFavorites,
  removeFavorite,
} from "../../src/modules/favorite/favorite.service";

const customerId = "22222222-2222-4222-8222-222222222222";
const moverId = "11111111-1111-4111-8111-111111111111";

const favoriteRecord: FavoriteRecord = {
  id: "33333333-3333-4333-8333-333333333333",
  moverId,
  createdAt: new Date("2026-09-14T01:00:00.000Z"),
  mover: {
    id: moverId,
    nickname: "김코드",
    profileImageUrl: null,
    careerYears: 5,
    shortIntroduction: "안전하고 빠른 이사",
    serviceTypes: [{ serviceType: { name: "HOME" } }],
    regions: [{ region: { name: "SEOUL" } }],
    reviews: [{ rating: 5 }, { rating: 4 }],
    _count: { favorites: 3 },
  },
};

describe("Favorite service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("존재하는 기사님을 처음 찜하면 Favorite DTO를 반환한다", async () => {
    jest.mocked(findMoverId).mockResolvedValue({ id: moverId });
    jest.mocked(findFavoriteByCustomerAndMover).mockResolvedValue(null);
    jest.mocked(createFavorite).mockResolvedValue(favoriteRecord);

    await expect(addFavorite(customerId, moverId)).resolves.toEqual({
      id: favoriteRecord.id,
      moverId,
      createdAt: "2026-09-14T01:00:00.000Z",
      mover: {
        id: moverId,
        nickname: "김코드",
        profileImageUrl: null,
        careerYears: 5,
        shortIntroduction: "안전하고 빠른 이사",
        serviceTypes: ["HOME"],
        regions: ["SEOUL"],
        reviewCount: 2,
        averageRating: 4.5,
        favoriteCount: 3,
      },
    });
  });

  test("기사님이 없으면 MOVER_NOT_FOUND를 던진다", async () => {
    jest.mocked(findMoverId).mockResolvedValue(null);

    await expect(addFavorite(customerId, moverId)).rejects.toMatchObject({
      name: "AppError",
      code: "MOVER_NOT_FOUND",
    });
    expect(createFavorite).not.toHaveBeenCalled();
  });

  test("이미 찜한 기사님이면 FAVORITE_ALREADY_EXISTS를 던진다", async () => {
    jest.mocked(findMoverId).mockResolvedValue({ id: moverId });
    jest.mocked(findFavoriteByCustomerAndMover).mockResolvedValue({
      id: favoriteRecord.id,
    });

    await expect(addFavorite(customerId, moverId)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(addFavorite(customerId, moverId)).rejects.toMatchObject({
      code: "FAVORITE_ALREADY_EXISTS",
    });
    expect(createFavorite).not.toHaveBeenCalled();
  });

  test("목록은 요청한 고객의 찜만 페이지로 반환한다", async () => {
    jest.mocked(countFavoritesByCustomer).mockResolvedValue(1);
    jest.mocked(findFavoritesByCustomer).mockResolvedValue([favoriteRecord]);

    const result = await listFavorites(customerId, { page: 1, pageSize: 10 });

    expect(findFavoritesByCustomer).toHaveBeenCalledWith(customerId, 0, 10);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
    });
    expect(result.items).toHaveLength(1);
  });

  test("찜이 없으면 FAVORITE_NOT_FOUND를 던진다", async () => {
    jest.mocked(deleteFavoriteByCustomerAndMover).mockResolvedValue({ count: 0 });

    await expect(removeFavorite(customerId, moverId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(removeFavorite(customerId, moverId)).rejects.toMatchObject({
      code: "FAVORITE_NOT_FOUND",
    });
  });

  test("본인 찜이 있으면 삭제한다", async () => {
    jest.mocked(deleteFavoriteByCustomerAndMover).mockResolvedValue({ count: 1 });

    await expect(removeFavorite(customerId, moverId)).resolves.toBeUndefined();
  });
});
