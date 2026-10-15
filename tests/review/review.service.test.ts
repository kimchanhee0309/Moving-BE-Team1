/**
 * Review Service의 작성·목록 규칙과 오류 코드를 검증합니다.
 *
 * 사전 조건: Repository와 Prisma는 mock하고 실제 DB는 사용하지 않는다.
 * 시나리오: 정상 작성, 없는/타인 요청, 미완료, 미확정, 중복, 공개 목록 404, 본인 목록 필터.
 * 기대 결과: DTO 변환과 REQUEST_NOT_FOUND, REVIEW_ALREADY_EXISTS, MOVER_NOT_FOUND.
 */
jest.mock("../../src/modules/review/review.repository", () => ({
  aggregateMoverReviewStats: jest.fn(),
  countWritableMoveRequestsByCustomer: jest.fn(),
  countWrittenReviewsByCustomer: jest.fn(),
  createReviewRecord: jest.fn(),
  findMoveRequestForCreate: jest.fn(),
  findMoverId: jest.fn(),
  findReceivedReviewsByMover: jest.fn(),
  findWritableMoveRequestsByCustomer: jest.fn(),
  findWrittenReviewsByCustomer: jest.fn(),
}));

import { ConflictError, NotFoundError } from "../../src/common/errors/app-error";
import type {
  MoveRequestForCreateRecord,
  ReceivedReviewRecord,
  WritableMoveRequestRecord,
  WrittenReviewRecord,
} from "../../src/modules/review/review.repository";
import {
  aggregateMoverReviewStats,
  countWritableMoveRequestsByCustomer,
  countWrittenReviewsByCustomer,
  createReviewRecord,
  findMoveRequestForCreate,
  findMoverId,
  findReceivedReviewsByMover,
  findWritableMoveRequestsByCustomer,
  findWrittenReviewsByCustomer,
} from "../../src/modules/review/review.repository";
import {
  createReview,
  listCustomerReviews,
  listMoverReviews,
  listMyReceivedReviews,
} from "../../src/modules/review/review.service";

const customerId = "22222222-2222-4222-8222-222222222222";
const otherCustomerId = "66666666-6666-4666-8666-666666666666";
const moverId = "11111111-1111-4111-8111-111111111111";
const moveRequestId = "55555555-5555-4555-8555-555555555555";
const reviewId = "33333333-3333-4333-8333-333333333333";

const createInput = {
  moveRequestId,
  rating: 5,
  content: "친절하고 꼼꼼하게 이사를 진행해 주셔서 만족했습니다.",
};

const writtenRecord: WrittenReviewRecord = {
  id: reviewId,
  moveRequestId,
  moverId,
  rating: 5,
  content: createInput.content,
  createdAt: new Date("2026-09-14T01:00:00.000Z"),
  mover: {
    id: moverId,
    nickname: "김코드",
    profileImageUrl: null,
  },
  moveRequest: {
    id: moveRequestId,
    moveDate: new Date("2026-09-10T00:00:00.000Z"),
    fromAddress: "서울 강남구",
    toAddress: "경기 성남시",
    serviceType: { name: "HOME" },
  },
};

const completedRequest: MoveRequestForCreateRecord = {
  id: moveRequestId,
  customerId,
  status: "COMPLETED",
  review: null,
  quotes: [{ moverId }],
};

const receivedRecord: ReceivedReviewRecord = {
  id: reviewId,
  rating: 5,
  content: createInput.content,
  createdAt: new Date("2026-09-14T01:00:00.000Z"),
  customer: {
    id: customerId,
    profileImageUrl: null,
    user: { name: "홍길동" },
  },
  moveRequest: {
    serviceType: { name: "HOME" },
  },
};

const writableRecord: WritableMoveRequestRecord = {
  id: moveRequestId,
  moveDate: new Date("2026-09-10T00:00:00.000Z"),
  fromAddress: "서울 강남구",
  toAddress: "경기 성남시",
  serviceType: { name: "HOME" },
  quotes: [
    {
      mover: {
        id: moverId,
        nickname: "김코드",
        profileImageUrl: null,
      },
    },
  ],
};

