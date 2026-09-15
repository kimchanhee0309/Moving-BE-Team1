/**
 * 기사님의 받은 요청 목록, 견적 전송 및 요청 반려 규칙을 처리합니다.
 */
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

function isPrismaActionConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return error.code === "P2002" || error.code === "P2034";
}

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

function assertRequestCanBeHandled(
  record: ReceivedRequestActionRecord | null,
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

  if (record.quotes.length > 0 || record.requestRejections.length > 0) {
    throw new ConflictError(
      "이미 견적을 보내거나 반려한 요청입니다.",
      "REQUEST_ALREADY_HANDLED",
    );
  }
}

function throwActionConflict(error: unknown): never {
  if (isPrismaActionConflict(error)) {
    throw new ConflictError(
      "요청이 이미 처리되었거나 다른 요청과 충돌했습니다.",
      "REQUEST_ALREADY_HANDLED",
    );
  }

  throw error;
}

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

export async function sendQuoteToReceivedRequest(
  moverId: string,
  requestId: string,
  input: SendQuoteInput,
  now = new Date(),
): Promise<CreatedQuoteDto> {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const request = await findReceivedRequestForAction(transaction, {
          moverId,
          requestId,
        });

        assertRequestCanBeHandled(request, now);

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
      },
      {
        isolationLevel: "Serializable",
      },
    );
  } catch (error: unknown) {
    return throwActionConflict(error);
  }
}

export async function rejectReceivedRequest(
  moverId: string,
  requestId: string,
  input: RejectReceivedRequestInput,
  now = new Date(),
): Promise<CreatedRequestRejectionDto> {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const request = await findReceivedRequestForAction(transaction, {
          moverId,
          requestId,
        });

        assertRequestCanBeHandled(request, now);

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
      },
      {
        isolationLevel: "Serializable",
      },
    );
  } catch (error: unknown) {
    return throwActionConflict(error);
  }
}
