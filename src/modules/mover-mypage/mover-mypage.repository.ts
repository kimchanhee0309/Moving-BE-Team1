/** 기사님 마이페이지 조회·기본정보 수정에 필요한 Prisma 작업입니다. */
import type { Prisma } from "../../generated/prisma/client";
import { QuoteStatus } from "../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";

const moverMyPageSelect = {
  id: true,
  profileImageUrl: true,
  nickname: true,
  careerYears: true,
  shortIntroduction: true,
  description: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
    },
  },
  serviceTypes: {
    select: { serviceType: { select: { name: true } } },
  },
  regions: {
    select: { region: { select: { name: true } } },
  },
  _count: {
    select: {
      favorites: true,
      quotes: { where: { status: QuoteStatus.CONFIRMED } },
    },
  },
} satisfies Prisma.MoverSelect;

const moverBasicInfoForUpdateSelect = {
  id: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      passwordHash: true,
    },
  },
} satisfies Prisma.MoverSelect;

export type MoverMyPageRecord = Prisma.MoverGetPayload<{
  select: typeof moverMyPageSelect;
}>;

export type MoverBasicInfoForUpdateRecord = Prisma.MoverGetPayload<{
  select: typeof moverBasicInfoForUpdateSelect;
}>;

export interface MoverRatingGroupRecord {
  rating: number;
  count: number;
}

export type MoverMyPageTransaction = Prisma.TransactionClient;

export function runMoverMyPageTransaction<T>(
  operation: (transaction: MoverMyPageTransaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(operation);
}

export function findMoverMyPageById(
  moverId: string,
): Promise<MoverMyPageRecord | null> {
  return prisma.mover.findUnique({
    where: { id: moverId },
    select: moverMyPageSelect,
  });
}

/** 평균과 분포가 동일한 리뷰 집합을 사용하도록 평점별 count를 한 번에 집계합니다. */
export async function findMoverRatingGroups(
  moverId: string,
): Promise<MoverRatingGroupRecord[]> {
  const groups = await prisma.review.groupBy({
    by: ["rating"],
    where: { moverId },
    _count: { _all: true },
  });

  return groups.map((group) => ({
    rating: group.rating,
    count: group._count._all,
  }));
}

export function findMoverBasicInfoForUpdate(
  moverId: string,
): Promise<MoverBasicInfoForUpdateRecord | null> {
  return prisma.mover.findUnique({
    where: { id: moverId },
    select: moverBasicInfoForUpdateSelect,
  });
}

export function findMoverBasicInfoInTransaction(
  transaction: MoverMyPageTransaction,
  moverId: string,
): Promise<MoverBasicInfoForUpdateRecord | null> {
  return transaction.mover.findUnique({
    where: { id: moverId },
    select: moverBasicInfoForUpdateSelect,
  });
}

export function findOtherUserByEmail(
  transaction: MoverMyPageTransaction,
  email: string,
  userId: string,
): Promise<{ id: string } | null> {
  return transaction.user.findFirst({
    where: { email, id: { not: userId } },
    select: { id: true },
  });
}

export function findOtherUserByPhone(
  transaction: MoverMyPageTransaction,
  phone: string,
  userId: string,
): Promise<{ id: string } | null> {
  return transaction.user.findFirst({
    where: { phone, id: { not: userId } },
    select: { id: true },
  });
}

export function updateMoverUser(
  transaction: MoverMyPageTransaction,
  userId: string,
  data: {
    name?: string;
    email?: string;
    phone?: string | null;
    passwordHash?: string;
  },
): Promise<{ id: string }> {
  return transaction.user.update({
    where: { id: userId },
    data,
    select: { id: true },
  });
}

/** 비교한 기존 hash가 그대로일 때만 비밀번호를 변경합니다. */
export function updateMoverUserWithPasswordMatch(
  transaction: MoverMyPageTransaction,
  userId: string,
  expectedPasswordHash: string,
  data: {
    name?: string;
    email?: string;
    phone?: string | null;
    passwordHash: string;
  },
): Promise<{ count: number }> {
  return transaction.user.updateMany({
    where: { id: userId, passwordHash: expectedPasswordHash },
    data,
  });
}
