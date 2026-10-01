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
import type { NotificationParams } from "../notification/notification.dto";

/** 받은 요청 목록 조회 결과입니다. */
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

/**
 * 견적 전송 및 요청 반려 가능 여부를 판단하기 위한 조회 결과입니다.
 *
 * 전체 지정 기사와 전체 견적을 함께 조회하여 일반·지정·전체 견적 수를
 * 동일한 Serializable transaction 안에서 계산합니다.
 * serviceType.name과 moverServiceTypes[].mover.nickname은 NEW_QUOTE 알림 문구
 * ("{기사 닉네임} 기사님의 {서비스 타입 한글명} 견적이 도착했어요")를 만드는 데 사용하며,
 * 이미 이 조회에서 서비스 유형 매칭용으로 moverId로 필터링된 값을 그대로 재사용하므로
 * 별도 round-trip이 필요하지 않습니다.
 */
export interface ReceivedRequestActionRecord {
  id: string;
  status: MoveRequestStatus;
  moveDate: Date;

  customer: {
    userId: string;
  };

  serviceType: {
    name: string;
    moverServiceTypes: Array<{
      id: string;
      mover: {
        nickname: string;
      };
    }>;
  };

  designatedRequests: Array<{
    moverId: string;
  }>;

  quotes: Array<{
    moverId: string;
  }>;

  requestRejections: Array<{
    id: string;
  }>;
}

/** 생성된 견적의 DB 조회 결과입니다. */
export interface CreatedQuoteRecord {
  id: string;
  moveRequestId: string;
  price: number | null;
  comment: string | null;
  status: "PROPOSED" | "CONFIRMED" | "REJECTED";
  createdAt: Date;
}

/** 생성된 요청 반려 기록의 DB 조회 결과입니다. */
export interface CreatedRequestRejectionRecord {
  id: string;
  moveRequestId: string;
  reason: string;
  createdAt: Date;
}

/**
 * 새 견적 알림으로 실제 저장한 내용입니다.
 * Service가 트랜잭션 커밋 이후 이 값 그대로 SSE push payload를 만들 수 있도록
 * DB에 쓴 title/content 문구를 다시 조회하지 않고 그대로 반환합니다.
 */
export interface CreatedNotificationRecord {
  userId: string;
  moveRequestId: string;
  quoteId: string;
  type: "NEW_QUOTE";
  title: string;
  content: string;
  /** 언어별 알림 문장을 조립할 변수입니다. 문장에 변수가 없는 알림은 생략합니다. */
  params?: NotificationParams;
}

/** 받은 요청 목록 조회 Repository 입력입니다. */
export interface FindReceivedRequestsInput extends GetReceivedRequestsQuery {
  moverId: string;
  now: Date;
}

/** 처리할 요청 조회 Repository 입력입니다. */
export interface FindReceivedRequestForActionInput {
  moverId: string;
  requestId: string;
}

/** 견적 생성 Repository 입력입니다. */
export interface CreateQuoteInput {
  moverId: string;
  requestId: string;
  price: number;
  comment: string;
}

/** 요청 반려 생성 Repository 입력입니다. */
export interface CreateRequestRejectionInput {
  moverId: string;
  requestId: string;
  reason: string;
}

/**
 * 받은 요청 카드에 필요한 필드만 조회합니다.
 *
 * @param moverId 인증된 기사 프로필 UUID
 * @returns Prisma MoveRequest select 객체
 */
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

    // 지정 여부는 다른 기사가 아니라 현재 기사 기준으로만 계산합니다.
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

/**
 * 인증된 기사가 목록에서 조회 가능한 요청 조건을 생성합니다.
 *
 * 다른 기사에게 지정되었다는 이유만으로 일반 기사에게 요청을 숨기지 않습니다.
 * isDesignated는 현재 기사에게 지정된 요청인지 여부만 필터링합니다.
 *
 * @param input 기사 ID와 검색·필터·현재 시각
 * @returns Prisma MoveRequest where 객체
 */
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

