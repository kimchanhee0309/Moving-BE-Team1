/**
 * MoveRequest/DesignatedRequest 관련 Prisma query만 담당합니다.
 * 각 함수는 `client`를 선택적으로 받아 `$transaction` 콜백 안팎에서 동일한 쿼리를 재사용합니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { ServiceTypeName } from "./move-request.dto";

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

const moveRequestSelect = {
  id: true,
  customerId: true,
  moveDate: true,
  fromAddress: true,
  toAddress: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  serviceType: { select: { name: true } },
} satisfies Prisma.MoveRequestSelect;

export type MoveRequestRecord = Prisma.MoveRequestGetPayload<{
  select: typeof moveRequestSelect;
}>;

const designatedRequestSelect = {
  id: true,
  moveRequestId: true,
  moverId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DesignatedRequestSelect;

export type DesignatedRequestRecord = Prisma.DesignatedRequestGetPayload<{
  select: typeof designatedRequestSelect;
}>;

/** NEW_MOVE_REQUEST 알림 대상으로 매칭된 기사님 한 명입니다. */
export interface MatchingMoverRecord {
  userId: string;
}

/**
 * NEW_MOVE_REQUEST 알림으로 실제 저장한 내용입니다.
 * Service가 트랜잭션 커밋 이후 이 값 그대로 SSE push payload를 만들 수 있도록
 * DB에 쓴 title/content 문구를 다시 조회하지 않고 그대로 반환합니다.
 */
export interface CreatedNewMoveRequestNotificationRecord {
  userId: string;
  moveRequestId: string;
  quoteId: null;
  type: "NEW_MOVE_REQUEST";
  title: string;
  content: string;
}

export function findServiceTypeIdByName(
  name: ServiceTypeName,
  client: PrismaClientOrTx = prisma,
): Promise<{ id: string } | null> {
  return client.serviceType.findUnique({
    where: { name },
    select: { id: true },
  });
}

/**
 * Customer row를 `FOR UPDATE`로 잠급니다. 같은 고객이 동시에 활성 요청을 만들려는 경쟁을
 * 활성 요청 확인 전에 막아야 하므로 반드시 `$transaction` 콜백의 `tx`로만 호출해야 합니다.
 */
export async function lockCustomerRow(
  customerId: string,
  client: Prisma.TransactionClient,
): Promise<void> {
  await client.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
}

/** 활성 요청(대기 중이거나, 확정됐지만 이사일이 아직 지나지 않은 요청)을 조회합니다. */
export function findActiveMoveRequestByCustomerId(
  customerId: string,
  now: Date,
  client: PrismaClientOrTx = prisma,
): Promise<MoveRequestRecord | null> {
  // moveDate는 이사일의 UTC 자정 instant로 저장되므로 now와 그대로 비교하면 이사 당일
  // UTC 00:00이 지나는 순간 바로 비활성으로 취급된다. 오늘 UTC 자정과 비교해 이사 당일
  // 하루 전체는 활성으로 유지한다.
  const todayUtcMidnight = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);

  return client.moveRequest.findFirst({
    where: {
      customerId,
      OR: [
        { status: "WAITING" },
        { status: "CONFIRMED", moveDate: { gte: todayUtcMidnight } },
      ],
    },
    select: moveRequestSelect,
  });
}

interface CreateMoveRequestData {
  customerId: string;
  serviceTypeId: string;
  moveDate: Date;
  fromAddress: string;
  toAddress: string;
}

/** 새 MoveRequest를 생성합니다(`status`는 schema 기본값 `WAITING`을 그대로 사용). */
export function createMoveRequest(
  data: CreateMoveRequestData,
  client: PrismaClientOrTx = prisma,
): Promise<MoveRequestRecord> {
  return client.moveRequest.create({ data, select: moveRequestSelect });
}

export function findMoveRequestById(
  id: string,
  client: PrismaClientOrTx = prisma,
): Promise<MoveRequestRecord | null> {
  return client.moveRequest.findUnique({ where: { id }, select: moveRequestSelect });
}

/**
 * MoveRequest row를 `FOR UPDATE`로 잠근 뒤 조회합니다. 같은 row를 대상으로 한 동시 지정 요청(소유권·
 * 상태 재확인, 인원 수 카운트, insert)을 여기서 직렬화하므로 반드시 `$transaction` 콜백의 `tx`로만
 * 호출해야 합니다(기본 prisma client로 호출하면 잠금이 이 쿼리 하나로 끝나버려 의미가 없습니다).
 */
export async function findMoveRequestByIdForUpdate(
  id: string,
  client: Prisma.TransactionClient,
): Promise<MoveRequestRecord | null> {
  const locked = await client.$queryRaw<{ id: string }[]>`
    SELECT id FROM "MoveRequest" WHERE id = ${id} FOR UPDATE
  `;

  if (locked.length === 0) {
    return null;
  }

  return findMoveRequestById(id, client);
}

export function findMoverById(
  id: string,
  client: PrismaClientOrTx = prisma,
): Promise<{ id: string } | null> {
  return client.mover.findUnique({ where: { id }, select: { id: true } });
}

