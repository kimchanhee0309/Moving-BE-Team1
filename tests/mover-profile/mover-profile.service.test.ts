/**
 * Mover Profile Service의 transaction 생성·수정, 중복, 기준 데이터와 이미지 교체 규칙을 검증합니다.
 * Prisma와 로컬 파일 삭제는 mock으로 격리하여 실제 DB·파일 상태를 변경하지 않습니다.
 */
jest.mock("../../src/modules/mover-profile/mover-profile.image", () => ({
  removeReplacedMoverProfileImage: jest.fn(),
}));

jest.mock("../../src/modules/mover-profile/mover-profile.repository", () => ({
  createMoverProfileRecord: jest.fn(),
  findMoverProfileById: jest.fn(),
  findMoverProfileByIdInTransaction: jest.fn(),
  findMoverRegionsByNames: jest.fn(),
  findMoverServiceTypesByNames: jest.fn(),
  findOtherMoverByNickname: jest.fn(),
  findUserForMoverProfileCreation: jest.fn(),
  replaceMoverRegions: jest.fn(),
  replaceMoverServiceTypes: jest.fn(),
  runMoverProfileTransaction: jest.fn(),
  updateMoverProfileRecord: jest.fn(),
}));

import { removeReplacedMoverProfileImage } from "../../src/modules/mover-profile/mover-profile.image";
import type { CreateMoverProfileRequestDto } from "../../src/modules/mover-profile/mover-profile.dto";
import type {
  MoverProfileRecord,
  MoverProfileTransaction,
} from "../../src/modules/mover-profile/mover-profile.repository";
import {
  createMoverProfileRecord,
  findMoverProfileById,
  findMoverProfileByIdInTransaction,
  findMoverRegionsByNames,
  findMoverServiceTypesByNames,
  findOtherMoverByNickname,
  findUserForMoverProfileCreation,
  replaceMoverRegions,
  replaceMoverServiceTypes,
  runMoverProfileTransaction,
  updateMoverProfileRecord,
} from "../../src/modules/mover-profile/mover-profile.repository";
import {
  createMoverProfile,
  getMoverProfile,
  updateMoverProfile,
} from "../../src/modules/mover-profile/mover-profile.service";

const transaction = {} as MoverProfileTransaction;
const createdAt = new Date("2026-09-16T00:00:00.000Z");
const updatedAt = new Date("2026-09-16T01:00:00.000Z");

const moverProfile: MoverProfileRecord = {
  id: "mover-id",
  profileImageUrl: "/uploads/mover-profiles/00000000-0000-0000-0000-000000000000.jpg",
  nickname: "김코드",
  careerYears: 8,
  shortIntroduction: "꼼꼼한 이사",
  description: "안전하게 운송합니다.",
  createdAt,
  updatedAt,
  serviceTypes: [
    { serviceType: { id: "service-home", name: "HOME" } },
    { serviceType: { id: "service-small", name: "SMALL" } },
  ],
  regions: [
    { region: { id: "region-gyeonggi", name: "GYEONGGI" } },
    { region: { id: "region-seoul", name: "SEOUL" } },
  ],
};

const createInput: CreateMoverProfileRequestDto = {
  profileImageUrl: null,
  nickname: "김코드",
  careerYears: 8,
  shortIntroduction: "꼼꼼한 이사",
  description: "안전하게 운송합니다.",
  serviceTypes: ["SMALL", "HOME"],
  regions: ["서울", "경기"],
};

