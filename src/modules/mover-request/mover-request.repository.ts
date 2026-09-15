/**
 * 기사님이 조회·처리 가능한 MoveRequest를 Prisma로 조회하고
 * 견적·반려·알림 데이터를 생성합니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import type { MoveRequestStatus } from "../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type {
  GetReceivedRequestsQuery,
  ServiceTypeCode,
} from "./mover-request.dto";

export interface ReceivedRequestRecord {
  id: string;
  moveDate: Date;
  fromAddress: string;
  toAddress: string;
  status: MoveRequestStatus;
  createdAt: Date;

  customer: {
    user: {
      name: string;
    };
  };

  serviceType: {
    name: string;
  };

  designatedRequests: Array<{
    id: string;
  }>;
}

export interface ReceivedRequestActionRecord {
  id: string;
  status: MoveRequestStatus;
  moveDate: Date;

  customer: {
    userId: string;
  };

  serviceType: {
    moverServiceTypes: Array<{
      id: string;
    }>;
  };

  quotes: Array<{
    id: string;
  }>;

  requestRejections: Array<{
    id: string;
  }>;
}

export interface CreatedQuoteRecord {
  id: string;
  moveRequestId: string;
  price: number | null;
  comment: string | null;
  status: "PROPOSED" | "CONFIRMED" | "REJECTED";
  createdAt: Date;
}

export interface CreatedRequestRejectionRecord {
  id: string;
  moveRequestId: string;
  reason: string;
  createdAt: Date;
}

export interface FindReceivedRequestsInput extends GetReceivedRequestsQuery {
  moverId: string;
  now: Date;
}

export interface FindReceivedRequestForActionInput {
  moverId: string;
  requestId: string;
}

export interface CreateQuoteInput {
  moverId: string;
  requestId: string;
  price: number;
  comment: string;
}

export interface CreateRequestRejectionInput {
  moverId: string;
  requestId: string;
  reason: string;
}

function createReceivedRequestSelect(moverId: string) {
  return {
    id: true,
    moveDate: true,
    fromAddress: true,
    toAddress: true,
    status: true,
    createdAt: true,

    customer: {
      select: {
        user: {
          select: {
            name: true,
          },
        },
      },
    },

    serviceType: {
      select: {
        name: true,
      },
    },

    designatedRequests: {
      where: {
        moverId,
      },
      select: {
        id: true,
      },
      take: 1,
    },
  } satisfies Prisma.MoveRequestSelect;
}

function createReceivedRequestWhere(
  input: FindReceivedRequestsInput,
): Prisma.MoveRequestWhereInput {
  const designationFilter: Prisma.MoveRequestWhereInput =
    input.isDesignated === undefined
      ? {}
      : input.isDesignated
        ? {
            designatedRequests: {
              some: {
                moverId: input.moverId,
              },
            },
          }
        : {
            designatedRequests: {
              none: {
                moverId: input.moverId,
              },
            },
          };

  return {
    status: "WAITING",

    moveDate: {
      gte: input.now,
    },

    serviceType: {
      moverServiceTypes: {
        some: {
          moverId: input.moverId,
        },
      },

      ...(input.serviceType
        ? {
            name: input.serviceType satisfies ServiceTypeCode,
          }
        : {}),
    },

    quotes: {
      none: {
        moverId: input.moverId,
      },
    },

    requestRejections: {
      none: {
        moverId: input.moverId,
      },
    },

    ...(input.keyword
      ? {
          customer: {
            user: {
              name: {
                contains: input.keyword,
                mode: "insensitive",
              },
            },
          },
        }
      : {}),

    ...designationFilter,
  };
}

export async function findReceivedRequests(
  input: FindReceivedRequestsInput,
): Promise<ReceivedRequestRecord[]> {
  const orderBy: Prisma.MoveRequestOrderByWithRelationInput[] =
    input.sort === "MOVE_DATE_ASC"
      ? [{ moveDate: "asc" }, { id: "asc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];

  return prisma.moveRequest.findMany({
    where: createReceivedRequestWhere(input),
    select: createReceivedRequestSelect(input.moverId),
    orderBy,
    take: input.limit + 1,

    ...(input.cursor
      ? {
          cursor: {
            id: input.cursor,
          },
          skip: 1,
        }
      : {}),
  });
}

export async function findReceivedRequestForAction(
  transaction: Prisma.TransactionClient,
  input: FindReceivedRequestForActionInput,
): Promise<ReceivedRequestActionRecord | null> {
  return transaction.moveRequest.findUnique({
    where: {
      id: input.requestId,
    },

    select: {
      id: true,
      status: true,
      moveDate: true,

      customer: {
        select: {
          userId: true,
        },
      },

      serviceType: {
        select: {
          moverServiceTypes: {
            where: {
              moverId: input.moverId,
            },
            select: {
              id: true,
            },
            take: 1,
          },
        },
      },

      quotes: {
        where: {
          moverId: input.moverId,
        },
        select: {
          id: true,
        },
        take: 1,
      },

      requestRejections: {
        where: {
          moverId: input.moverId,
        },
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });
}

export async function createQuote(
  transaction: Prisma.TransactionClient,
  input: CreateQuoteInput,
): Promise<CreatedQuoteRecord> {
  return transaction.quote.create({
    data: {
      moveRequestId: input.requestId,
      moverId: input.moverId,
      price: input.price,
      comment: input.comment,
      status: "PROPOSED",
    },

    select: {
      id: true,
      moveRequestId: true,
      price: true,
      comment: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function createNewQuoteNotification(
  transaction: Prisma.TransactionClient,
  input: {
    customerUserId: string;
    requestId: string;
    quoteId: string;
  },
): Promise<void> {
  await transaction.notification.create({
    data: {
      userId: input.customerUserId,
      moveRequestId: input.requestId,
      quoteId: input.quoteId,
      type: "NEW_QUOTE",
      title: "새로운 견적이 도착했습니다.",
      content: "기사님이 새로운 이사 견적을 보냈습니다.",
    },
  });
}

export async function createRequestRejection(
  transaction: Prisma.TransactionClient,
  input: CreateRequestRejectionInput,
): Promise<CreatedRequestRejectionRecord> {
  return transaction.requestRejection.create({
    data: {
      moveRequestId: input.requestId,
      moverId: input.moverId,
      reason: input.reason,
    },

    select: {
      id: true,
      moveRequestId: true,
      reason: true,
      createdAt: true,
    },
  });
}
