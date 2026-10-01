/**
 * MOVE_DAY(이사 당일 리마인드) 알림 발송에 필요한 Prisma query만 담당합니다.
 * 스케줄러(move-day.scheduler.ts)나 인증된 HTTP 요청이 아니라 move-day.service.ts의
 * 비즈니스 로직에서만 호출되며, 이 파일은 대상 조회와 알림 row 생성만 담당하고
 * "누구에게 보낼지" 판단이나 중복 발송 방지 자체는 Service에 위임합니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { NotificationParams } from "./notification.dto";

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

/**
 * 이사일이 특정 날짜인 CONFIRMED 요청 한 건과, 그 요청에 대해 확정된(CONFIRMED) 견적들입니다.
 * 정상 데이터라면 quotes는 0건(확정 견적이 없는 예외적 데이터) 또는 1건(applyQuoteConfirmation이
 * 나머지 PROPOSED 견적을 모두 REJECTED로 바꾸므로)입니다. 방어적으로 배열로 다룹니다.
 */
export interface ConfirmedMoveRequestForMoveDay {
  id: string;
  // MOVE_DAY 알림 content("내일은 {출발지 축약} → {도착지 축약} 이사 예정일이에요.")를
  // 만드는 데 사용합니다. 고객·기사님 모두 같은 문구를 받으므로 여기 한 번만 조회합니다.
  fromAddress: string;
  toAddress: string;
  customer: {
    userId: string;
    user: { name: string };
  };
  quotes: {
    id: string;
    mover: {
      userId: string;
      nickname: string;
    };
  }[];
}

/**
 * 이사일(moveDate)이 정확히 주어진 UTC 자정 instant와 일치하는 CONFIRMED 요청을 모두 조회합니다.
 *
 * moveDate는 이사일의 UTC 자정 instant로 저장되는 기존 관례(move-request.service.ts의
 * createMoveRequestForCustomer 참고)를 따르므로, 호출부가 "내일"에 해당하는 UTC 자정
 * instant를 미리 계산해 넘겨야 합니다.
 *
 * @param moveDate 알림을 보낼 기준일의 UTC 자정 instant
 * @param client 기본 prisma client. 트랜잭션 안에서 호출할 경우에만 tx를 전달합니다.
 * @returns 대상 MoveRequest(출발지·도착지 주소 포함)와 각 요청의 확정 견적
 * (고객·기사님 식별 및 알림 문구 생성에 필요한 최소 필드만 포함)
 * @sideeffect PostgreSQL 읽기 쿼리를 실행합니다.
 */
export function findConfirmedMoveRequestsByMoveDate(
  moveDate: Date,
  client: PrismaClientOrTx = prisma,
): Promise<ConfirmedMoveRequestForMoveDay[]> {
  return client.moveRequest.findMany({
    where: {
      status: "CONFIRMED",
      moveDate,
    },
    select: {
      id: true,
      fromAddress: true,
      toAddress: true,
      customer: {
        select: {
          userId: true,
          user: { select: { name: true } },
        },
      },
      quotes: {
        where: { status: "CONFIRMED" },
        select: {
          id: true,
          mover: {
            select: {
              userId: true,
              nickname: true,
            },
          },
        },
      },
    },
  });
}

/** 이미 MOVE_DAY 알림을 받은 (moveRequestId, userId) 조합 하나입니다. */
export interface MoveDayNotificationRecipientKey {
  moveRequestId: string;
  userId: string;
}