describe("Review service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("완료된 본인 이사에 리뷰를 쓰면 Review DTO를 반환한다", async () => {
    jest.mocked(findMoveRequestForCreate).mockResolvedValue(completedRequest);
    jest.mocked(createReviewRecord).mockResolvedValue(writtenRecord);

    await expect(createReview(customerId, createInput)).resolves.toEqual({
      id: reviewId,
      moveRequestId,
      moverId,
      rating: 5,
      content: createInput.content,
      createdAt: "2026-09-14T01:00:00.000Z",
      mover: {
        id: moverId,
        nickname: "김코드",
        profileImageUrl: null,
      },
      moveRequest: {
        id: moveRequestId,
        serviceType: "HOME",
        moveDate: "2026-09-10T00:00:00.000Z",
        fromAddress: "서울 강남구",
        toAddress: "경기 성남시",
      },
    });
  });

  test("요청이 없으면 REQUEST_NOT_FOUND를 던진다", async () => {
    jest.mocked(findMoveRequestForCreate).mockResolvedValue(null);

    await expect(createReview(customerId, createInput)).rejects.toMatchObject({
      name: "AppError",
      code: "REQUEST_NOT_FOUND",
    });
    expect(createReviewRecord).not.toHaveBeenCalled();
  });

  test("다른 고객의 요청이면 REQUEST_NOT_FOUND를 던진다", async () => {
    jest.mocked(findMoveRequestForCreate).mockResolvedValue({
      ...completedRequest,
      customerId: otherCustomerId,
    });

    await expect(createReview(customerId, createInput)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(createReview(customerId, createInput)).rejects.toMatchObject({
      code: "REQUEST_NOT_FOUND",
    });
  });

  test("완료되지 않은 이사이면 MOVE_REQUEST_NOT_COMPLETED를 던진다", async () => {
    jest.mocked(findMoveRequestForCreate).mockResolvedValue({
      ...completedRequest,
      status: "CONFIRMED",
    });

    await expect(createReview(customerId, createInput)).rejects.toMatchObject({
      code: "MOVE_REQUEST_NOT_COMPLETED",
    });
  });

  test("확정 견적이 없으면 QUOTE_NOT_CONFIRMED를 던진다", async () => {
    jest.mocked(findMoveRequestForCreate).mockResolvedValue({
      ...completedRequest,
      quotes: [],
    });

    await expect(createReview(customerId, createInput)).rejects.toMatchObject({
      code: "QUOTE_NOT_CONFIRMED",
    });
  });

  test("이미 리뷰가 있으면 REVIEW_ALREADY_EXISTS를 던진다", async () => {
    jest.mocked(findMoveRequestForCreate).mockResolvedValue({
      ...completedRequest,
      review: { id: reviewId },
    });

    await expect(createReview(customerId, createInput)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(createReview(customerId, createInput)).rejects.toMatchObject({
      code: "REVIEW_ALREADY_EXISTS",
    });
    expect(createReviewRecord).not.toHaveBeenCalled();
  });

  test("동시 작성으로 P2002가 나면 REVIEW_ALREADY_EXISTS로 변환한다", async () => {
    jest.mocked(findMoveRequestForCreate).mockResolvedValue(completedRequest);
    jest.mocked(createReviewRecord).mockRejectedValue({ code: "P2002" });

    await expect(createReview(customerId, createInput)).rejects.toMatchObject({
      code: "REVIEW_ALREADY_EXISTS",
    });
  });

  test("생성 중 요청이 삭제되면 P2003을 REQUEST_NOT_FOUND로 변환한다", async () => {
    jest
      .mocked(findMoveRequestForCreate)
      .mockResolvedValueOnce(completedRequest)
      .mockResolvedValueOnce(null);
    jest.mocked(createReviewRecord).mockRejectedValue({ code: "P2003" });

    await expect(createReview(customerId, createInput)).rejects.toMatchObject({
      code: "REQUEST_NOT_FOUND",
    });
  });

  test("작성한 리뷰 목록은 요청한 고객의 리뷰만 페이지로 반환한다", async () => {
    jest.mocked(countWrittenReviewsByCustomer).mockResolvedValue(1);
    jest.mocked(findWrittenReviewsByCustomer).mockResolvedValue([writtenRecord]);

    const result = await listCustomerReviews(customerId, {
      type: "WRITTEN",
      page: 1,
      pageSize: 10,
    });

    expect(findWrittenReviewsByCustomer).toHaveBeenCalledWith(customerId, 0, 10);
    expect(result).toMatchObject({
      type: "WRITTEN",
      pagination: {
        page: 1,
        pageSize: 10,
        totalCount: 1,
        totalPages: 1,
      },
    });
    expect(result.items).toHaveLength(1);
  });

  test("작성 가능 목록은 확정 기사님 카드를 포함한다", async () => {
    jest.mocked(countWritableMoveRequestsByCustomer).mockResolvedValue(1);
    jest
      .mocked(findWritableMoveRequestsByCustomer)
      .mockResolvedValue([writableRecord]);

    const result = await listCustomerReviews(customerId, {
      type: "WRITABLE",
      page: 1,
      pageSize: 10,
    });

    expect(result.type).toBe("WRITABLE");
    expect(result.items).toEqual([
      {
        mover: {
          id: moverId,
          nickname: "김코드",
          profileImageUrl: null,
        },
        moveRequest: {
          id: moveRequestId,
          serviceType: "HOME",
          moveDate: "2026-09-10T00:00:00.000Z",
          fromAddress: "서울 강남구",
          toAddress: "경기 성남시",
        },
      },
    ]);
  });

  test("작성 가능 목록에 확정 견적이 없으면 QUOTE_NOT_CONFIRMED를 던진다", async () => {
    jest.mocked(countWritableMoveRequestsByCustomer).mockResolvedValue(1);
    jest.mocked(findWritableMoveRequestsByCustomer).mockResolvedValue([
      {
        ...writableRecord,
        quotes: [],
      },
    ]);

    await expect(
      listCustomerReviews(customerId, {
        type: "WRITABLE",
        page: 1,
        pageSize: 10,
      }),
    ).rejects.toMatchObject({
      code: "QUOTE_NOT_CONFIRMED",
    });
  });

  test("리뷰 작성은 조회된 확정 견적의 기사님에게 연결한다", async () => {
    jest.mocked(findMoveRequestForCreate).mockResolvedValue({
      ...completedRequest,
      quotes: [{ moverId }, { moverId: otherCustomerId }],
    });
    jest.mocked(createReviewRecord).mockResolvedValue(writtenRecord);

    await createReview(customerId, createInput);

    expect(createReviewRecord).toHaveBeenCalledWith({
      customerId,
      moveRequestId,
      moverId,
      rating: 5,
      content: createInput.content,
    });
  });

  test("기사님이 없으면 공개 리뷰 목록이 MOVER_NOT_FOUND를 던진다", async () => {
    jest.mocked(findMoverId).mockResolvedValue(null);

    await expect(
      listMoverReviews(moverId, { page: 1, pageSize: 10 }),
    ).rejects.toMatchObject({
      code: "MOVER_NOT_FOUND",
    });
    expect(findReceivedReviewsByMover).not.toHaveBeenCalled();
  });

  test("받은 리뷰 목록은 평점을 소수점 첫째 자리로 반올림한다", async () => {
    jest.mocked(findMoverId).mockResolvedValue({ id: moverId });
    jest.mocked(aggregateMoverReviewStats).mockResolvedValue({
      reviewCount: 3,
      averageRating: 4.66,
    });
    jest.mocked(findReceivedReviewsByMover).mockResolvedValue([receivedRecord]);

    const result = await listMoverReviews(moverId, { page: 1, pageSize: 10 });

    expect(findReceivedReviewsByMover).toHaveBeenCalledWith(moverId, 0, 10);
    expect(result.summary).toEqual({
      reviewCount: 3,
      averageRating: 4.7,
    });
    expect(result.items[0]).toEqual({
      id: reviewId,
      rating: 5,
      content: createInput.content,
      createdAt: "2026-09-14T01:00:00.000Z",
      serviceType: "HOME",
      customer: {
        id: customerId,
        name: "홍길동",
        profileImageUrl: null,
      },
    });
  });

  test("내 받은 리뷰는 클라이언트가 보낸 moverId가 아니라 profileId로 조회한다", async () => {
    jest.mocked(aggregateMoverReviewStats).mockResolvedValue({
      reviewCount: 0,
      averageRating: null,
    });
    jest.mocked(findReceivedReviewsByMover).mockResolvedValue([]);

    const result = await listMyReceivedReviews(moverId, {
      page: 1,
      pageSize: 10,
    });

    expect(findMoverId).not.toHaveBeenCalled();
    expect(findReceivedReviewsByMover).toHaveBeenCalledWith(moverId, 0, 10);
    expect(result.summary.averageRating).toBeNull();
    expect(result.pagination.totalPages).toBe(0);
  });
});
