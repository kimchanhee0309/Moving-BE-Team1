/**
 * Customer Profile의 User·Customer·Region·ServiceType 영속성 작업을 Prisma로 수행합니다.
 * HTTP 검증과 인증 토큰 처리는 담당하지 않으며 Service가 전달한 값만 transaction 안에서 저장합니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

const customerProfileUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
} satisfies Prisma.UserSelect;

const customerProfileSelect = {
  id: true,
  profileImageUrl: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: customerProfileUserSelect,
  },
  region: { select: { id: true, name: true } },
  serviceTypes: {
    select: { serviceType: { select: { id: true, name: true } } },
  },
} satisfies Prisma.CustomerSelect;

const customerProfileWithPasswordSelect = {
  ...customerProfileSelect,
  user: {
    select: {
      ...customerProfileUserSelect,
      passwordHash: true,
    },
  },
} satisfies Prisma.CustomerSelect;

const profileCreationUserSelect = {
  id: true,
  role: true,
  customer: { select: { id: true } },
} satisfies Prisma.UserSelect;

/** Service가 공개 DTO로 변환할 Customer와 필수 관계 조회 결과입니다. */
export type CustomerProfileRecord = Prisma.CustomerGetPayload<{
  select: typeof customerProfileSelect;
}>;

/** 비밀번호 변경 판단에 한해서만 passwordHash를 추가 조회한 profile 결과입니다. */
export type CustomerProfileWithPasswordRecord = Prisma.CustomerGetPayload<{
  select: typeof customerProfileWithPasswordSelect;
}>;

/** 최초 생성 전 User 역할과 profile 존재 여부를 확인하는 조회 결과입니다. */
export type ProfileCreationUserRecord = Prisma.UserGetPayload<{
  select: typeof profileCreationUserSelect;
}>;

/** Customer Profile의 원자적 쓰기에만 전달하는 Prisma transaction client입니다. */
export type CustomerProfileTransaction = Prisma.TransactionClient;

/** 여러 profile 쓰기를 원자적으로 실행하며 실패하면 Prisma가 전체 변경을 rollback합니다. */
export function runCustomerProfileTransaction<T>(
  operation: (transaction: CustomerProfileTransaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(operation);
}

/** profile 생성 전 인증 User의 역할과 기존 Customer 존재 여부를 transaction 안에서 조회합니다. */
export function findUserForCustomerProfileCreation(
  transaction: CustomerProfileTransaction,
  userId: string,
): Promise<ProfileCreationUserRecord | null> {
  return transaction.user.findUnique({
    where: { id: userId },
    select: profileCreationUserSelect,
  });
}

/** API 지역명에서 변환된 seed 이름으로 Region을 조회합니다. */
export function findRegionByName(
  transaction: CustomerProfileTransaction,
  name: string,
): Promise<{ id: string; name: string } | null> {
  return transaction.region.findUnique({ where: { name }, select: { id: true, name: true } });
}

/** 요청된 서비스 유형들이 seed에 모두 존재하는지 확인할 최소 정보만 조회합니다. */
export function findServiceTypesByNames(
  transaction: CustomerProfileTransaction,
  names: string[],
): Promise<Array<{ id: string; name: string }>> {
  return transaction.serviceType.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });
}

/** 인증 User와 검증된 참조 ID로 Customer 및 연결 서비스 유형을 한 번에 생성합니다. */
export function createCustomerProfileRecord(
  transaction: CustomerProfileTransaction,
  data: {
    userId: string;
    regionId: string;
    profileImageUrl: string | null;
    serviceTypeIds: string[];
  },
): Promise<CustomerProfileRecord> {
  return transaction.customer.create({
    data: {
      userId: data.userId,
      regionId: data.regionId,
      profileImageUrl: data.profileImageUrl,
      serviceTypes: {
        create: data.serviceTypeIds.map((serviceTypeId) => ({ serviceTypeId })),
      },
    },
    select: customerProfileSelect,
  });
}

/** profiled guard가 확정한 Customer ID로 공개 응답에 필요한 관계를 조회합니다. */
export function findCustomerProfileById(customerId: string): Promise<CustomerProfileRecord | null> {
  return prisma.customer.findUnique({ where: { id: customerId }, select: customerProfileSelect });
}

/** 비밀번호 변경 가능 여부와 현재 비밀번호 비교가 필요한 PATCH 경로에서만 hash를 조회합니다. */
export function findCustomerProfileForUpdate(
  customerId: string,
): Promise<CustomerProfileWithPasswordRecord | null> {
  return prisma.customer.findUnique({
    where: { id: customerId },
    select: customerProfileWithPasswordSelect,
  });
}

/** 수정 transaction 안에서 최신 profile과 비밀번호 hash를 다시 조회합니다. */
export function findCustomerProfileByIdInTransaction(
  transaction: CustomerProfileTransaction,
  customerId: string,
): Promise<CustomerProfileRecord | null> {
  return transaction.customer.findUnique({
    where: { id: customerId },
    select: customerProfileSelect,
  });
}

/** 본인을 제외한 이메일 중복을 확인합니다. */
export function findOtherUserByEmail(
  transaction: CustomerProfileTransaction,
  email: string,
  userId: string,
): Promise<{ id: string } | null> {
  return transaction.user.findFirst({
    where: { email, id: { not: userId } },
    select: { id: true },
  });
}

/** 본인을 제외한 전화번호 중복을 확인합니다. */
export function findOtherUserByPhone(
  transaction: CustomerProfileTransaction,
  phone: string,
  userId: string,
): Promise<{ id: string } | null> {
  return transaction.user.findFirst({
    where: { phone, id: { not: userId } },
    select: { id: true },
  });
}

/** 검증과 중복 확인이 끝난 User 필드만 변경하며 전달되지 않은 값은 유지합니다. */
export function updateCustomerUser(
  transaction: CustomerProfileTransaction,
  userId: string,
  data: {
    name?: string;
    email?: string;
    phone?: string | null;
    passwordHash?: string;
  },
): Promise<{ id: string }> {
  return transaction.user.update({ where: { id: userId }, data, select: { id: true } });
}

/**
 * 비밀번호 변경 시 조회했던 기존 hash가 아직 같은 User만 원자적으로 갱신합니다.
 * count가 0이면 Service가 동시 변경 또는 오래된 비밀번호 확인으로 판단해 transaction을 중단합니다.
 */
export function updateCustomerUserWithPasswordMatch(
  transaction: CustomerProfileTransaction,
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

/** 검증된 지역 또는 새 이미지가 있을 때 Customer 본체만 변경합니다. */
export function updateCustomerRecord(
  transaction: CustomerProfileTransaction,
  customerId: string,
  data: { regionId?: string; profileImageUrl?: string },
): Promise<{ id: string }> {
  return transaction.customer.update({
    where: { id: customerId },
    data,
    select: { id: true },
  });
}

/** 서비스 유형 수정은 기존 연결을 지운 뒤 검증된 전체 목록으로 교체합니다. */
export async function replaceCustomerServiceTypes(
  transaction: CustomerProfileTransaction,
  customerId: string,
  serviceTypeIds: string[],
): Promise<void> {
  await transaction.customerServiceType.deleteMany({ where: { customerId } });
  await transaction.customerServiceType.createMany({
    data: serviceTypeIds.map((serviceTypeId) => ({ customerId, serviceTypeId })),
  });
}
