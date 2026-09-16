/**
 * Review의 소유권·완료 상태·확정 기사님·중복 규칙을 검증한 뒤 Repository에 영속을 위임합니다.
 * Express 객체에 의존하지 않으며 customerId/moverId는 profiled guard가 확인한 profile ID만 받습니다.
 *
 * 처리 흐름: 입력 수신 → 요청/기사님/상태 검사 → DB 처리 → 응답 DTO 변환
 */

import { ConflictError, NotFoundError } from "../../common/errors/app-error";
import { MoveRequestStatus } from "../../generated/prisma/enums";
import type {
  CreateReviewInput,
  CustomerReviewListDto,
  ListCustomerReviewsQuery,
  ListReviewsQuery,
  ReceivedReviewDto,
  ReceivedReviewListDto,
  ReviewDto,
  ReviewMoveRequestDto,
  ReviewMoverCardDto,
  ReviewPaginationDto,
  WritableReviewDto,
} from "./review.dto";
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
  type ReceivedReviewRecord,
  type WritableMoveRequestRecord,
  type WrittenReviewRecord,
} from "./review.repository";

/** 전역 error handler와 같이 Prisma 원문 클래스에 의존하지 않고 제약 오류만 식별합니다. */
function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

/** DB에서 받은 평점 평균을 소수점 첫째 자리로 반올림합니다. 리뷰가 없으면 null입니다. */
function toAverageRating(
  averageRating: number | null,
  reviewCount: number,
): number | null {
  if (reviewCount === 0 || averageRating === null) {
    return null;
  }

  return Math.round(averageRating * 10) / 10;
}

function toPagination(
  page: number,
  pageSize: number,
  totalCount: number,
): ReviewPaginationDto {
  return {
    page,
    pageSize,
    totalCount,
    totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize),
  };
}

function toMoverCard(mover: ReviewMoverCardDto): ReviewMoverCardDto {
  return {
    id: mover.id,
    nickname: mover.nickname,
    profileImageUrl: mover.profileImageUrl,
  };
}

function toMoveRequestCard(record: {
  id: string;
  moveDate: Date;
  fromAddress: string;
  toAddress: string;
  serviceType: { name: string };
}): ReviewMoveRequestDto {
  return {
    id: record.id,
    serviceType: record.serviceType.name,
    moveDate: record.moveDate.toISOString(),
    fromAddress: record.fromAddress,
    toAddress: record.toAddress,
  };
}

function toReviewDto(record: WrittenReviewRecord): ReviewDto {
  return {
    id: record.id,
    moveRequestId: record.moveRequestId,
    moverId: record.moverId,
    rating: record.rating,
    content: record.content,
    createdAt: record.createdAt.toISOString(),
    mover: toMoverCard(record.mover),
    moveRequest: toMoveRequestCard(record.moveRequest),
  };
}

function toWritableReviewDto(
  record: WritableMoveRequestRecord,
): WritableReviewDto {
  const confirmedQuote = record.quotes[0];

  // where.quotes.some(CONFIRMED)인데 관계가 비면 조회 조건이 깨진 것입니다.
  // 여기서 건너뛰면 pagination.totalCount와 items 길이가 어긋납니다.
  if (confirmedQuote === undefined) {
    throw new ConflictError(
      "확정된 기사님이 있는 이사에만 리뷰를 작성할 수 있습니다.",
      "QUOTE_NOT_CONFIRMED",
    );
  }

  return {
    mover: toMoverCard(confirmedQuote.mover),
    moveRequest: toMoveRequestCard(record),
  };
}

function toReceivedReviewDto(record: ReceivedReviewRecord): ReceivedReviewDto {
  return {
    id: record.id,
    rating: record.rating,
    content: record.content,
    createdAt: record.createdAt.toISOString(),
    serviceType: record.moveRequest.serviceType.name,
    customer: {
      id: record.customer.id,
      name: record.customer.user.name,
      profileImageUrl: record.customer.profileImageUrl,
    },
  };
}

/**
 * 완료된 본인 이사에 리뷰를 작성합니다.
 * 요청이 없거나 다른 고객 것이면 존재를 숨기기 위해 같은 404를 사용합니다.
 *
 * @param customerId requireProfile이 확인한 Customer.id
 * @param input 검증된 moveRequestId·rating·content
 * @returns 생성된 리뷰와 기사님·요청 카드
 * @throws NotFoundError REQUEST_NOT_FOUND — 요청이 없거나 본인 요청이 아닌 경우
 * @throws ConflictError MOVE_REQUEST_NOT_COMPLETED — 이사가 완료되지 않은 경우
 * @throws ConflictError QUOTE_NOT_CONFIRMED — 확정된 기사님이 없는 경우
 * @throws ConflictError REVIEW_ALREADY_EXISTS — 같은 요청에 이미 리뷰가 있는 경우
 * @sideEffects Review 행을 추가합니다.
 */
