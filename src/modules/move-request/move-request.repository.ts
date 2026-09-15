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

export function findServiceTypeIdByName(
  name: ServiceTypeName,
  client: PrismaClientOrTx = prisma,
): Promise<{ id: string } | null> {
  return client.serviceType.findUnique({
    where: { name },
    select: { id: true },
  });
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
