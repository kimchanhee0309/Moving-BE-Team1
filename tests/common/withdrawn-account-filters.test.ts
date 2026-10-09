/**
 * 탈퇴(soft delete)한 계정의 row가 남아 있어도 인증·찜·리뷰·기사님 찾기 조회에서 제외되는지 검증합니다.
 * 실제 DB 없이 Prisma client 호출 조건만 확인합니다.
 */
const mockUserFindFirst = jest.fn();
const mockMoverFindFirst = jest.fn();
const mockMoverFindMany = jest.fn();
const mockFavoriteFindMany = jest.fn();
const mockFavoriteCount = jest.fn();

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: { findFirst: (...args: unknown[]) => mockUserFindFirst(...args) },
    mover: {
      findFirst: (...args: unknown[]) => mockMoverFindFirst(...args),
      findMany: (...args: unknown[]) => mockMoverFindMany(...args),
    },
    favorite: {
      findMany: (...args: unknown[]) => mockFavoriteFindMany(...args),
      count: (...args: unknown[]) => mockFavoriteCount(...args),
    },
  },
}));

import { findUserProfileState } from "../../src/common/utils/user-profile";
import { findUserById } from "../../src/modules/auth/auth.repository";
import {
  countFavoritesByCustomer,
  findFavoritesByCustomer,
  findMoverId as findFavoriteMoverId,
} from "../../src/modules/favorite/favorite.repository";
import { findMoverSearchCardById } from "../../src/modules/mover-search/mover-search.repository";
import { findMoverId as findReviewMoverId } from "../../src/modules/review/review.repository";

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const MOVER_ID = "550e8400-e29b-41d4-a716-446655440002";
const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440003";
const ACTIVE_MOVER = { id: MOVER_ID, user: { deletedAt: null } };

describe("Withdrawn account filters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("토큰 사용자 조회와 profile guard는 탈퇴하지 않은 계정만 찾는다", async () => {
    mockUserFindFirst.mockResolvedValue(null);

    // 기대 결과: 탈퇴 전에 발급된 토큰은 USER_NOT_FOUND·REFRESH_TOKEN_INVALID로 이어집니다.
    await expect(findUserById(USER_ID)).resolves.toBeNull();
    await expect(findUserProfileState(USER_ID)).resolves.toBeNull();

    expect(mockUserFindFirst).toHaveBeenCalledTimes(2);
    for (const [argument] of mockUserFindFirst.mock.calls) {
      expect(argument).toEqual(
        expect.objectContaining({ where: { id: USER_ID, deletedAt: null } }),
      );
    }
  });

  test("찜 추가와 리뷰 목록의 기사님 확인은 탈퇴한 기사님을 없는 기사님으로 취급한다", async () => {
    mockMoverFindFirst.mockResolvedValue(null);

    await expect(findFavoriteMoverId(MOVER_ID)).resolves.toBeNull();
    await expect(findReviewMoverId(MOVER_ID)).resolves.toBeNull();

    expect(mockMoverFindFirst).toHaveBeenCalledTimes(2);
    for (const [argument] of mockMoverFindFirst.mock.calls) {
      expect(argument).toEqual({ where: ACTIVE_MOVER, select: { id: true } });
    }
  });

  test("찜 목록과 전체 건수는 같은 조건으로 탈퇴한 기사님을 제외한다", async () => {
    mockFavoriteFindMany.mockResolvedValue([]);
    mockFavoriteCount.mockResolvedValue(0);
    const where = { customerId: CUSTOMER_ID, mover: { user: { deletedAt: null } } };

    await findFavoritesByCustomer(CUSTOMER_ID, 0, 10);
    await countFavoritesByCustomer(CUSTOMER_ID);

    expect(mockFavoriteFindMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(mockFavoriteCount).toHaveBeenCalledWith({ where });
  });

  test("기사님 상세 카드 조회는 탈퇴한 기사님을 찾지 못해 Service가 404로 처리한다", async () => {
    mockMoverFindMany.mockResolvedValue([]);

    await expect(findMoverSearchCardById(MOVER_ID)).resolves.toBeNull();

    expect(mockMoverFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [MOVER_ID] }, user: { deletedAt: null } },
      }),
    );
  });
});