/**
 * 주어진 MoveRequest들에 대해 이미 생성된 MOVE_DAY 알림의 수신자 조합을 조회합니다.
 *
 * 서버 재시작·재배포로 스케줄러가 하루에 여러 번 실행돼도 같은 (moveRequestId, userId)
 * 조합에 중복 생성되지 않도록, Service가 이 결과를 기준으로 후보를 걸러냅니다.
 * moveRequestIds가 비어 있으면 불필요한 쿼리를 보내지 않고 빈 배열을 즉시 반환합니다.
 *
 * ⚠️ 이 "조회 후 생성(check-then-create)" 방식은 같은 단일 프로세스 안에서의 순차 재실행만
 * 안전하게 막습니다. 여러 서버 인스턴스가 동시에 이 함수를 호출하면 둘 다 "기존 알림 없음"으로
 * 판단할 수 있어 같은 알림이 중복 생성될 수 있습니다(move-day.scheduler.ts 상단 주석 참고).
 * DB 트랜잭션이나 unique 제약으로 막지 않은 이유는, Notification에 (type, moveRequestId,
 * userId) 전역 unique 제약을 걸면 quoteId로 구분되는 NEW_QUOTE 등 다른 알림 타입의 정상적인
 * 다건 생성(같은 요청에 여러 기사님의 견적 알림)까지 막혀버리고, quoteId를 포함하면 nullable이라
 * Postgres가 NULL끼리는 다른 값으로 취급해 정작 quoteId가 없는 MOVE_DAY 예외 케이스의 중복은
 * 막지 못하기 때문입니다. 현재는 단일 Node 프로세스 배포를 전제로 범위를 한정합니다.
 *
 * @param moveRequestIds 알림 후보에 포함된 MoveRequest.id 목록(중복 제거 여부는 호출부 자유)
 * @param client 기본 prisma client
 * @sideeffect PostgreSQL 읽기 쿼리를 실행합니다.
 */
export async function findExistingMoveDayNotificationRecipients(
  moveRequestIds: string[],
  client: PrismaClientOrTx = prisma,
): Promise<MoveDayNotificationRecipientKey[]> {
  if (moveRequestIds.length === 0) {
    return [];
  }

  const rows = await client.notification.findMany({
    where: {
      type: "MOVE_DAY",
      moveRequestId: { in: moveRequestIds },
    },
    select: {
      moveRequestId: true,
      userId: true,
    },
  });

  // moveRequestId는 schema상 nullable이지만 위 where가 moveRequestIds에 속한 row만 가져오므로
  // 실제로는 항상 값이 있다. non-null 단언 대신 filter로 타입을 좁혀 안전하게 반환한다.
  return rows
    .filter((row): row is { moveRequestId: string; userId: string } => row.moveRequestId !== null)
    .map((row) => ({ moveRequestId: row.moveRequestId, userId: row.userId }));
}

/** MOVE_DAY 알림 1건으로 실제 저장할(또는 저장한) 내용입니다. */
export interface CreatedMoveDayNotificationRecord {
  userId: string;
  moveRequestId: string;
  quoteId: string | null;
  type: "MOVE_DAY";
  title: string;
  content: string;
  /** 언어별 알림 문장을 조립할 변수입니다. 문장에 변수가 없는 알림은 생략합니다. */
  params?: NotificationParams;
}

/**
 * 중복 필터링을 마친 MOVE_DAY 알림 후보를 일괄 생성합니다.
 *
 * 빈 배열이면 `createMany`를 호출하지 않고 그대로 빈 배열을 반환합니다 — 대상이 없는 것이
 * 정상 흐름(모두 이미 발송됐거나 내일 이사인 CONFIRMED 요청이 없음)임을 드러내기 위함입니다.
 *
 * @param records Service가 만든, 아직 DB에 없는 알림 내용 목록
 * @param client 기본 prisma client
 * @returns 입력으로 받은 records를 그대로 반환합니다(Service가 다시 조회하지 않고 SSE push에
 * 바로 사용할 수 있도록 다른 트리거들과 동일한 관례를 따릅니다).
 * @sideeffect records 수만큼 Notification 레코드를 생성합니다.
 */
export async function createMoveDayNotifications(
  records: CreatedMoveDayNotificationRecord[],
  client: PrismaClientOrTx = prisma,
): Promise<CreatedMoveDayNotificationRecord[]> {
  if (records.length === 0) {
    return [];
  }

  await client.notification.createMany({
    data: records,
  });

  return records;
}
