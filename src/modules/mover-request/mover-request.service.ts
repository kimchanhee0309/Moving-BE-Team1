/**
 * 기사님의 받은 요청 목록, 견적 전송 및 요청 반려 규칙을 처리합니다.
 * 요청 처리 가능 여부, 중복 처리, 견적 인원 제한과 transaction을 관리합니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import { ConflictError, NotFoundError } from "../../common/errors/app-error";
import { prisma } from "../../lib/prisma";
import type {
  CreatedQuoteDto,
  CreatedRequestRejectionDto,
  GetReceivedRequestsQuery,
  ReceivedRequestItemDto,
  ReceivedRequestListDto,
  RejectReceivedRequestInput,
  SendQuoteInput,
} from "./mover-request.dto";
import {
  createNewQuoteNotification,
  createQuote,
  createRequestRejection,
  findReceivedRequestForAction,
  findReceivedRequests,
  type ReceivedRequestActionRecord,
  type ReceivedRequestRecord,
} from "./mover-request.repository";

/** 한 요청에 허용되는 일반 견적 최대 개수입니다. */
const MAX_GENERAL_QUOTE_COUNT = 5;

/** 한 요청에 허용되는 지정 견적 최대 개수입니다. */
const MAX_DESIGNATED_QUOTE_COUNT = 3;

/** 한 요청에 허용되는 전체 견적 최대 개수입니다. */
const MAX_TOTAL_QUOTE_COUNT = 8;

/** Serializable transaction 충돌 시 최대 실행 횟수입니다. */
const MAX_TRANSACTION_ATTEMPTS = 3;

/**
 * Prisma 오류 객체의 code를 확인합니다.
 *
 * @param error 확인할 외부 오류
 * @param code 비교할 Prisma 오류 코드
 * @returns 동일한 Prisma 오류 코드인지 여부
 */
function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

/**
 * 동일 기사·요청 조합의 중복 생성 또는 transaction 충돌인지 확인합니다.
 *
 * P2002는 Quote 또는 RequestRejection unique 제약 충돌이고,
 * P2034는 Serializable transaction의 write conflict입니다.
 */
function isPrismaActionConflict(error: unknown): boolean {
  return (
    hasPrismaErrorCode(error, "P2002") || hasPrismaErrorCode(error, "P2034")
  );
}

/**
 * Serializable transaction을 실행하고 동시성 충돌 시 제한된 횟수만 재시도합니다.
 *
 * 서로 다른 기사들이 동시에 마지막 견적 자리를 차지하려는 경우,
 * 재시도한 transaction이 최신 견적 수를 다시 읽어 제한을 검증하게 합니다.
 *
 * @param operation transaction 안에서 실행할 작업
 * @returns transaction 작업 결과
 * @throws 마지막 실행까지 실패한 Prisma 오류
 * @sideeffect PostgreSQL Serializable transaction을 실행합니다.
 */
async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error: unknown) {
      const canRetry =
        hasPrismaErrorCode(error, "P2034") &&
        attempt < MAX_TRANSACTION_ATTEMPTS;

      if (canRetry) {
        continue;
      }

      throw error;
    }
  }

  // 반복문의 모든 경로에서 반환 또는 throw되므로 실제로 도달하지 않습니다.
  throw new Error("Serializable transaction 실행 결과를 확인할 수 없습니다.");
}

/**
 * Repository의 요청 레코드를 카드 DTO로 변환합니다.
 */
function toReceivedRequestItemDto(
  record: ReceivedRequestRecord,
): ReceivedRequestItemDto {
  return {
    requestId: record.id,
    customerName: record.customer.user.name,
    serviceType: record.serviceType.name,
    isDesignated: record.designatedRequests.length > 0,
    moveDate: record.moveDate.toISOString(),
    fromAddress: record.fromAddress,
    toAddress: record.toAddress,
    requestedAt: record.createdAt.toISOString(),
  };
}