export async function createReview(
  customerId: string,
  input: CreateReviewInput,
): Promise<ReviewDto> {
  const moveRequest = await findMoveRequestForCreate(input.moveRequestId);

  if (!moveRequest || moveRequest.customerId !== customerId) {
    throw new NotFoundError("이사 요청을 찾을 수 없습니다.", "REQUEST_NOT_FOUND");
  }

  if (moveRequest.status !== MoveRequestStatus.COMPLETED) {
    throw new ConflictError(
      "완료된 이사에만 리뷰를 작성할 수 있습니다.",
      "MOVE_REQUEST_NOT_COMPLETED",
    );
  }

  const confirmedQuote = moveRequest.quotes[0];

  if (!confirmedQuote) {
    throw new ConflictError(
      "확정된 기사님이 있는 이사에만 리뷰를 작성할 수 있습니다.",
      "QUOTE_NOT_CONFIRMED",
    );
  }

  if (moveRequest.review) {
    throw new ConflictError(
      "이미 리뷰를 작성한 이사입니다.",
      "REVIEW_ALREADY_EXISTS",
    );
  }

  try {
    const created = await createReviewRecord({
      customerId,
      moveRequestId: input.moveRequestId,
      moverId: confirmedQuote.moverId,
      rating: input.rating,
      content: input.content,
    });

    return toReviewDto(created);
  } catch (error: unknown) {
    // 동시에 같은 요청에 리뷰를 쓰면 사전 조회와 생성 사이에 unique 충돌이 납니다.
    if (hasPrismaErrorCode(error, "P2002")) {
      throw new ConflictError(
        "이미 리뷰를 작성한 이사입니다.",
        "REVIEW_ALREADY_EXISTS",
      );
    }

    // Review FK는 onDelete: Cascade라서, 조회 이후 요청이나 기사님이 삭제되면 create가 P2003을 냅니다.
    if (hasPrismaErrorCode(error, "P2003")) {
      const currentRequest = await findMoveRequestForCreate(input.moveRequestId);

      if (!currentRequest) {
        throw new NotFoundError("이사 요청을 찾을 수 없습니다.", "REQUEST_NOT_FOUND");
      }

      const currentMover = await findMoverId(confirmedQuote.moverId);

      if (!currentMover) {
        throw new NotFoundError("기사님을 찾을 수 없습니다.", "MOVER_NOT_FOUND");
      }
    }

    throw error;
  }
}

/**
 * 인증 고객의 작성 가능·작성 완료 리뷰를 페이지 조회합니다.
 * 다른 고객 데이터는 where.customerId로 제외합니다.
 *
 * @param customerId requireProfile이 확인한 Customer.id
 * @param query 검증된 type·page·pageSize
 * @returns type에 맞는 items와 page 기반 pagination
 */
export async function listCustomerReviews(
  customerId: string,
  query: ListCustomerReviewsQuery,
): Promise<CustomerReviewListDto> {
  const skip = (query.page - 1) * query.pageSize;

  if (query.type === "WRITTEN") {
    const [totalCount, records] = await Promise.all([
      countWrittenReviewsByCustomer(customerId),
      findWrittenReviewsByCustomer(customerId, skip, query.pageSize),
    ]);

    return {
      type: "WRITTEN",
      items: records.map(toReviewDto),
      pagination: toPagination(query.page, query.pageSize, totalCount),
    };
  }

  const [totalCount, records] = await Promise.all([
    countWritableMoveRequestsByCustomer(customerId),
    findWritableMoveRequestsByCustomer(customerId, skip, query.pageSize),
  ]);

  return {
    type: "WRITABLE",
    items: records.map(toWritableReviewDto),
    pagination: toPagination(query.page, query.pageSize, totalCount),
  };
}

async function listReceivedReviews(
  moverId: string,
  query: ListReviewsQuery,
): Promise<ReceivedReviewListDto> {
  const skip = (query.page - 1) * query.pageSize;
  const [stats, records] = await Promise.all([
    aggregateMoverReviewStats(moverId),
    findReceivedReviewsByMover(moverId, skip, query.pageSize),
  ]);

  return {
    items: records.map(toReceivedReviewDto),
    pagination: toPagination(query.page, query.pageSize, stats.reviewCount),
    summary: toReviewSummary(stats.reviewCount, stats.averageRating),
  };
}

/**
 * 특정 기사님이 받은 리뷰를 최신순으로 조회합니다.
 * 기사님 상세 화면용이라 로그인 없이 호출할 수 있습니다.
 *
 * @param moverId 경로의 Mover.id
 * @param query 검증된 page·pageSize
 * @returns items와 평점 집계
 * @throws NotFoundError MOVER_NOT_FOUND — 기사님 프로필이 없는 경우
 */
export async function listMoverReviews(
  moverId: string,
  query: ListReviewsQuery,
): Promise<ReceivedReviewListDto> {
  const mover = await findMoverId(moverId);

  if (!mover) {
    throw new NotFoundError("기사님을 찾을 수 없습니다.", "MOVER_NOT_FOUND");
  }

  return listReceivedReviews(moverId, query);
}

/**
 * 로그인한 기사님이 받은 리뷰를 조회합니다.
 * moverId는 클라이언트가 보낸 값이 아니라 profiled guard의 profileId입니다.
 *
 * @param moverId requireProfile이 확인한 Mover.id
 * @param query 검증된 page·pageSize
 * @returns items와 평점 집계
 */
export async function listMyReceivedReviews(
  moverId: string,
  query: ListReviewsQuery,
): Promise<ReceivedReviewListDto> {
  return listReceivedReviews(moverId, query);
}

function toReviewSummary(
  reviewCount: number,
  averageRating: number | null,
): { reviewCount: number; averageRating: number | null } {
  return {
    reviewCount,
    averageRating: toAverageRating(averageRating, reviewCount),
  };
}