export function findDesignatedRequestByMoveRequestAndMover(
  moveRequestId: string,
  moverId: string,
  client: PrismaClientOrTx = prisma,
): Promise<{ id: string } | null> {
  return client.designatedRequest.findUnique({
    where: { moveRequestId_moverId: { moveRequestId, moverId } },
    select: { id: true },
  });
}

export function countDesignatedRequestsByMoveRequestId(
  moveRequestId: string,
  client: PrismaClientOrTx = prisma,
): Promise<number> {
  return client.designatedRequest.count({ where: { moveRequestId } });
}

export function createDesignatedRequest(
  data: { moveRequestId: string; moverId: string },
  client: PrismaClientOrTx = prisma,
): Promise<DesignatedRequestRecord> {
  return client.designatedRequest.create({ data, select: designatedRequestSelect });
}

/**
 * 이사 요청을 생성한 고객의 지역을 조회합니다.
 *
 * NEW_MOVE_REQUEST 알림 대상("해당 지역을 선택한 기사님")을 찾기 위해 사용하며,
 * lockCustomerRow로 이미 같은 transaction 안에서 해당 Customer row를 잠근 뒤 호출해야
 * 다른 요청이 끼어들 여지 없이 일관된 지역 값을 읽을 수 있습니다.
 *
 * @param customerId 이사 요청을 생성한 고객의 Customer.id
 * @param client 현재 transaction client
 * @returns 고객의 regionId. Customer row가 존재하지 않으면 null(정상 흐름에서는 발생하지
 * 않아야 하며, 발생하면 Service가 데이터 정합성 오류로 처리합니다)
 * @sideeffect PostgreSQL 읽기 쿼리를 실행합니다.
 */
export function findCustomerRegionId(
  customerId: string,
  client: PrismaClientOrTx = prisma,
): Promise<{ regionId: string } | null> {
  return client.customer.findUnique({
    where: { id: customerId },
    select: { regionId: true },
  });
}

/**
 * 새 이사 요청과 지역·서비스 유형이 모두 일치하는 기사님의 User.id 목록을 조회합니다.
 *
 * mover-request 모듈의 받은 요청 목록 조회(createReceivedRequestWhere)는 서비스 유형만
 * 매칭하고 지역 필터가 없는 기존 갭이 있지만, 사용자가 확정한 NEW_MOVE_REQUEST 알림 범위
 * ("해당 지역을 선택한 기사님")를 따르기 위해 이 조회는 지역과 서비스 유형을 모두 매칭합니다.
 * 대상이 많을 수 있는 broadcast성 조회이므로 기사 수만큼 반복 조회하지 않고 단일 query로
 * 가져옵니다.
 *
 * @param regionId 이사 요청을 생성한 고객의 Customer.regionId
 * @param serviceTypeId 생성된 MoveRequest.serviceTypeId
 * @param client 현재 transaction client
 * @returns 조건에 맞는 기사님들의 User.id 배열(중복 없음, 매칭이 없으면 빈 배열)
 * @sideeffect PostgreSQL 읽기 쿼리를 실행합니다.
 */
export function findMoversForNewMoveRequestNotification(
  regionId: string,
  serviceTypeId: string,
  client: PrismaClientOrTx = prisma,
): Promise<MatchingMoverRecord[]> {
  return client.mover.findMany({
    where: {
      regions: {
        some: { regionId },
      },
      serviceTypes: {
        some: { serviceTypeId },
      },
    },
    select: {
      userId: true,
    },
  });
}

/**
 * 매칭된 기사님들에게 새 이사 요청 알림을 일괄 생성합니다.
 *
 * 대상이 없으면(빈 배열) `createMany`를 호출하지 않고 빈 배열을 그대로 반환합니다 —
 * Prisma의 `createMany`는 빈 배열이어도 쿼리 자체는 안전하지만, 대상이 없는 것이 정상
 * 흐름(매칭 기사 0명)임을 호출부에서 더 명확히 드러내기 위함입니다.
 *
 * @param transaction 현재 transaction client
 * @param input 알림을 받을 기사님들의 User.id 목록과 생성된 MoveRequest.id
 * @returns 저장한 알림 내용 목록. Service가 transaction 커밋 이후 각 항목을 SSE push합니다.
 * @sideeffect moverUserIds 수만큼 Notification 레코드를 생성합니다.
 */
export async function createNewMoveRequestNotifications(
  transaction: Prisma.TransactionClient,
  input: {
    moverUserIds: string[];
    moveRequestId: string;
  },
): Promise<CreatedNewMoveRequestNotificationRecord[]> {
  if (input.moverUserIds.length === 0) {
    return [];
  }

  const notifications: CreatedNewMoveRequestNotificationRecord[] = input.moverUserIds.map(
    (moverUserId) => ({
      userId: moverUserId,
      moveRequestId: input.moveRequestId,
      quoteId: null,
      type: "NEW_MOVE_REQUEST",
      title: "새로운 이사 견적 요청이 도착했습니다.",
      content: "고객님이 새로운 이사 견적을 요청했습니다.",
    }),
  );

  await transaction.notification.createMany({
    data: notifications,
  });

  return notifications;
}
