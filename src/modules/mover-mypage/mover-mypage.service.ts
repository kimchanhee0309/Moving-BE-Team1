/** 기사님 마이페이지 조회와 User 기본정보 수정 규칙을 처리합니다. */
import bcrypt from "bcrypt";

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../../common/errors/app-error";
import {
  DB_NAME_TO_MOVER_REGION,
  MOVER_REGIONS,
  MOVER_SERVICE_TYPES,
  isMoverRegion,
  isMoverServiceType,
  type MoverRegion,
} from "../mover-profile/mover-profile.constants";
import type {
  MoverBasicInfoResponseDto,
  MoverMyPageResponseDto,
  MoverRatingCountDto,
  UpdateMoverBasicInfoRequestDto,
} from "./mover-mypage.dto";
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
  type MoverBasicInfoForUpdateRecord,
  type MoverMyPageRecord,
  type MoverRatingGroupRecord,
} from "./mover-mypage.repository";

const PASSWORD_SALT_ROUNDS = 10;
const RATING_SCORES = [5, 4, 3, 2, 1] as const;

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

function convertUserUniqueConstraintError(error: unknown): never {
  if (!isUniqueConstraintError(error)) throw error;

  const target = getUniqueTarget(error);

  if (target.includes("email")) {
    throw new ConflictError("이미 사용 중인 이메일입니다.", "EMAIL_ALREADY_EXISTS");
  }

  if (target.includes("phone")) {
    throw new ConflictError(
      "이미 사용 중인 전화번호입니다.",
      "PHONE_ALREADY_EXISTS",
    );
  }

  throw error;
}

function toBasicInfo(
  record: MoverBasicInfoForUpdateRecord,
): MoverBasicInfoResponseDto {
  return {
    name: record.user.name,
    email: record.user.email,
    phone: record.user.phone,
  };
}

function toRatingCounts(
  groups: MoverRatingGroupRecord[],
): MoverRatingCountDto[] {
  const countByScore = new Map(groups.map((group) => [group.rating, group.count]));

  return RATING_SCORES.map((score) => ({
    score,
    count: countByScore.get(score) ?? 0,
  }));
}

function toMoverMyPage(
  record: MoverMyPageRecord,
  ratingGroups: MoverRatingGroupRecord[],
): MoverMyPageResponseDto {
  const serviceTypes = record.serviceTypes
    .map(({ serviceType }) => serviceType.name)
    .filter(isMoverServiceType)
    .sort(
      (left, right) =>
        MOVER_SERVICE_TYPES.indexOf(left) - MOVER_SERVICE_TYPES.indexOf(right),
    );
  const regions = record.regions
    .map(({ region }) => DB_NAME_TO_MOVER_REGION[region.name])
    .filter((region): region is MoverRegion =>
      region !== undefined && isMoverRegion(region),
    )
    .sort(
      (left, right) => MOVER_REGIONS.indexOf(left) - MOVER_REGIONS.indexOf(right),
    );

  if (
    serviceTypes.length !== record.serviceTypes.length ||
    regions.length !== record.regions.length
  ) {
    throw new ConflictError(
      "프로필 기준 데이터가 올바르게 설정되지 않았습니다.",
      "PROFILE_REFERENCE_DATA_NOT_FOUND",
    );
  }

  const ratingCounts = toRatingCounts(ratingGroups);
  const reviewCount = ratingCounts.reduce((sum, item) => sum + item.count, 0);
  const ratingTotal = ratingCounts.reduce(
    (sum, item) => sum + item.score * item.count,
    0,
  );

  return {
    id: record.id,
    name: record.user.name,
    email: record.user.email,
    phone: record.user.phone,
    profileImageUrl: record.profileImageUrl,
    nickname: record.nickname,
    careerYears: record.careerYears,
    shortIntroduction: record.shortIntroduction,
    description: record.description,
    serviceTypes,
    regions,
    confirmedCount: record._count.quotes,
    favoriteCount: record._count.favorites,
    rating: reviewCount === 0 ? 0 : Math.round((ratingTotal / reviewCount) * 10) / 10,
    reviewCount,
    ratingCounts,
  };
}

/** 프로필, 기본정보, 활동 집계와 리뷰 평점 분포를 조회합니다. */
export async function getMoverMyPage(
  moverId: string,
): Promise<MoverMyPageResponseDto> {
  const [record, ratingGroups] = await Promise.all([
    findMoverMyPageById(moverId),
    findMoverRatingGroups(moverId),
  ]);

  if (!record) {
    throw new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED");
  }

  return toMoverMyPage(record, ratingGroups);
}