/**
 * 기사님이 받은 요청을 조회합니다.
 *
 * @param input 인증된 기사와 조회 조건
 * @returns limit보다 최대 한 건 더 조회한 요청 목록
 * @sideeffect PostgreSQL 읽기 쿼리를 실행합니다.
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
 * 견적 전송 또는 반려 처리에 필요한 요청 정보를 조회합니다.
 *
 * 전체 견적과 지정 기사 목록을 조회해 Service에서 일반·지정·전체 견적 수를
 * 계산합니다. 현재 기사의 서비스 유형과 기존 반려 여부도 함께 확인합니다.
 *
 * @param transaction 현재 Serializable transaction client
 * @param input 인증된 기사 UUID와 요청 UUID
 * @returns 처리 대상 요청 또는 null
 * @sideeffect PostgreSQL 읽기 쿼리를 실행합니다.
 */
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
          // NEW_QUOTE 알림 문구의 "{서비스 타입 한글명}" 부분에 사용합니다.
          name: true,

          moverServiceTypes: {
            where: {
              moverId: input.moverId,
            },
            select: {
              id: true,
              // NEW_QUOTE 알림 문구의 "{기사 닉네임}" 부분에 사용합니다. 이미 현재 기사
              // moverId로 필터링된 결과이므로 별도 쿼리 없이 닉네임을 함께 가져옵니다.
              mover: {
                select: {
                  nickname: true,
                },
              },
            },
            take: 1,
          },
        },
      },

      // 현재 요청에 지정된 모든 기사 ID를 조회합니다.
      designatedRequests: {
        select: {
          moverId: true,
        },
      },

      // 현재 요청에 생성된 모든 견적의 기사 ID를 조회합니다.
      quotes: {
        select: {
          moverId: true,
        },
      },

      // 반려 여부는 현재 기사 기준으로만 확인합니다.
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

/**
 * 받은 요청에 기사님의 견적을 생성합니다.
 *
 * @param transaction 현재 Serializable transaction client
 * @param input 기사·요청 UUID와 견적 정보
 * @returns 생성된 견적
 * @sideeffect Quote 레코드를 생성합니다.
 */
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

/**
 * 서비스 타입 코드(SMALL/HOME/OFFICE)를 알림 문구용 한글명으로 변환합니다.
 *
 * 팀이 확정한 매핑(docs/move-request-api.md:111)이며, 이 알림 문구를 만드는
 * 이 파일 안에서만 쓰이는 작은 상수라 src/common으로 올리지 않습니다(YAGNI).
 * 알 수 없는 값이 들어오면(데이터 이상 등) 원본 코드를 그대로 노출해 방어적으로 동작합니다.
 */
const SERVICE_TYPE_LABEL_KO: Record<string, string> = {
  SMALL: "소형이사",
  HOME: "가정이사",
  OFFICE: "사무실이사",
};

/**
 * 고객에게 새 견적 도착 알림을 생성합니다.
 *
 * @param transaction 현재 Serializable transaction client
 * @param input 고객 User UUID, 요청 UUID, 견적 UUID, 기사 닉네임, 서비스 타입 코드
 * @returns 저장한 알림 내용. Service가 트랜잭션 커밋 이후 SSE push에 사용합니다.
 * @sideeffect Notification 레코드를 생성합니다.
 */
export async function createNewQuoteNotification(
  transaction: Prisma.TransactionClient,
  input: {
    customerUserId: string;
    requestId: string;
    quoteId: string;
    moverNickname: string;
    serviceTypeName: string;
  },
): Promise<CreatedNotificationRecord> {
  const serviceTypeLabel =
    SERVICE_TYPE_LABEL_KO[input.serviceTypeName] ?? input.serviceTypeName;

  const notificationData = {
    userId: input.customerUserId,
    moveRequestId: input.requestId,
    quoteId: input.quoteId,
    type: "NEW_QUOTE",
    title: "새로운 견적이 도착했습니다.",
    content: `${input.moverNickname} 기사님의 ${serviceTypeLabel} 견적이 도착했어요`,
    params: { moverNickname: input.moverNickname, serviceType: input.serviceTypeName },
  } satisfies CreatedNotificationRecord;

  await transaction.notification.create({
    data: notificationData,
  });

  return notificationData;
}

/**
 * 기사님의 요청 반려 기록을 생성합니다.
 *
 * @param transaction 현재 Serializable transaction client
 * @param input 기사·요청 UUID와 반려 사유
 * @returns 생성된 반려 기록
 * @sideeffect RequestRejection 레코드를 생성합니다.
 */
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
