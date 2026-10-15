/**
 * Review Controller가 공통 응답 key와 상태 코드를 지키는지 검증합니다.
 *
 * 사전 조건: Validator와 Service는 mock하고, HTTP 객체는 Express Request/Response helper로 만든다.
 * 시나리오: 작성 201 data.review, 고객 목록 200 data.items, 공개/내 받은 리뷰 200 summary.
 * 기대 결과: sendSuccess 계약과 일치한다.
 */
jest.mock("../../src/modules/review/review.validator", () => ({
  parseCreateReviewInput: jest.fn(),
  parseListCustomerReviewsQuery: jest.fn(),
  parseListReviewsQuery: jest.fn(),
  parseMoverIdParam: jest.fn(),
}));

jest.mock("../../src/modules/review/review.service", () => ({
  createReview: jest.fn(),
  listCustomerReviews: jest.fn(),
  listMoverReviews: jest.fn(),
  listMyReceivedReviews: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import {
  createReviewController,
  listCustomerReviewsController,
  listMoverReviewsController,
  listMyReceivedReviewsController,
} from "../../src/modules/review/review.controller";
import {
  createReview,
  listCustomerReviews,
  listMoverReviews,
  listMyReceivedReviews,
} from "../../src/modules/review/review.service";
import {
  parseCreateReviewInput,
  parseListCustomerReviewsQuery,
  parseListReviewsQuery,
  parseMoverIdParam,
} from "../../src/modules/review/review.validator";

const review = {
  id: "33333333-3333-4333-8333-333333333333",
  moveRequestId: "55555555-5555-4555-8555-555555555555",
  moverId: "11111111-1111-4111-8111-111111111111",
  rating: 5,
  content: "친절하고 꼼꼼하게 이사를 진행해 주셔서 만족했습니다.",
  createdAt: "2026-09-14T01:00:00.000Z",
  mover: {
    id: "11111111-1111-4111-8111-111111111111",
    nickname: "김코드",
    profileImageUrl: null,
  },
  moveRequest: {
    id: "55555555-5555-4555-8555-555555555555",
    serviceType: "HOME",
    moveDate: "2026-09-10T00:00:00.000Z",
    fromAddress: "서울 강남구",
    toAddress: "경기 성남시",
  },
};

function createResponse(): Response {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  jest.mocked(response.status).mockReturnValue(response);
  return response;
}

function createCustomerRequest(): Request {
  return {
    auth: {
      userId: "user-id",
      role: "CUSTOMER",
      profileId: "customer-id",
    },
    body: {},
    params: {},
    query: {},
  } as Request;
}

describe("Review controller response contract", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("리뷰 작성 성공 시 201과 data.review를 반환한다", async () => {
    jest.mocked(parseCreateReviewInput).mockReturnValue({
      moveRequestId: review.moveRequestId,
      rating: 5,
      content: review.content,
    });
    jest.mocked(createReview).mockResolvedValue(review);

    const response = createResponse();
    await createReviewController(
      createCustomerRequest(),
      response,
      jest.fn() as NextFunction,
    );

    expect(createReview).toHaveBeenCalledWith("customer-id", {
      moveRequestId: review.moveRequestId,
      rating: 5,
      content: review.content,
    });
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { review },
    });
  });

  test("고객 리뷰 목록 성공 시 200과 data.items를 반환한다", async () => {
    const list = {
      type: "WRITTEN" as const,
      items: [review],
      pagination: {
        page: 1,
        pageSize: 10,
        totalCount: 1,
        totalPages: 1,
      },
    };

    jest.mocked(parseListCustomerReviewsQuery).mockReturnValue({
      type: "WRITTEN",
      page: 1,
      pageSize: 10,
    });
    jest.mocked(listCustomerReviews).mockResolvedValue(list);

    const response = createResponse();
    await listCustomerReviewsController(
      createCustomerRequest(),
      response,
      jest.fn() as NextFunction,
    );

    expect(listCustomerReviews).toHaveBeenCalledWith("customer-id", {
      type: "WRITTEN",
      page: 1,
      pageSize: 10,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: list,
    });
  });

  test("내 받은 리뷰는 profileId로 조회하고 200을 반환한다", async () => {
    const list = {
      items: [],
      pagination: {
        page: 1,
        pageSize: 10,
        totalCount: 0,
        totalPages: 0,
      },
      summary: {
        reviewCount: 0,
        averageRating: null,
      },
    };

    jest.mocked(parseListReviewsQuery).mockReturnValue({ page: 1, pageSize: 10 });
    jest.mocked(listMyReceivedReviews).mockResolvedValue(list);

    const request = {
      auth: {
        userId: "mover-user-id",
        role: "MOVER",
        profileId: "mover-id",
      },
      query: {},
    } as Request;
    const response = createResponse();
    await listMyReceivedReviewsController(
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(listMyReceivedReviews).toHaveBeenCalledWith("mover-id", {
      page: 1,
      pageSize: 10,
    });
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: list,
    });
  });

  test("공개 기사님 리뷰는 인증 컨텍스트 없이 moverId로 조회한다", async () => {
    const list = {
      items: [],
      pagination: {
        page: 1,
        pageSize: 10,
        totalCount: 0,
        totalPages: 0,
      },
      summary: {
        reviewCount: 0,
        averageRating: null,
      },
    };

    jest.mocked(parseMoverIdParam).mockReturnValue({ moverId: review.moverId });
    jest.mocked(parseListReviewsQuery).mockReturnValue({ page: 1, pageSize: 10 });
    jest.mocked(listMoverReviews).mockResolvedValue(list);

    const response = createResponse();
    await listMoverReviewsController(
      { params: { moverId: review.moverId }, query: {} } as unknown as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(listMoverReviews).toHaveBeenCalledWith(review.moverId, {
      page: 1,
      pageSize: 10,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: list,
    });
  });
});