/**
 * 현재 기사가 요청을 조회하고 처리할 기본 자격이 있는지 확인합니다.
 *
 * 다른 기사에게 지정된 요청이 존재하더라도 현재 기사의 처리를 차단하지 않습니다.
 * 현재 기사에게 지정된 요청인지는 견적 제한 계산에서 별도로 사용합니다.
 *
 * @param record 처리 대상 요청
 * @param moverId 인증된 기사 프로필 UUID
 * @param now 현재 시각
 * @throws NotFoundError 요청이 없거나 서비스 유형이 맞지 않는 경우
 * @throws ConflictError 요청이 마감됐거나 현재 기사가 이미 처리한 경우
 */
function assertRequestCanBeHandled(
  record: ReceivedRequestActionRecord | null,
  moverId: string,
  now: Date,
): asserts record is ReceivedRequestActionRecord {
  if (!record || record.serviceType.moverServiceTypes.length === 0) {
    throw new NotFoundError(
      "처리할 수 있는 받은 요청을 찾을 수 없습니다.",
      "REQUEST_NOT_FOUND",
    );
  }

  if (record.status !== "WAITING" || record.moveDate < now) {
    throw new ConflictError(
      "현재 처리할 수 없는 요청입니다.",
      "REQUEST_NOT_AVAILABLE",
    );
  }

  const hasExistingQuote = record.quotes.some(
    (quote) => quote.moverId === moverId,
  );

  const hasExistingRejection = record.requestRejections.length > 0;

  if (hasExistingQuote || hasExistingRejection) {
    throw new ConflictError(
      "이미 견적을 보내거나 반려한 요청입니다.",
      "REQUEST_ALREADY_HANDLED",
    );
  }
}

/**
 * 현재 요청의 일반·지정·전체 견적 수를 계산하고 새 견적 자리를 확인합니다.
 *
 * 지정 여부는 해당 MoveRequest에 현재 moverId의 DesignatedRequest가
 * 존재하는지를 기준으로 합니다. 다른 기사에게 지정됐다는 사실은 현재 기사를
 * 지정 기사로 만들거나 일반 기사 처리를 막지 않습니다.
 *
 * @param record 처리 대상 요청과 기존 견적·지정 정보
 * @param moverId 견적을 보내는 기사 프로필 UUID
 * @throws ConflictError 일반 5개·지정 3개·전체 8개 중 하나를 초과한 경우
 */
function assertQuoteCapacity(
  record: ReceivedRequestActionRecord,
  moverId: string,
): void {
  const designatedMoverIds = new Set(
    record.designatedRequests.map(
      (designatedRequest) => designatedRequest.moverId,
    ),
  );

  const isCurrentMoverDesignated = designatedMoverIds.has(moverId);

  const designatedQuoteCount = record.quotes.filter((quote) =>
    designatedMoverIds.has(quote.moverId),
  ).length;

  const totalQuoteCount = record.quotes.length;
  const generalQuoteCount = totalQuoteCount - designatedQuoteCount;

  const isTotalLimitReached = totalQuoteCount >= MAX_TOTAL_QUOTE_COUNT;

  const isTypeLimitReached = isCurrentMoverDesignated
    ? designatedQuoteCount >= MAX_DESIGNATED_QUOTE_COUNT
    : generalQuoteCount >= MAX_GENERAL_QUOTE_COUNT;

  if (isTotalLimitReached || isTypeLimitReached) {
    throw new ConflictError(
      "해당 요청에 보낼 수 있는 견적 인원이 모두 찼습니다.",
      "QUOTE_LIMIT_REACHED",
    );
  }
}

/**
 * Prisma unique·transaction 충돌을 도메인 충돌 오류로 변환합니다.
 */
function throwActionConflict(error: unknown): never {
  if (isPrismaActionConflict(error)) {
    throw new ConflictError(
      "요청이 이미 처리되었거나 다른 요청과 충돌했습니다.",
      "REQUEST_ALREADY_HANDLED",
    );
  }

  throw error;
}

/**
 * 기사님이 받은 요청 목록을 조회합니다.
 *
 * @param moverId 인증된 기사 프로필 UUID
 * @param query 검색·필터·pagination 조건
 * @param now 요청 조회 기준 시각
 * @returns 받은 요청 카드와 다음 cursor
 * @sideeffect Repository를 통해 PostgreSQL을 조회합니다.
 */
