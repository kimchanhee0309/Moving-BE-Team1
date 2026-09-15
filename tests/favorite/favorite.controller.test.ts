/**
 * Favorite Controller가 공통 응답 key와 상태 코드를 지키는지 검증합니다.
 *
 * 사전 조건: Validator와 Service는 mock하고 request.auth.profileId를 직접 넣는다.
 * 시나리오: 등록 201 data.favorite, 목록 200 data.items, 해제 204 Body 없음.
 * 기대 결과: sendSuccess/sendNoContent 계약과 일치한다.
 */
jest.mock("../../src/modules/favorite/favorite.validator", () => ({
  parseListFavoritesQuery: jest.fn(),
  parseMoverIdParam: jest.fn(),
}));

jest.mock("../../src/modules/favorite/favorite.service", () => ({
  addFavorite: jest.fn(),
  listFavorites: jest.fn(),
  removeFavorite: jest.fn(),
}));

import type { Request, Response } from "express";

import {
  addFavoriteController,
  listFavoritesController,
  removeFavoriteController,
} from "../../src/modules/favorite/favorite.controller";
import { addFavorite, listFavorites, removeFavorite } from "../../src/modules/favorite/favorite.service";
import {
  parseListFavoritesQuery,
  parseMoverIdParam,
} from "../../src/modules/favorite/favorite.validator";

const favorite = {
  id: "33333333-3333-4333-8333-333333333333",
  moverId: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-09-14T01:00:00.000Z",
  mover: {
    id: "11111111-1111-4111-8111-111111111111",
    nickname: "김코드",
    profileImageUrl: null,
    careerYears: 5,
    shortIntroduction: "안전하고 빠른 이사",
    serviceTypes: ["HOME"],
    regions: ["SEOUL"],
    reviewCount: 0,
    averageRating: null,
    favoriteCount: 1,
  },
};

function createRequest(): Request {
  return {
    auth: {
      userId: "user-id",
      role: "CUSTOMER",
      profileId: "customer-id",
    },
    params: {},
    query: {},
  } as Request;
}

function createResponse(): Response {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
  } as unknown as Response;

  jest.mocked(response.status).mockReturnValue(response);
  return response;
}

describe("Favorite controller response contract", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("찜 등록 성공 시 201과 data.favorite를 반환한다", async () => {
    jest.mocked(parseMoverIdParam).mockReturnValue({ moverId: favorite.moverId });
    jest.mocked(addFavorite).mockResolvedValue(favorite);

    const response = createResponse();
    await addFavoriteController(createRequest(), response, jest.fn());

    expect(addFavorite).toHaveBeenCalledWith("customer-id", favorite.moverId);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { favorite },
    });
  });

  test("찜 목록 성공 시 200과 data.items를 반환한다", async () => {
    const list = {
      items: [favorite],
      pagination: {
        page: 1,
        pageSize: 10,
        totalCount: 1,
        totalPages: 1,
      },
    };

    jest.mocked(parseListFavoritesQuery).mockReturnValue({ page: 1, pageSize: 10 });
    jest.mocked(listFavorites).mockResolvedValue(list);

    const response = createResponse();
    await listFavoritesController(createRequest(), response, jest.fn());

    expect(listFavorites).toHaveBeenCalledWith("customer-id", {
      page: 1,
      pageSize: 10,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: list,
    });
  });

  test("찜 해제 성공 시 204와 Body 없음을 반환한다", async () => {
    jest.mocked(parseMoverIdParam).mockReturnValue({ moverId: favorite.moverId });
    jest.mocked(removeFavorite).mockResolvedValue(undefined);

    const response = createResponse();
    await removeFavoriteController(createRequest(), response, jest.fn());

    expect(removeFavorite).toHaveBeenCalledWith("customer-id", favorite.moverId);
    expect(response.status).toHaveBeenCalledWith(204);
    expect(response.send).toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
