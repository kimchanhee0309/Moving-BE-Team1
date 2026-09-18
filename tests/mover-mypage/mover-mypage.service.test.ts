jest.mock("bcrypt", () => ({
  __esModule: true,
  default: {
    compare: jest.fn(),
    hash: jest.fn(),
  },
}));

jest.mock("../../src/modules/mover-mypage/mover-mypage.repository", () => ({
  findMoverBasicInfoForUpdate: jest.fn(),
  findMoverBasicInfoInTransaction: jest.fn(),
  findMoverMyPageById: jest.fn(),
  findMoverRatingGroups: jest.fn(),
  findOtherUserByEmail: jest.fn(),
  findOtherUserByPhone: jest.fn(),
  runMoverMyPageTransaction: jest.fn(),
  updateMoverUser: jest.fn(),
  updateMoverUserWithPasswordMatch: jest.fn(),
}));

import bcrypt from "bcrypt";

import {
  getMoverMyPage,
  updateMoverBasicInfo,
} from "../../src/modules/mover-mypage/mover-mypage.service";
import {
  findMoverBasicInfoForUpdate,
  findMoverBasicInfoInTransaction,
  findMoverMyPageById,
  findMoverRatingGroups,
  findOtherUserByEmail,
  findOtherUserByPhone,
  runMoverMyPageTransaction,
  updateMoverUser,
  updateMoverUserWithPasswordMatch,
} from "../../src/modules/mover-mypage/mover-mypage.repository";

const moverId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const transaction = {} as never;

const myPageRecord = {
  id: moverId,
  profileImageUrl: "/uploads/mover-profiles/image.jpg",
  nickname: "김코드",
  careerYears: 7,
  shortIntroduction: "안전한 이사를 돕습니다.",
  description: "상세 설명입니다.",
  user: {
    id: userId,
    name: "홍길동",
    email: "mover@example.com",
    phone: "01012345678",
  },
  serviceTypes: [
    { serviceType: { name: "HOME" } },
    { serviceType: { name: "SMALL" } },
  ],
  regions: [
    { region: { name: "GYEONGGI" } },
    { region: { name: "SEOUL" } },
  ],
  _count: { favorites: 4, quotes: 8 },
};

const basicRecord = {
  id: moverId,
  user: {
    id: userId,
    name: "홍길동",
    email: "mover@example.com",
    phone: "01012345678",
    passwordHash: "old-hash",
  },
};

