/**
 * Mover Profile의 User·Mover·Region·ServiceType 영속성 작업을 Prisma로 수행합니다.
 * HTTP·파일·인증 처리는 담당하지 않으며 Service가 검증한 값만 transaction 안에서 저장합니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

const moverProfileSelect = {
  id: true,
  profileImageUrl: true,
  nickname: true,
  careerYears: true,
  shortIntroduction: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  serviceTypes: {
    select: { serviceType: { select: { id: true, name: true } } },
  },
  regions: {
    select: { region: { select: { id: true, name: true } } },
  },
} satisfies Prisma.MoverSelect;

const profileCreationUserSelect = {
  id: true,
  role: true,
  mover: { select: { id: true } },
} satisfies Prisma.UserSelect;

/** Service가 공개 DTO로 변환할 Mover와 필수 관계 조회 결과입니다. */
export type MoverProfileRecord = Prisma.MoverGetPayload<{
  select: typeof moverProfileSelect;
}>;

/** 최초 생성 전 User 역할과 기존 Mover 존재 여부를 확인하는 조회 결과입니다. */
export type MoverProfileCreationUserRecord = Prisma.UserGetPayload<{
  select: typeof profileCreationUserSelect;
}>;

/** Mover Profile 원자적 쓰기에서만 사용하는 Prisma transaction client입니다. */
export type MoverProfileTransaction = Prisma.TransactionClient;

/** 여러 Mover profile 쓰기를 원자적으로 실행하며 실패 시 전체 변경을 rollback합니다. */
export function runMoverProfileTransaction<T>(
  operation: (transaction: MoverProfileTransaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(operation);
}

/** profile 생성 전 인증 User의 역할과 기존 Mover relation을 조회합니다. */
export function findUserForMoverProfileCreation(
  transaction: MoverProfileTransaction,
  userId: string,
): Promise<MoverProfileCreationUserRecord | null> {
  return transaction.user.findUnique({
    where: { id: userId },
    select: profileCreationUserSelect,
  });
}

/** 요청된 서비스 유형의 기준 데이터가 모두 존재하는지 확인할 최소 필드를 조회합니다. */
export function findMoverServiceTypesByNames(
  transaction: MoverProfileTransaction,
  names: string[],
): Promise<Array<{ id: string; name: string }>> {
  return transaction.serviceType.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });
}

/** 요청된 활동 지역의 기준 데이터가 모두 존재하는지 확인할 최소 필드를 조회합니다. */
export function findMoverRegionsByNames(
  transaction: MoverProfileTransaction,
  names: string[],
): Promise<Array<{ id: string; name: string }>> {
  return transaction.region.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });
}

/** 본인 외의 Mover가 같은 닉네임을 사용하는지 transaction 안에서 확인합니다. */
export function findOtherMoverByNickname(
  transaction: MoverProfileTransaction,
  nickname: string,
  excludedMoverId?: string,
): Promise<{ id: string } | null> {
  return transaction.mover.findFirst({
    where: {
      nickname,
      ...(excludedMoverId !== undefined ? { id: { not: excludedMoverId } } : {}),
    },
    select: { id: true },
  });
}

/** 인증 User와 검증된 기준 데이터 ID로 Mover와 연결 테이블을 함께 생성합니다. */
export function createMoverProfileRecord(
  transaction: MoverProfileTransaction,
  data: {
    userId: string;
    profileImageUrl: string | null;
    nickname: string;
    careerYears: number;
    shortIntroduction: string;
    description: string;
    serviceTypeIds: string[];
    regionIds: string[];
  },
): Promise<MoverProfileRecord> {
  return transaction.mover.create({
    data: {
      userId: data.userId,
      profileImageUrl: data.profileImageUrl,
      nickname: data.nickname,
      careerYears: data.careerYears,
      shortIntroduction: data.shortIntroduction,
      description: data.description,
      serviceTypes: {
        create: data.serviceTypeIds.map((serviceTypeId) => ({ serviceTypeId })),
      },
      regions: {
        create: data.regionIds.map((regionId) => ({ regionId })),
      },
    },
    select: moverProfileSelect,
  });
}

/** profiled guard가 확정한 Mover ID로 공개 응답에 필요한 profile을 조회합니다. */
export function findMoverProfileById(
  moverId: string,
): Promise<MoverProfileRecord | null> {
  return prisma.mover.findUnique({
    where: { id: moverId },
    select: moverProfileSelect,
  });
}

/** 수정 transaction 안에서 최신 Mover profile을 다시 조회합니다. */
export function findMoverProfileByIdInTransaction(
  transaction: MoverProfileTransaction,
  moverId: string,
): Promise<MoverProfileRecord | null> {
  return transaction.mover.findUnique({
    where: { id: moverId },
    select: moverProfileSelect,
  });
}

/** 검증된 Mover 본체 필드만 수정하며 전달되지 않은 값은 유지합니다. */
export function updateMoverProfileRecord(
  transaction: MoverProfileTransaction,
  moverId: string,
  data: {
    profileImageUrl?: string;
    nickname?: string;
    careerYears?: number;
    shortIntroduction?: string;
    description?: string;
  },
): Promise<{ id: string }> {
  return transaction.mover.update({
    where: { id: moverId },
    data,
    select: { id: true },
  });
}

/** 서비스 유형 연결을 검증된 전체 목록으로 교체합니다. */
export async function replaceMoverServiceTypes(
  transaction: MoverProfileTransaction,
  moverId: string,
  serviceTypeIds: string[],
): Promise<void> {
  await transaction.moverServiceType.deleteMany({ where: { moverId } });
  await transaction.moverServiceType.createMany({
    data: serviceTypeIds.map((serviceTypeId) => ({ moverId, serviceTypeId })),
  });
}

/** 활동 지역 연결을 검증된 전체 목록으로 교체합니다. */
export async function replaceMoverRegions(
  transaction: MoverProfileTransaction,
  moverId: string,
  regionIds: string[],
): Promise<void> {
  await transaction.moverRegion.deleteMany({ where: { moverId } });
  await transaction.moverRegion.createMany({
    data: regionIds.map((regionId) => ({ moverId, regionId })),
  });
}
