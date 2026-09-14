/**
 * Customer Profile Service의 transaction 생성, OAuth 비밀번호 제한과 nullable phone 저장을 검증합니다.
 * Prisma·bcrypt·로컬 파일 삭제는 mock으로 격리하여 외부 상태를 변경하지 않습니다.
 */
jest.mock("bcrypt", () => ({
  __esModule: true,
  default: {
    compare: jest.fn(),
    hash: jest.fn(),
  },
}));

jest.mock("../../src/modules/customer-profile/customer-profile.image", () => ({
  removeReplacedLocalProfileImage: jest.fn(),
}));

jest.mock("../../src/modules/customer-profile/customer-profile.repository", () => ({
  createCustomerProfileRecord: jest.fn(),
  findCustomerProfileById: jest.fn(),
  findCustomerProfileByIdInTransaction: jest.fn(),
  findCustomerProfileForUpdate: jest.fn(),
  findOtherUserByEmail: jest.fn(),
  findOtherUserByPhone: jest.fn(),
  findRegionByName: jest.fn(),
  findServiceTypesByNames: jest.fn(),
  findUserForCustomerProfileCreation: jest.fn(),
  replaceCustomerServiceTypes: jest.fn(),
  runCustomerProfileTransaction: jest.fn(),
  updateCustomerRecord: jest.fn(),
  updateCustomerUser: jest.fn(),
}));

import bcrypt from "bcrypt";

import type {
  CustomerProfileWithPasswordRecord,
  CustomerProfileTransaction,
} from "../../src/modules/customer-profile/customer-profile.repository";
import {
  createCustomerProfileRecord,
  findCustomerProfileByIdInTransaction,
  findCustomerProfileForUpdate,
  findOtherUserByEmail,
  findOtherUserByPhone,
  findRegionByName,
  findServiceTypesByNames,
  findUserForCustomerProfileCreation,
  replaceCustomerServiceTypes,
  runCustomerProfileTransaction,
  updateCustomerRecord,
  updateCustomerUser,
} from "../../src/modules/customer-profile/customer-profile.repository";
import {
  createCustomerProfile,
  updateCustomerProfile,
} from "../../src/modules/customer-profile/customer-profile.service";

const transaction = {} as CustomerProfileTransaction;
const createdAt = new Date("2026-09-14T00:00:00.000Z");
const updatedAt = new Date("2026-09-14T01:00:00.000Z");

const emailProfile: CustomerProfileWithPasswordRecord = {
  id: "customer-id",
  profileImageUrl: null,
  createdAt,
  updatedAt,
  user: {
    id: "user-id",
    name: "홍길동",
    email: "customer@example.com",
    phone: "01012345678",
    role: "CUSTOMER",
    passwordHash: "bcrypt-hash",
  },
  region: { id: "region-id", name: "SEOUL" },
  serviceTypes: [
    { serviceType: { id: "service-home", name: "HOME" } },
    { serviceType: { id: "service-small", name: "SMALL" } },
  ],
};

describe("Customer Profile service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(runCustomerProfileTransaction).mockImplementation((operation) =>
      operation(transaction),
    );
    jest.mocked(findOtherUserByEmail).mockResolvedValue(null);
    jest.mocked(findOtherUserByPhone).mockResolvedValue(null);
  });

  test("CUSTOMER User에 지역과 서비스 연결을 transaction으로 생성한다", async () => {
    jest.mocked(findUserForCustomerProfileCreation).mockResolvedValue({
      id: "user-id",
      role: "CUSTOMER",
      customer: null,
    });
    jest.mocked(findRegionByName).mockResolvedValue({ id: "region-id", name: "SEOUL" });
    jest.mocked(findServiceTypesByNames).mockResolvedValue([
      { id: "service-small", name: "SMALL" },
      { id: "service-home", name: "HOME" },
    ]);
    jest.mocked(createCustomerProfileRecord).mockResolvedValue(emailProfile);

    await expect(
      createCustomerProfile("user-id", {
        profileImageUrl: null,
        region: "서울",
        serviceTypes: ["SMALL", "HOME"],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "customer-id",
        region: "서울",
        serviceTypes: ["SMALL", "HOME"],
      }),
    );

    expect(createCustomerProfileRecord).toHaveBeenCalledWith(transaction, {
      userId: "user-id",
      regionId: "region-id",
      profileImageUrl: null,
      serviceTypeIds: ["service-small", "service-home"],
    });
  });

  test("이미 profile relation이 있으면 중복 생성을 거절한다", async () => {
    jest.mocked(findUserForCustomerProfileCreation).mockResolvedValue({
      id: "user-id",
      role: "CUSTOMER",
      customer: { id: "customer-id" },
    });

    await expect(
      createCustomerProfile("user-id", {
        profileImageUrl: null,
        region: "서울",
        serviceTypes: ["SMALL"],
      }),
    ).rejects.toMatchObject({ code: "CUSTOMER_PROFILE_ALREADY_EXISTS" });
  });

  test("passwordHash가 없는 OAuth 계정의 비밀번호 변경을 409로 거절한다", async () => {
    jest.mocked(findCustomerProfileForUpdate).mockResolvedValue({
      ...emailProfile,
      user: { ...emailProfile.user, passwordHash: null },
    });

    await expect(
      updateCustomerProfile("customer-id", {
        currentPassword: "Current1!",
        newPassword: "Changed1!",
      }),
    ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_NOT_AVAILABLE", status: 409 });

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(runCustomerProfileTransaction).not.toHaveBeenCalled();
  });

  test("phone null을 User 변경에 전달하여 전화번호를 초기화한다", async () => {
    jest.mocked(findCustomerProfileForUpdate).mockResolvedValue(emailProfile);
    jest.mocked(findCustomerProfileByIdInTransaction)
      .mockResolvedValueOnce(emailProfile)
      .mockResolvedValueOnce({
        ...emailProfile,
        user: { ...emailProfile.user, phone: null },
      });

    await expect(
      updateCustomerProfile("customer-id", { phone: null }),
    ).resolves.toMatchObject({ phone: null });

    expect(updateCustomerUser).toHaveBeenCalledWith(transaction, "user-id", {
      phone: null,
    });
    expect(updateCustomerRecord).not.toHaveBeenCalled();
    expect(replaceCustomerServiceTypes).not.toHaveBeenCalled();
  });
});