/** 일반 기본정보를 수정하고 이메일·비밀번호 변경만 현재 비밀번호 검증과 같은 transaction에 연결합니다. */
export async function updateMoverBasicInfo(
  moverId: string,
  input: UpdateMoverBasicInfoRequestDto,
): Promise<MoverBasicInfoResponseDto> {
  const current = await findMoverBasicInfoForUpdate(moverId);

  if (!current) {
    throw new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED");
  }

  try {
    return await runMoverMyPageTransaction(async (transaction) => {
      const profile = await findMoverBasicInfoInTransaction(transaction, moverId);

      if (!profile) {
        throw new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED");
      }

      const isEmailChanging =
        input.email !== undefined && input.email !== profile.user.email;
      const isPasswordChanging = input.newPassword !== undefined;
      const requiresPasswordVerification = isEmailChanging || isPasswordChanging;

      if (input.currentPassword !== undefined && !requiresPasswordVerification) {
        throw new BadRequestError(
          "입력값을 확인해 주세요.",
          "VALIDATION_ERROR",
          [{
            field: "currentPassword",
            reason: "현재 비밀번호는 이메일 또는 비밀번호를 변경할 때만 입력할 수 있습니다.",
          }],
        );
      }

      let passwordVerification:
        | { expectedPasswordHash: string; nextPasswordHash: string }
        | undefined;

      if (!profile.user.passwordHash) {
        if (isEmailChanging) {
          throw new ConflictError(
            "소셜 로그인 계정은 이메일을 변경할 수 없습니다.",
            "OAUTH_EMAIL_CHANGE_NOT_AVAILABLE",
          );
        }

        if (isPasswordChanging) {
          throw new ConflictError(
            "소셜 로그인 계정은 비밀번호를 변경할 수 없습니다.",
            "PASSWORD_CHANGE_NOT_AVAILABLE",
          );
        }
      } else if (requiresPasswordVerification) {
        if (input.currentPassword === undefined) {
          throw new BadRequestError(
            "입력값을 확인해 주세요.",
            "VALIDATION_ERROR",
            [{
              field: "currentPassword",
              reason: "이메일 또는 비밀번호 변경에는 현재 비밀번호가 필요합니다.",
            }],
          );
        }

        const isCurrentPasswordValid = await bcrypt.compare(
          input.currentPassword,
          profile.user.passwordHash,
        );

        if (!isCurrentPasswordValid) {
          throw new UnauthorizedError(
            "현재 비밀번호가 올바르지 않습니다.",
            "INVALID_CURRENT_PASSWORD",
          );
        }

        passwordVerification = {
          expectedPasswordHash: profile.user.passwordHash,
          nextPasswordHash: input.newPassword !== undefined
            ? await bcrypt.hash(input.newPassword, PASSWORD_SALT_ROUNDS)
            : profile.user.passwordHash,
        };
      }

      if (isEmailChanging && input.email !== undefined) {
        const owner = await findOtherUserByEmail(
          transaction,
          input.email,
          profile.user.id,
        );

        if (owner) {
          throw new ConflictError(
            "이미 사용 중인 이메일입니다.",
            "EMAIL_ALREADY_EXISTS",
          );
        }
      }

      if (
        input.phone !== undefined &&
        input.phone !== null &&
        input.phone !== profile.user.phone
      ) {
        const owner = await findOtherUserByPhone(
          transaction,
          input.phone,
          profile.user.id,
        );

        if (owner) {
          throw new ConflictError(
            "이미 사용 중인 전화번호입니다.",
            "PHONE_ALREADY_EXISTS",
          );
        }
      }

      const userChanges = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(isEmailChanging && input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      };

      if (passwordVerification) {
        const result = await updateMoverUserWithPasswordMatch(
          transaction,
          profile.user.id,
          passwordVerification.expectedPasswordHash,
          { ...userChanges, passwordHash: passwordVerification.nextPasswordHash },
        );

        if (result.count === 0) {
          throw new UnauthorizedError(
            "현재 비밀번호가 올바르지 않습니다.",
            "INVALID_CURRENT_PASSWORD",
          );
        }
      } else {
        await updateMoverUser(transaction, profile.user.id, userChanges);
      }

      const saved = await findMoverBasicInfoInTransaction(transaction, moverId);

      if (!saved) {
        throw new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED");
      }

      return toBasicInfo(saved);
    });
  } catch (error: unknown) {
    convertUserUniqueConstraintError(error);
  }
}
