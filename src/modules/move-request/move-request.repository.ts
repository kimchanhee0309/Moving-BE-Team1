/**
 * MoveRequest/DesignatedRequest 관련 Prisma query만 담당합니다.
 * 각 함수는 `client`를 선택적으로 받아 `$transaction` 콜백 안팎에서 동일한 쿼리를 재사용합니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import type { QuoteStatus } from "../../generated/prisma/enums";
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

interface UpdateMoveRequestData {
  serviceTypeId: string;
  moveDate: Date;
  fromAddress: string;
  toAddress: string;
}

/**
 * WAITING 상태인 MoveRequest의 서비스 유형·이사일·출발지·도착지를 덮어씁니다.
 * status는 이 함수가 바꾸지 않습니다(호출부인 Service가 WAITING인지 이미 확인한 뒤 호출).
 */
export function updateMoveRequest(
  id: string,
  data: UpdateMoveRequestData,
  client: PrismaClientOrTx = prisma,
): Promise<MoveRequestRecord> {
  return client.moveRequest.update({ where: { id }, data, select: moveRequestSelect });
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

/** DELETE에서 취소 알림 문구에 필요한 고객 이름까지 함께 조회하기 위한 select입니다. */
const moveRequestForCancelSelect = {
  id: true,
  customerId: true,
  status: true,
  customer: {
    select: {
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.MoveRequestSelect;

export type MoveRequestForCancelRecord = Prisma.MoveRequestGetPayload<{
  select: typeof moveRequestForCancelSelect;
}>;

/**
 * DELETE endpoint 전용으로 MoveRequest row를 `FOR UPDATE`로 잠근 뒤 취소 알림에 필요한
 * 고객 이름까지 함께 조회합니다. `findMoveRequestByIdForUpdate`와 잠금 방식은 동일하지만,
 * 알림 문구(`{customerName} 고객님이...`)를 만들려면 `customer.user.name`이 필요해서 select가
 * 다릅니다. 반드시 `$transaction` 콜백의 `tx`로만 호출해야 합니다.
 */
export async function findMoveRequestForCancelByIdForUpdate(
  id: string,
  client: Prisma.TransactionClient,
): Promise<MoveRequestForCancelRecord | null> {
  const locked = await client.$queryRaw<{ id: string }[]>`
    SELECT id FROM "MoveRequest" WHERE id = ${id} FOR UPDATE
  `;

  if (locked.length === 0) {
    return null;
  }

  return client.moveRequest.findUnique({
    where: { id },
    select: moveRequestForCancelSelect,
  });
}

/**
 * 계정 탈퇴 시 취소 알림 대상을 찾기 위해, 해당 고객의 진행 중인 이사 요청을 전부 조회합니다.
 * "고객은 동시에 활성 요청을 하나만 가진다"는 규칙상 실제로는 0건 또는 1건만 돌아오지만, 그
 * 불변식이 깨지는 경우까지 안전하게 처리하기 위해 배열로 반환합니다.
 *
 * `findActiveMoveRequestByCustomerId`와 같은 기준("활성" = WAITING 전부, 또는 CONFIRMED이면서
 * 이사일이 아직 지나지 않음)을 그대로 따른다 — 이 기준 없이 CONFIRMED만으로 조회하면, 이사일이
 * 이미 지났지만 아무 배치도 COMPLETED로 전이시키지 않아 여전히 CONFIRMED로 남아있는 오래된 요청까지
 * "취소 알림" 대상에 잡혀 "확정된 이사 일정이 취소되었습니다"라는 알림이 이미 끝난 이사에 대해
 * 잘못 나가게 된다.
 *
 * `auth.service.ts`의 `withdrawAccount`가 User(및 Customer)를 cascade 삭제하기 전에 호출해
 * 각 요청에 맞는 취소 알림(MOVE_REQUEST_CANCELED/CONFIRMED_MOVE_CANCELED)을 생성할 수 있게 한다.
 *
 * @param customerId 탈퇴하는 고객의 Customer.id
 * @param now 기준 시각(테스트에서 주입 가능하도록 매개변수로 받는다. `findActiveMoveRequestByCustomerId`와 동일한 관례)
 * @param client 현재 transaction client(auth 모듈의 withdrawAccount transaction)
 * @returns 취소 알림 대상 MoveRequest 목록(없으면 빈 배열)
 * @sideeffect PostgreSQL 읽기 쿼리를 실행합니다.
 */
export function findCancelableMoveRequestsByCustomerId(
  customerId: string,
  now: Date,
  client: Prisma.TransactionClient,
): Promise<MoveRequestForCancelRecord[]> {
  const todayUtcMidnight = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);

  return client.moveRequest.findMany({
    where: {
      customerId,
      OR: [
        { status: "WAITING" },
        { status: "CONFIRMED", moveDate: { gte: todayUtcMidnight } },
      ],
    },
    select: moveRequestForCancelSelect,
  });
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

/** 요청 취소 알림을 받을 기사님 한 명(quote 한 건)입니다. */
export interface QuoteRecipientRecord {
  quoteId: string;
  moverUserId: string;
}

/**
 * 취소되는 MoveRequest에 특정 Quote 상태로 연결된 기사님들의 User.id를 조회합니다.
 *
 * WAITING 요청 삭제 시에는 `status: "PROPOSED"`로 호출해 대기 중인 견적을 보낸 기사님 전원을,
 * CONFIRMED 요청 삭제 시에는 `status: "CONFIRMED"`로 호출해 확정 기사님(정상적으로는 1명)을
 * 찾는다. REJECTED 견적을 보낸 기사님에게는 취소 알림을 보내지 않는다(이미 반려되어 이 요청과
 * 무관하다고 통지받았기 때문).
 *
 * @param moveRequestId 취소되는 MoveRequest.id
 * @param status 대상 Quote.status(PROPOSED 또는 CONFIRMED)
 * @param client 현재 transaction client
 * @returns quoteId·moverUserId 목록(대상이 없으면 빈 배열)
 * @sideeffect PostgreSQL 읽기 쿼리를 실행합니다.
 */
export async function findQuoteRecipientsByMoveRequestIdAndStatus(
  moveRequestId: string,
  status: QuoteStatus,
  client: PrismaClientOrTx = prisma,
): Promise<QuoteRecipientRecord[]> {
  const quotes = await client.quote.findMany({
    where: { moveRequestId, status },
    select: {
      id: true,
      mover: { select: { userId: true } },
    },
  });

  return quotes.map((quote) => ({
    quoteId: quote.id,
    moverUserId: quote.mover.userId,
  }));
}

/** MOVE_REQUEST_CANCELED 또는 CONFIRMED_MOVE_CANCELED 알림으로 저장한 내용입니다. */
export interface CreatedMoveRequestCancelNotificationRecord {
  userId: string;
  moveRequestId: string;
  quoteId: string;
  type: "MOVE_REQUEST_CANCELED" | "CONFIRMED_MOVE_CANCELED";
  title: string;
  content: string;
}

/**
 * 고객이 이사 요청을 삭제(취소)할 때, 그 요청에 견적을 보낸 기사님들에게 취소 알림을
 * 일괄 생성합니다.
 *
 * 반드시 `deleteMoveRequestById`로 MoveRequest를 지우기 **전에** 호출해야 합니다.
 * Notification.moveRequestId/quoteId는 MoveRequest/Quote를 참조하는 FK이므로, 참조 대상이
 * 아직 존재할 때 insert해야 제약을 통과할 수 있습니다. 이후 같은 transaction 안에서
 * MoveRequest가 삭제되면(Quote까지 cascade 삭제) `onDelete: SetNull` 설정에 따라 이미 생성된
 * 이 알림 row들의 moveRequestId/quoteId는 트랜잭션 안에서 즉시 NULL로 바뀐다 — title/content
 * 문구는 이 시점 값 그대로 저장되어 있으므로 알림 내용 자체는 보존되며, SSE push는 이 함수가
 * 반환한 값(삭제 전 실제 id)을 그대로 사용한다.
 *
 * `reason`으로 문구를 다르게 쓴다. 고객이 직접 삭제(WAITING만 가능, `move-request.service.ts`의
 * `deleteMoveRequestForCustomer`)했는데 "계정을 탈퇴하여"라고 말하면 사실과 달라 부자연스럽다는
 * 사용자 피드백으로 나뉘었다 — 실제로 계정을 탈퇴한 경우(`auth.service.ts`의 `withdrawAccount`,
 * WAITING/CONFIRMED 둘 다 가능)에만 그 표현을 쓴다.
 *
 * @param transaction 현재 transaction client
 * @param input 알림 유형, 취소 사유, 대상 MoveRequest.id, 알림 문구에 넣을 고객 이름, 받을 기사님 목록
 * @returns 저장한 알림 내용 목록(0건일 수 있음). Service가 transaction 커밋 이후 각 항목을 SSE push한다.
 * @sideeffect recipients 수만큼 Notification 레코드를 생성합니다.
 */
export async function createMoveRequestCancelNotifications(
  transaction: Prisma.TransactionClient,
  input: {
    type: "MOVE_REQUEST_CANCELED" | "CONFIRMED_MOVE_CANCELED";
    reason: "DIRECT_DELETE" | "WITHDRAWAL";
    moveRequestId: string;
    customerName: string;
    recipients: QuoteRecipientRecord[];
  },
): Promise<CreatedMoveRequestCancelNotificationRecord[]> {
  if (input.recipients.length === 0) {
    return [];
  }

  const isWaitingCancel = input.type === "MOVE_REQUEST_CANCELED";
  const isWithdrawal = input.reason === "WITHDRAWAL";
  const title = isWaitingCancel
    ? "견적 요청이 취소되었습니다."
    : "확정된 이사가 취소되었습니다.";
  const content = isWaitingCancel
    ? isWithdrawal
      ? `${input.customerName} 고객님이 계정을 탈퇴하여 보내주신 견적 요청이 취소되었습니다.`
      : `${input.customerName} 고객님이 보내주신 견적 요청을 취소했습니다.`
    // CONFIRMED 취소는 현재 withdrawAccount 경로로만 도달한다(직접 삭제는 WAITING만 허용해
    // move-request.service.ts가 CONFIRMED를 409로 거절한다) — 그래서 reason 분기 없이 항상
    // 탈퇴 문구를 쓴다. 이 전제가 바뀌면(예: 다른 사유의 CONFIRMED 취소가 생기면) 여기도 분기해야 한다.
    : `${input.customerName} 고객님이 계정을 탈퇴하여 확정된 이사 일정이 취소되었습니다.`;

  const notifications: CreatedMoveRequestCancelNotificationRecord[] = input.recipients.map(
    (recipient) => ({
      userId: recipient.moverUserId,
      moveRequestId: input.moveRequestId,
      quoteId: recipient.quoteId,
      type: input.type,
      title,
      content,
    }),
  );

  await transaction.notification.createMany({
    data: notifications,
  });

  return notifications;
}

/**
 * 삭제할 MoveRequest에 걸린 RequestRejection(기사님이 남긴 반려 기록)을 먼저 지웁니다.
 *
 * `RequestRejection.moveRequestId` FK는 `ON DELETE RESTRICT`로 걸려 있어(Prisma schema에
 * onDelete를 지정하지 않은 필수 관계의 기본값), 반려 기록이 남아 있는 상태로 MoveRequest를
 * 바로 지우면 Postgres가 참조 무결성 위반으로 삭제 자체를 막는다. DesignatedRequest/Quote/
 * Review처럼 CASCADE가 걸린 다른 자식 테이블과 달리 이 테이블만 명시적으로 먼저 지워야
 * `deleteMoveRequestById`가 안전하게 성공한다.
 *
 * @param moveRequestId 삭제할 MoveRequest.id
 * @param client 현재 transaction client
 * @sideeffect 해당 moveRequestId의 RequestRejection row를 모두 삭제합니다.
 */
export function deleteRequestRejectionsByMoveRequestId(
  moveRequestId: string,
  client: PrismaClientOrTx = prisma,
): Promise<Prisma.BatchPayload> {
  return client.requestRejection.deleteMany({ where: { moveRequestId } });
}

/**
 * MoveRequest row를 실제로 삭제합니다(hard delete).
 *
 * DesignatedRequest/Quote/Review는 schema의 `onDelete: Cascade`로 함께 삭제되고,
 * Notification.moveRequestId/quoteId는 `onDelete: SetNull`로 참조만 끊긴 채 알림 row 자체는
 * 남는다. RequestRejection은 `ON DELETE RESTRICT`라서 이 함수를 호출하기 전에
 * `deleteRequestRejectionsByMoveRequestId`로 먼저 지워야 한다(호출부인 Service가 순서를
 * 보장한다).
 *
 * @param id 삭제할 MoveRequest.id(호출 전 소유권·상태 검증이 끝난 값)
 * @param client 현재 transaction client
 * @sideeffect MoveRequest row와 그 자식(DesignatedRequest/Quote/Review)을 삭제합니다.
 */
export function deleteMoveRequestById(
  id: string,
  client: PrismaClientOrTx = prisma,
): Promise<{ id: string }> {
  return client.moveRequest.delete({ where: { id }, select: { id: true } });
}
