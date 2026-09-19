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
  updateCustomerUserWithPasswordMatch: jest.fn(),
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
  updateCustomerUserWithPasswordMatch,
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
    const oauthProfile = {
      ...emailProfile,
      user: { ...emailProfile.user, passwordHash: null },
    };
    jest.mocked(findCustomerProfileForUpdate).mockResolvedValue(oauthProfile);
    jest.mocked(findCustomerProfileByIdInTransaction).mockResolvedValue(oauthProfile);

    await expect(
      updateCustomerProfile("customer-id", {
        currentPassword: "Current1!",
        newPassword: "Changed1!",
      }),
    ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_NOT_AVAILABLE", status: 409 });

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(runCustomerProfileTransaction).toHaveBeenCalledTimes(1);
  });

  test("OAuth 계정의 이메일 변경을 409로 거절한다", async () => {
    const oauthProfile = {
      ...emailProfile,
      user: { ...emailProfile.user, passwordHash: null },
    };
    jest.mocked(findCustomerProfileForUpdate).mockResolvedValue(oauthProfile);
    jest.mocked(findCustomerProfileByIdInTransaction).mockResolvedValue(oauthProfile);

    await expect(
      updateCustomerProfile("customer-id", { email: "new@example.com" }),
    ).rejects.toMatchObject({
      code: "OAUTH_EMAIL_CHANGE_NOT_AVAILABLE",
      status: 409,
    });

    expect(runCustomerProfileTransaction).toHaveBeenCalledTimes(1);
  });

  test("검증 이후 기존 hash가 바뀐 비밀번호 변경 요청을 transaction에서 거절한다", async () => {
    jest.mocked(findCustomerProfileForUpdate).mockResolvedValue(emailProfile);
    jest.mocked(findCustomerProfileByIdInTransaction).mockResolvedValueOnce(emailProfile);
    jest.mocked(bcrypt.compare).mockImplementation(() => Promise.resolve(true));
    jest.mocked(bcrypt.hash).mockImplementation(() => Promise.resolve("new-bcrypt-hash"));
    jest.mocked(updateCustomerUserWithPasswordMatch).mockResolvedValue({ count: 0 });

    await expect(
      updateCustomerProfile("customer-id", {
        currentPassword: "Current1!",
        newPassword: "Changed1!",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CURRENT_PASSWORD",
      status: 401,
    });

    expect(updateCustomerUserWithPasswordMatch).toHaveBeenCalledWith(
      transaction,
      "user-id",
      "bcrypt-hash",
      { passwordHash: "new-bcrypt-hash" },
    );
    expect(updateCustomerUser).not.toHaveBeenCalled();
  });

  test("이메일 변경에서 현재 비밀번호를 생략하면 최신 profile 확인 후 거절한다", async () => {
    jest.mocked(findCustomerProfileForUpdate).mockResolvedValue(emailProfile);
    jest.mocked(findCustomerProfileByIdInTransaction).mockResolvedValue(emailProfile);

    await expect(
      updateCustomerProfile("customer-id", {
        email: "new@example.com",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      details: [expect.objectContaining({ field: "currentPassword" })],
    });

    expect(runCustomerProfileTransaction).toHaveBeenCalledTimes(1);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test("민감정보 변경 없이 전달된 현재 비밀번호를 검증 오류로 거절한다", async () => {
    jest.mocked(findCustomerProfileForUpdate).mockResolvedValue(emailProfile);
    jest.mocked(findCustomerProfileByIdInTransaction).mockResolvedValue(emailProfile);

    await expect(
      updateCustomerProfile("customer-id", {
        region: "경기",
        currentPassword: "Wrong1!",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      details: [expect.objectContaining({
        field: "currentPassword",
        reason: "현재 비밀번호는 이메일 또는 비밀번호를 변경할 때만 입력할 수 있습니다.",
      })],
    });

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(updateCustomerRecord).not.toHaveBeenCalled();
  });

  test("트랜잭션 전에는 같던 이메일이 최신 profile과 다르면 현재 비밀번호를 요구한다", async () => {
    jest.mocked(findCustomerProfileForUpdate).mockResolvedValue(emailProfile);
    jest.mocked(findCustomerProfileByIdInTransaction).mockResolvedValue({
      ...emailProfile,
      user: { ...emailProfile.user, email: "concurrent@example.com" },
    });

    await expect(
      updateCustomerProfile("customer-id", { email: "customer@example.com" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: [expect.objectContaining({ field: "currentPassword" })],
    });

    expect(updateCustomerUser).not.toHaveBeenCalled();
  });

  test("현재 비밀번호는 트랜잭션 안에서 조회한 최신 hash로 비교한다", async () => {
    jest.mocked(findCustomerProfileForUpdate).mockResolvedValue(emailProfile);
    jest.mocked(findCustomerProfileByIdInTransaction).mockResolvedValue({
      ...emailProfile,
      user: { ...emailProfile.user, passwordHash: "latest-hash" },
    });
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      updateCustomerProfile("customer-id", {
        email: "new@example.com",
        currentPassword: "Current1!",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CURRENT_PASSWORD", status: 401 });

    expect(bcrypt.compare).toHaveBeenCalledWith("Current1!", "latest-hash");
    expect(updateCustomerUserWithPasswordMatch).not.toHaveBeenCalled();
  });

  test("이메일 변경은 현재 비밀번호를 확인하고 기존 hash를 유지한다", async () => {
    jest.mocked(findCustomerProfileForUpdate).mockResolvedValue(emailProfile);
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
    jest.mocked(updateCustomerUserWithPasswordMatch).mockResolvedValue({ count: 1 });
    jest.mocked(findCustomerProfileByIdInTransaction)
      .mockResolvedValueOnce(emailProfile)
      .mockResolvedValueOnce({
        ...emailProfile,
        user: { ...emailProfile.user, email: "new@example.com" },
      });

    await expect(
      updateCustomerProfile("customer-id", {
        email: "new@example.com",
        currentPassword: "Current1!",
      }),
    ).resolves.toMatchObject({ email: "new@example.com" });

    expect(bcrypt.compare).toHaveBeenCalledWith("Current1!", "bcrypt-hash");
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(updateCustomerUserWithPasswordMatch).toHaveBeenCalledWith(
      transaction,
      "user-id",
      "bcrypt-hash",
      { email: "new@example.com", passwordHash: "bcrypt-hash" },
    );
  });

  test("서비스·지역 프로필 정보는 현재 비밀번호 없이 수정한다", async () => {
    jest.mocked(findCustomerProfileForUpdate).mockResolvedValue(emailProfile);
    jest.mocked(findRegionByName).mockResolvedValue({
      id: "region-gyeonggi",
      name: "GYEONGGI",
    });
    jest.mocked(findCustomerProfileByIdInTransaction)
      .mockResolvedValueOnce(emailProfile)
      .mockResolvedValueOnce(emailProfile);

    await expect(
      updateCustomerProfile("customer-id", {
        region: "경기",
      }),
    ).resolves.toBeDefined();

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(updateCustomerUserWithPasswordMatch).not.toHaveBeenCalled();
    expect(updateCustomerRecord).toHaveBeenCalledWith(
      transaction,
      "customer-id",
      { regionId: "region-gyeonggi" },
    );
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