describe("Mover My Page service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(runMoverMyPageTransaction).mockImplementation(async (operation) =>
      operation(transaction),
    );
    jest.mocked(findOtherUserByEmail).mockResolvedValue(null);
    jest.mocked(findOtherUserByPhone).mockResolvedValue(null);
    jest.mocked(updateMoverUser).mockResolvedValue({ id: userId });
    jest.mocked(updateMoverUserWithPasswordMatch).mockResolvedValue({ count: 1 });
  });

  test("프로필·활동 집계와 5~1점 분포를 공개 DTO로 반환한다", async () => {
    jest.mocked(findMoverMyPageById).mockResolvedValue(myPageRecord);
    jest.mocked(findMoverRatingGroups).mockResolvedValue([
      { rating: 5, count: 2 },
      { rating: 4, count: 1 },
    ]);

    const result = await getMoverMyPage(moverId);

    expect(result).toMatchObject({
      id: moverId,
      serviceTypes: ["SMALL", "HOME"],
      regions: ["서울", "경기"],
      confirmedCount: 8,
      favoriteCount: 4,
      reviewCount: 3,
      rating: 4.7,
    });
    expect(result.ratingCounts).toEqual([
      { score: 5, count: 2 },
      { score: 4, count: 1 },
      { score: 3, count: 0 },
      { score: 2, count: 0 },
      { score: 1, count: 0 },
    ]);
    expect(result).not.toHaveProperty("passwordHash");
  });

  test("리뷰가 없으면 평점 0과 빈 분포를 반환한다", async () => {
    jest.mocked(findMoverMyPageById).mockResolvedValue(myPageRecord);
    jest.mocked(findMoverRatingGroups).mockResolvedValue([]);

    const result = await getMoverMyPage(moverId);

    expect(result.rating).toBe(0);
    expect(result.reviewCount).toBe(0);
    expect(result.ratingCounts.every((item) => item.count === 0)).toBe(true);
  });

  test("프로필이 없으면 PROFILE_REQUIRED를 반환한다", async () => {
    jest.mocked(findMoverMyPageById).mockResolvedValue(null);
    jest.mocked(findMoverRatingGroups).mockResolvedValue([]);

    await expect(getMoverMyPage(moverId)).rejects.toEqual(
      expect.objectContaining({ status: 403, code: "PROFILE_REQUIRED" }),
    );
  });

  test("기본정보를 transaction에서 수정하고 민감정보 없이 반환한다", async () => {
    jest.mocked(findMoverBasicInfoForUpdate).mockResolvedValue(basicRecord);
    jest.mocked(findMoverBasicInfoInTransaction)
      .mockResolvedValueOnce(basicRecord)
      .mockResolvedValueOnce({
        ...basicRecord,
        user: { ...basicRecord.user, name: "새 이름", passwordHash: "old-hash" },
      });

    const result = await updateMoverBasicInfo(moverId, { name: "새 이름" });

    expect(updateMoverUser).toHaveBeenCalledWith(transaction, userId, {
      name: "새 이름",
    });
    expect(result).toEqual({
      name: "새 이름",
      email: "mover@example.com",
      phone: "01012345678",
    });
    expect(result).not.toHaveProperty("passwordHash");
  });

  test("OAuth 전용 계정의 비밀번호 변경을 거절한다", async () => {
    jest.mocked(findMoverBasicInfoForUpdate).mockResolvedValue({
      ...basicRecord,
      user: { ...basicRecord.user, passwordHash: null },
    });

    await expect(
      updateMoverBasicInfo(moverId, {
        currentPassword: "old-pass1!",
        newPassword: "new-pass2!",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        code: "PASSWORD_CHANGE_NOT_AVAILABLE",
      }),
    );
  });

  test("잘못된 현재 비밀번호를 거절한다", async () => {
    jest.mocked(findMoverBasicInfoForUpdate).mockResolvedValue(basicRecord);
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      updateMoverBasicInfo(moverId, {
        currentPassword: "wrong-pass1!",
        newPassword: "new-pass2!",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        code: "INVALID_CURRENT_PASSWORD",
      }),
    );
  });

  test("새 비밀번호 없이 기본정보를 수정해도 현재 비밀번호를 검증한다", async () => {
    jest.mocked(findMoverBasicInfoForUpdate).mockResolvedValue(basicRecord);
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
    jest.mocked(findMoverBasicInfoInTransaction)
      .mockResolvedValueOnce(basicRecord)
      .mockResolvedValueOnce({
        ...basicRecord,
        user: { ...basicRecord.user, name: "새 이름" },
      });

    await expect(
      updateMoverBasicInfo(moverId, {
        name: "새 이름",
        currentPassword: "old-pass1!",
      }),
    ).resolves.toMatchObject({ name: "새 이름" });

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(updateMoverUserWithPasswordMatch).toHaveBeenCalledWith(
      transaction,
      userId,
      "old-hash",
      { name: "새 이름", passwordHash: "old-hash" },
    );
    expect(updateMoverUser).not.toHaveBeenCalled();
  });

  test("비밀번호 hash가 동시에 바뀌면 전체 transaction을 중단한다", async () => {
    jest.mocked(findMoverBasicInfoForUpdate).mockResolvedValue(basicRecord);
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
    jest.mocked(bcrypt.hash).mockResolvedValue("new-hash" as never);
    jest.mocked(findMoverBasicInfoInTransaction).mockResolvedValue(basicRecord);
    jest.mocked(updateMoverUserWithPasswordMatch).mockResolvedValue({ count: 0 });

    await expect(
      updateMoverBasicInfo(moverId, {
        currentPassword: "old-pass1!",
        newPassword: "new-pass2!",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        code: "INVALID_CURRENT_PASSWORD",
      }),
    );
  });

  test("중복 이메일은 409로 거절한다", async () => {
    jest.mocked(findMoverBasicInfoForUpdate).mockResolvedValue(basicRecord);
    jest.mocked(findMoverBasicInfoInTransaction).mockResolvedValue(basicRecord);
    jest.mocked(findOtherUserByEmail).mockResolvedValue({ id: "other-user" });

    await expect(
      updateMoverBasicInfo(moverId, { email: "other@example.com" }),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        code: "EMAIL_ALREADY_EXISTS",
      }),
    );
  });
});