export async function getReceivedRequests(
  moverId: string,
  query: GetReceivedRequestsQuery,
  now = new Date(),
): Promise<ReceivedRequestListDto> {
  const records = await findReceivedRequests({
    moverId,
    now,
    ...query,
  });

  const hasNext = records.length > query.limit;
  const pageRecords = records.slice(0, query.limit);
  const items = pageRecords.map(toReceivedRequestItemDto);
  const lastItem = items.at(-1);

  return {
    items,
    pagination: {
      nextCursor: hasNext && lastItem ? lastItem.requestId : null,
      hasNext,
    },
  };
}

/**
 * 받은 요청에 기사님의 견적을 전송합니다.
 *
 * 요청 상태·이사일·서비스 유형·중복 처리와 일반·지정·전체 견적 제한을
 * 동일한 Serializable transaction 안에서 검증한 후 견적과 알림을 생성합니다.
 *
 * @param moverId 인증된 기사 프로필 UUID
 * @param requestId 견적을 보낼 이사 요청 UUID
 * @param input 견적 금액과 코멘트
 * @param now 처리 가능 여부 기준 시각
 * @returns 생성된 PROPOSED 견적
 * @throws NotFoundError 요청이 없거나 기사 서비스 유형이 맞지 않는 경우
 * @throws ConflictError 요청 처리 불가·중복 처리·견적 제한 초과인 경우
 * @sideeffect Quote와 Notification 레코드를 transaction으로 생성합니다.
 */
export async function sendQuoteToReceivedRequest(
  moverId: string,
  requestId: string,
  input: SendQuoteInput,
  now = new Date(),
): Promise<CreatedQuoteDto> {
  try {
    return await runSerializableTransaction(async (transaction) => {
      const request = await findReceivedRequestForAction(transaction, {
        moverId,
        requestId,
      });

      assertRequestCanBeHandled(request, moverId, now);
      assertQuoteCapacity(request, moverId);

      const quote = await createQuote(transaction, {
        moverId,
        requestId,
        price: input.price,
        comment: input.comment,
      });

      await createNewQuoteNotification(transaction, {
        customerUserId: request.customer.userId,
        requestId,
        quoteId: quote.id,
      });

      if (quote.price === null || quote.comment === null) {
        throw new Error("생성된 견적의 필수값을 확인할 수 없습니다.");
      }

      return {
        quoteId: quote.id,
        requestId: quote.moveRequestId,
        price: quote.price,
        comment: quote.comment,
        status: "PROPOSED",
        createdAt: quote.createdAt.toISOString(),
      };
    });
  } catch (error: unknown) {
    return throwActionConflict(error);
  }
}

/**
 * 받은 요청을 기사님이 반려합니다.
 *
 * 요청 상태·이사일·서비스 유형·중복 처리를 Serializable transaction 안에서
 * 검증합니다. 견적 인원 제한은 견적 생성에만 적용하므로 반려에는 적용하지 않습니다.
 *
 * @param moverId 인증된 기사 프로필 UUID
 * @param requestId 반려할 이사 요청 UUID
 * @param input 반려 사유
 * @param now 처리 가능 여부 기준 시각
 * @returns 생성된 요청 반려 기록
 * @throws NotFoundError 요청이 없거나 기사 서비스 유형이 맞지 않는 경우
 * @throws ConflictError 요청 처리 불가 또는 중복 처리인 경우
 * @sideeffect RequestRejection 레코드를 transaction으로 생성합니다.
 */
export async function rejectReceivedRequest(
  moverId: string,
  requestId: string,
  input: RejectReceivedRequestInput,
  now = new Date(),
): Promise<CreatedRequestRejectionDto> {
  try {
    return await runSerializableTransaction(async (transaction) => {
      const request = await findReceivedRequestForAction(transaction, {
        moverId,
        requestId,
      });

      assertRequestCanBeHandled(request, moverId, now);

      const rejection = await createRequestRejection(transaction, {
        moverId,
        requestId,
        reason: input.reason,
      });

      return {
        rejectionId: rejection.id,
        requestId: rejection.moveRequestId,
        reason: rejection.reason,
        rejectedAt: rejection.createdAt.toISOString(),
      };
    });
  } catch (error: unknown) {
    return throwActionConflict(error);
  }
}
