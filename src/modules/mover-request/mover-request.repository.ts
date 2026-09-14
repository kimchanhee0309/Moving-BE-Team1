/**
 * 기사님이 조회 가능한 MoveRequest를 Prisma로 조회합니다.
 * HTTP 응답과 비즈니스 오류는 처리하지 않고 필요한 column과 relation만 반환합니다.
 */
import type { MoveRequestStatus } from "../../generated/prisma/enums";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type {
  GetReceivedRequestsQuery,
  ServiceTypeCode,
} from "./mover-request.dto";

/** Service가 API DTO로 변환할 받은 요청 조회 결과입니다. */
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

export interface FindReceivedRequestsInput extends GetReceivedRequestsQuery {
  moverId: string;
  now: Date;
}

export interface FindReceivedRequestByIdInput {
  moverId: string;
  requestId: string;
  now: Date;
}

function createReceivedRequestSelect(
  moverId: string,
): Prisma.MoveRequestSelect {
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

    // 지정 요청 여부는 전체 지정 건수가 아니라 현재 기사님 지정 여부로 계산합니다.
    designatedRequests: {
      where: {
        moverId,
      },
      select: {
        id: true,
      },
      take: 1,
    },
  };
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

    // 이미 이사일이 지난 요청은 새 견적 대상에서 제외합니다.
    moveDate: {
      gte: input.now,
    },

    // 현재 기사님이 제공하는 서비스 종류만 조회합니다.
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

    // 현재 기사님이 이미 견적을 보냈거나 반려한 요청은 목록에서 제외합니다.
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

/**
 * 받은 요청 목록과 다음 페이지 존재 여부 확인을 위해 limit보다 한 건 더 조회합니다.
 * cursor는 이전 응답의 마지막 requestId를 사용합니다.
 */
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

/**
 * 현재 기사님이 아직 처리할 수 있는 받은 요청 한 건을 조회합니다.
 * 존재하지만 서비스 조건이 맞지 않거나 이미 처리한 요청도 null을 반환합니다.
 */
export async function findReceivedRequestById(
  input: FindReceivedRequestByIdInput,
): Promise<ReceivedRequestRecord | null> {
  return prisma.moveRequest.findFirst({
    where: {
      id: input.requestId,
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
    },

    select: createReceivedRequestSelect(input.moverId),
  });
}