describe("Mover Profile service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(runMoverProfileTransaction).mockImplementation((operation) =>
      operation(transaction),
    );
    jest.mocked(findOtherMoverByNickname).mockResolvedValue(null);
  });

  test("MOVER User에 profile과 서비스·지역 연결을 transaction으로 생성한다", async () => {
    jest.mocked(findUserForMoverProfileCreation).mockResolvedValue({
      id: "user-id",
      role: "MOVER",
      mover: null,
    });
    jest.mocked(findMoverServiceTypesByNames).mockResolvedValue([
      { id: "service-small", name: "SMALL" },
      { id: "service-home", name: "HOME" },
    ]);
    jest.mocked(findMoverRegionsByNames).mockResolvedValue([
      { id: "region-seoul", name: "SEOUL" },
      { id: "region-gyeonggi", name: "GYEONGGI" },
    ]);
    jest.mocked(createMoverProfileRecord).mockResolvedValue(moverProfile);

    await expect(createMoverProfile("user-id", createInput)).resolves.toEqual({
      id: "mover-id",
      profileImageUrl: moverProfile.profileImageUrl,
      nickname: "김코드",
      careerYears: 8,
      shortIntroduction: "꼼꼼한 이사",
      description: "안전하게 운송합니다.",
      serviceTypes: ["SMALL", "HOME"],
      regions: ["서울", "경기"],
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });

    expect(createMoverProfileRecord).toHaveBeenCalledWith(transaction, {
      userId: "user-id",
      profileImageUrl: null,
      nickname: "김코드",
      careerYears: 8,
      shortIntroduction: "꼼꼼한 이사",
      description: "안전하게 운송합니다.",
      serviceTypeIds: ["service-small", "service-home"],
      regionIds: ["region-seoul", "region-gyeonggi"],
    });
  });

  test("이미 profile relation이 있으면 중복 생성을 409로 거절한다", async () => {
    jest.mocked(findUserForMoverProfileCreation).mockResolvedValue({
      id: "user-id",
      role: "MOVER",
      mover: { id: "mover-id" },
    });

    await expect(createMoverProfile("user-id", createInput)).rejects.toMatchObject({
      code: "MOVER_PROFILE_ALREADY_EXISTS",
      status: 409,
    });

    expect(createMoverProfileRecord).not.toHaveBeenCalled();
  });

  test("다른 Mover가 사용하는 닉네임은 409로 거절한다", async () => {
    jest.mocked(findUserForMoverProfileCreation).mockResolvedValue({
      id: "user-id",
      role: "MOVER",
      mover: null,
    });
    jest.mocked(findOtherMoverByNickname).mockResolvedValue({ id: "other-mover" });

    await expect(createMoverProfile("user-id", createInput)).rejects.toMatchObject({
      code: "NICKNAME_ALREADY_EXISTS",
      status: 409,
    });
  });

  test("서비스 유형 또는 지역 기준 데이터가 누락되면 transaction을 중단한다", async () => {
    jest.mocked(findUserForMoverProfileCreation).mockResolvedValue({
      id: "user-id",
      role: "MOVER",
      mover: null,
    });
    jest.mocked(findMoverServiceTypesByNames).mockResolvedValue([
      { id: "service-small", name: "SMALL" },
    ]);

    await expect(createMoverProfile("user-id", createInput)).rejects.toMatchObject({
      code: "PROFILE_REFERENCE_DATA_NOT_FOUND",
    });

    expect(createMoverProfileRecord).not.toHaveBeenCalled();
  });

  test("공개 DTO는 관계 ID와 내부 필드 없이 정렬된 값만 반환한다", async () => {
    jest.mocked(findMoverProfileById).mockResolvedValue(moverProfile);

    const result = await getMoverProfile("mover-id");

    expect(result.serviceTypes).toEqual(["SMALL", "HOME"]);
    expect(result.regions).toEqual(["서울", "경기"]);
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("passwordHash");
  });

  test("수정 성공 후 교체된 이전 이미지를 정리하고 연결 목록을 교체한다", async () => {
    const savedProfile = {
      ...moverProfile,
      profileImageUrl: "/uploads/mover-profiles/11111111-1111-1111-1111-111111111111.png",
      nickname: "새닉네임",
      serviceTypes: [{ serviceType: { id: "service-office", name: "OFFICE" } }],
      regions: [{ region: { id: "region-jeju", name: "JEJU" } }],
    } satisfies MoverProfileRecord;
    jest.mocked(findMoverProfileByIdInTransaction)
      .mockResolvedValueOnce(moverProfile)
      .mockResolvedValueOnce(savedProfile);
    jest.mocked(findMoverServiceTypesByNames).mockResolvedValue([
      { id: "service-office", name: "OFFICE" },
    ]);
    jest.mocked(findMoverRegionsByNames).mockResolvedValue([
      { id: "region-jeju", name: "JEJU" },
    ]);

    await expect(
      updateMoverProfile("mover-id", {
        nickname: "새닉네임",
        profileImageUrl: savedProfile.profileImageUrl ?? undefined,
        serviceTypes: ["OFFICE"],
        regions: ["제주"],
      }),
    ).resolves.toMatchObject({
      nickname: "새닉네임",
      serviceTypes: ["OFFICE"],
      regions: ["제주"],
    });

    expect(updateMoverProfileRecord).toHaveBeenCalledWith(
      transaction,
      "mover-id",
      {
        nickname: "새닉네임",
        profileImageUrl: savedProfile.profileImageUrl,
      },
    );
    expect(replaceMoverServiceTypes).toHaveBeenCalledWith(
      transaction,
      "mover-id",
      ["service-office"],
    );
    expect(replaceMoverRegions).toHaveBeenCalledWith(transaction, "mover-id", [
      "region-jeju",
    ]);
    expect(removeReplacedMoverProfileImage).toHaveBeenCalledWith(
      moverProfile.profileImageUrl,
    );
  });

  test("transaction 내부 저장 실패 시 이전 이미지를 삭제하지 않고 오류를 전파한다", async () => {
    jest.mocked(findMoverProfileByIdInTransaction).mockResolvedValue(moverProfile);
    jest.mocked(updateMoverProfileRecord).mockRejectedValue(new Error("write failed"));

    await expect(
      updateMoverProfile("mover-id", {
        profileImageUrl:
          "/uploads/mover-profiles/11111111-1111-1111-1111-111111111111.png",
      }),
    ).rejects.toThrow("write failed");

    expect(removeReplacedMoverProfileImage).not.toHaveBeenCalled();
  });
});
