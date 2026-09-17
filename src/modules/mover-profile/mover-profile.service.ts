/**
 * Mover Profile 생성·조회·수정의 역할, 중복, 기준 데이터와 transaction 규칙을 처리합니다.
 * Express·cookie·JWT와 User 기본정보 수정은 담당하지 않으며 공개 DTO만 반환합니다.
 */
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../../common/errors/app-error";
import {
  DB_NAME_TO_MOVER_REGION,
  MOVER_REGIONS,
  MOVER_REGION_TO_DB_NAME,
  MOVER_SERVICE_TYPES,
  isMoverRegion,
  isMoverServiceType,
  type MoverRegion,
  type MoverServiceType,
} from "./mover-profile.constants";
import type {
  CreateMoverProfileRequestDto,
  MoverProfileResponseDto,
  UpdateMoverProfileRequestDto,
} from "./mover-profile.dto";
import { removeReplacedMoverProfileImage } from "./mover-profile.image";
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
  type MoverProfileRecord,
  type MoverProfileTransaction,
} from "./mover-profile.repository";

interface MoverReferenceIds {
  serviceTypeIds?: string[];
  regionIds?: string[];
}

function isUniqueConstraintError(
  error: unknown,
): error is { code: "P2002"; meta?: unknown } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function getUniqueTarget(error: { meta?: unknown }): string {
  if (
    typeof error.meta !== "object" ||
    error.meta === null ||
    !("target" in error.meta)
  ) {
    return "";
  }

  const target = error.meta.target;
  return Array.isArray(target)
    ? target.join(",")
    : typeof target === "string"
      ? target
      : "";
}

function convertMoverUniqueConstraintError(error: unknown): never {
  if (!isUniqueConstraintError(error)) throw error;

  const target = getUniqueTarget(error);

  if (target.includes("nickname")) {
    throw new ConflictError("이미 사용 중인 닉네임입니다.", "NICKNAME_ALREADY_EXISTS");
  }

  throw new ConflictError(
    "이미 기사님 프로필이 등록되어 있습니다.",
    "MOVER_PROFILE_ALREADY_EXISTS",
  );
}

function toMoverProfileResponseDto(
  profile: MoverProfileRecord,
): MoverProfileResponseDto {
  const serviceTypes = profile.serviceTypes
    .map(({ serviceType }) => serviceType.name)
    .filter(isMoverServiceType)
    .sort(
      (left, right) =>
        MOVER_SERVICE_TYPES.indexOf(left) - MOVER_SERVICE_TYPES.indexOf(right),
    );

  const regions = profile.regions
    .map(({ region }) => DB_NAME_TO_MOVER_REGION[region.name])
    .filter((region): region is MoverRegion =>
      region !== undefined && isMoverRegion(region),
    )
    .sort(
      (left, right) => MOVER_REGIONS.indexOf(left) - MOVER_REGIONS.indexOf(right),
    );

  if (
    serviceTypes.length !== profile.serviceTypes.length ||
    regions.length !== profile.regions.length
  ) {
    throw new ConflictError(
      "프로필 기준 데이터가 올바르게 설정되지 않았습니다.",
      "PROFILE_REFERENCE_DATA_NOT_FOUND",
    );
  }

  return {
    id: profile.id,
    profileImageUrl: profile.profileImageUrl,
    nickname: profile.nickname,
    careerYears: profile.careerYears,
    shortIntroduction: profile.shortIntroduction,
    description: profile.description,
    serviceTypes,
    regions,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

async function resolveMoverReferenceIds(
  transaction: MoverProfileTransaction,
  input: {
    serviceTypes?: MoverServiceType[];
    regions?: MoverRegion[];
  },
): Promise<MoverReferenceIds> {
  const result: MoverReferenceIds = {};

  if (input.serviceTypes !== undefined) {
    const serviceTypes = await findMoverServiceTypesByNames(
      transaction,
      input.serviceTypes,
    );

    if (serviceTypes.length !== input.serviceTypes.length) {
      throw new ConflictError(
        "서비스 유형 기준 데이터가 준비되지 않았습니다.",
        "PROFILE_REFERENCE_DATA_NOT_FOUND",
      );
    }

    result.serviceTypeIds = input.serviceTypes.map((name) => {
      const serviceType = serviceTypes.find((candidate) => candidate.name === name);

      if (!serviceType) {
        throw new ConflictError(
          "서비스 유형 기준 데이터가 준비되지 않았습니다.",
          "PROFILE_REFERENCE_DATA_NOT_FOUND",
        );
      }

      return serviceType.id;
    });
  }

  if (input.regions !== undefined) {
    const databaseRegionNames = input.regions.map(
      (region) => MOVER_REGION_TO_DB_NAME[region],
    );
    const regions = await findMoverRegionsByNames(transaction, databaseRegionNames);

    if (regions.length !== databaseRegionNames.length) {
      throw new ConflictError(
        "지역 기준 데이터가 준비되지 않았습니다.",
        "PROFILE_REFERENCE_DATA_NOT_FOUND",
      );
    }

    result.regionIds = databaseRegionNames.map((name) => {
      const region = regions.find((candidate) => candidate.name === name);

      if (!region) {
        throw new ConflictError(
          "지역 기준 데이터가 준비되지 않았습니다.",
          "PROFILE_REFERENCE_DATA_NOT_FOUND",
        );
      }

      return region.id;
    });
  }

  return result;
}

/**
 * 인증된 MOVER User에 최초 프로필과 서비스·지역 연결을 transaction으로 생성합니다.
 * 중복 profile·닉네임 또는 기준 데이터 누락 시 아무 변경도 남기지 않습니다.
 */
export async function createMoverProfile(
  userId: string,
  input: CreateMoverProfileRequestDto,
): Promise<MoverProfileResponseDto> {
  try {
    return await runMoverProfileTransaction(async (transaction) => {
      const user = await findUserForMoverProfileCreation(transaction, userId);

      if (!user) {
        throw new UnauthorizedError(
          "사용자 정보를 확인할 수 없습니다.",
          "USER_NOT_FOUND",
        );
      }

      if (user.role !== "MOVER") {
        throw new ForbiddenError(
          "기사님만 프로필을 등록할 수 있습니다.",
          "ROLE_MISMATCH",
        );
      }

      if (user.mover) {
        throw new ConflictError(
          "이미 기사님 프로필이 등록되어 있습니다.",
          "MOVER_PROFILE_ALREADY_EXISTS",
        );
      }

      const nicknameOwner = await findOtherMoverByNickname(
        transaction,
        input.nickname,
      );

      if (nicknameOwner) {
        throw new ConflictError(
          "이미 사용 중인 닉네임입니다.",
          "NICKNAME_ALREADY_EXISTS",
        );
      }

      const references = await resolveMoverReferenceIds(transaction, input);

      if (!references.serviceTypeIds || !references.regionIds) {
        throw new ConflictError(
          "프로필 기준 데이터가 준비되지 않았습니다.",
          "PROFILE_REFERENCE_DATA_NOT_FOUND",
        );
      }

      const createdProfile = await createMoverProfileRecord(transaction, {
        userId,
        profileImageUrl: input.profileImageUrl,
        nickname: input.nickname,
        careerYears: input.careerYears,
        shortIntroduction: input.shortIntroduction,
        description: input.description,
        serviceTypeIds: references.serviceTypeIds,
        regionIds: references.regionIds,
      });

      // 공개 DTO 변환까지 transaction 안에서 끝내 기준 데이터 오류가 쓰기 커밋 뒤에
      // 발생하지 않게 하며, Controller가 삭제한 신규 이미지를 DB가 참조하는 상황을 막습니다.
      return toMoverProfileResponseDto(createdProfile);
    });
  } catch (error: unknown) {
    convertMoverUniqueConstraintError(error);
  }
}

/** profiled guard가 확인한 Mover ID로 민감정보 없는 현재 프로필을 조회합니다. */
export async function getMoverProfile(
  moverId: string,
): Promise<MoverProfileResponseDto> {
  const profile = await findMoverProfileById(moverId);

  if (!profile) {
    throw new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED");
  }

  return toMoverProfileResponseDto(profile);
}

/**
 * 전달된 Mover 본체와 서비스·지역 연결을 transaction으로 수정합니다.
 * User 이름·이메일·전화번호·비밀번호는 별도 Mover My Page API 책임으로 남깁니다.
 */
export async function updateMoverProfile(
  moverId: string,
  input: UpdateMoverProfileRequestDto,
): Promise<MoverProfileResponseDto> {
  try {
    const result = await runMoverProfileTransaction(async (transaction) => {
      const currentProfile = await findMoverProfileByIdInTransaction(
        transaction,
        moverId,
      );

      if (!currentProfile) {
        throw new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED");
      }

      if (
        input.nickname !== undefined &&
        input.nickname !== currentProfile.nickname
      ) {
        const nicknameOwner = await findOtherMoverByNickname(
          transaction,
          input.nickname,
          moverId,
        );

        if (nicknameOwner) {
          throw new ConflictError(
            "이미 사용 중인 닉네임입니다.",
            "NICKNAME_ALREADY_EXISTS",
          );
        }
      }

      const references = await resolveMoverReferenceIds(transaction, input);
      const moverChanges = {
        ...(input.profileImageUrl !== undefined
          ? { profileImageUrl: input.profileImageUrl }
          : {}),
        ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
        ...(input.careerYears !== undefined
          ? { careerYears: input.careerYears }
          : {}),
        ...(input.shortIntroduction !== undefined
          ? { shortIntroduction: input.shortIntroduction }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      };

      if (Object.keys(moverChanges).length > 0) {
        await updateMoverProfileRecord(transaction, moverId, moverChanges);
      }

      if (references.serviceTypeIds !== undefined) {
        await replaceMoverServiceTypes(
          transaction,
          moverId,
          references.serviceTypeIds,
        );
      }

      if (references.regionIds !== undefined) {
        await replaceMoverRegions(transaction, moverId, references.regionIds);
      }

      const savedProfile = await findMoverProfileByIdInTransaction(
        transaction,
        moverId,
      );

      if (!savedProfile) {
        throw new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED");
      }

      return {
        // 변환 실패도 transaction 실패로 처리해야 DB와 신규 이미지 정리 상태가 어긋나지 않습니다.
        profile: toMoverProfileResponseDto(savedProfile),
        previousProfileImageUrl: currentProfile.profileImageUrl,
      };
    });

    if (
      input.profileImageUrl !== undefined &&
      input.profileImageUrl !== result.previousProfileImageUrl
    ) {
      await removeReplacedMoverProfileImage(result.previousProfileImageUrl);
    }

    return result.profile;
  } catch (error: unknown) {
    convertMoverUniqueConstraintError(error);
  }
}
