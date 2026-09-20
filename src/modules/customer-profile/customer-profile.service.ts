/**
 * Customer Profile 생성·조회·수정의 권한, 중복, 참조 데이터와 transaction 규칙을 처리합니다.
 * Express 객체와 cookie는 다루지 않으며 Auth 코드를 수정하거나 OAuth 계정에 비밀번호를 임의 생성하지 않습니다.
 */
import bcrypt from "bcrypt";

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../../common/errors/app-error";
import {
  CUSTOMER_SERVICE_TYPES,
  DB_NAME_TO_REGION,
  REGION_TO_DB_NAME,
  isCustomerRegion,
  isCustomerServiceType,
  type CustomerRegion,
  type CustomerServiceType,
} from "./customer-profile.constants";
import type {
  CreateCustomerProfileInput,
  CustomerProfileDto,
  UpdateCustomerProfileInput,
} from "./customer-profile.dto";
import { removeReplacedLocalProfileImage } from "./customer-profile.image";
import {
  createCustomerProfileRecord,
  findCustomerProfileById,
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
  type CustomerProfileRecord,
  type CustomerProfileTransaction,
} from "./customer-profile.repository";

const PASSWORD_SALT_ROUNDS = 10;

interface ReferenceIds {
  regionId?: string;
  serviceTypeIds?: string[];
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002"; meta?: unknown } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function getUniqueTarget(error: { meta?: unknown }): string {
  if (typeof error.meta !== "object" || error.meta === null || !("target" in error.meta)) {
    return "";
  }

  const target = error.meta.target;
  return Array.isArray(target) ? target.join(",") : typeof target === "string" ? target : "";
}

function convertUniqueConstraintError(error: unknown): never {
  if (!isUniqueConstraintError(error)) throw error;

  const target = getUniqueTarget(error);

  if (target.includes("email")) {
    throw new ConflictError("이미 사용 중인 이메일입니다.", "EMAIL_ALREADY_EXISTS");
  }

  if (target.includes("phone")) {
    throw new ConflictError("이미 사용 중인 전화번호입니다.", "PHONE_ALREADY_EXISTS");
  }

  throw new ConflictError("이미 일반 유저 프로필이 등록되어 있습니다.", "CUSTOMER_PROFILE_ALREADY_EXISTS");
}

function toCustomerProfileDto(profile: CustomerProfileRecord): CustomerProfileDto {
  const region = DB_NAME_TO_REGION[profile.region.name];

  if (!region || !isCustomerRegion(region)) {
    throw new ConflictError(
      "프로필 기준 데이터가 올바르게 설정되지 않았습니다.",
      "PROFILE_REFERENCE_DATA_NOT_FOUND",
    );
  }

  const serviceTypes = profile.serviceTypes
    .map(({ serviceType }) => serviceType.name)
    .filter(isCustomerServiceType)
    .sort(
      (left, right) =>
        CUSTOMER_SERVICE_TYPES.indexOf(left) - CUSTOMER_SERVICE_TYPES.indexOf(right),
    );

  if (serviceTypes.length !== profile.serviceTypes.length) {
    throw new ConflictError(
      "프로필 기준 데이터가 올바르게 설정되지 않았습니다.",
      "PROFILE_REFERENCE_DATA_NOT_FOUND",
    );
  }

  return {
    id: profile.id,
    name: profile.user.name,
    email: profile.user.email,
    phone: profile.user.phone,
    profileImageUrl: profile.profileImageUrl,
    serviceTypes,
    region,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

async function resolveReferenceIds(
  transaction: CustomerProfileTransaction,
  input: { region?: CustomerRegion; serviceTypes?: CustomerServiceType[] },
): Promise<ReferenceIds> {
  const result: ReferenceIds = {};

  if (input.region !== undefined) {
    const databaseRegionName = REGION_TO_DB_NAME[input.region];
    const region = await findRegionByName(transaction, databaseRegionName);

    if (!region) {
      throw new ConflictError(
        "지역 기준 데이터가 준비되지 않았습니다.",
        "PROFILE_REFERENCE_DATA_NOT_FOUND",
      );
    }

    result.regionId = region.id;
  }

  if (input.serviceTypes !== undefined) {
    const serviceTypes = await findServiceTypesByNames(transaction, input.serviceTypes);

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

  return result;
}

/**
 * 인증된 CUSTOMER User에 최초 프로필과 서비스 연결을 transaction으로 생성합니다.
 * DB를 변경하며 중복 profile 또는 기준 데이터 누락 시 아무 변경도 남기지 않습니다.
 */
export async function createCustomerProfile(
  userId: string,
  input: CreateCustomerProfileInput,
): Promise<CustomerProfileDto> {
  try {
    const profile = await runCustomerProfileTransaction(async (transaction) => {
      const user = await findUserForCustomerProfileCreation(transaction, userId);

      if (!user) {
        throw new UnauthorizedError("사용자 정보를 확인할 수 없습니다.", "USER_NOT_FOUND");
      }

      if (user.role !== "CUSTOMER") {
        throw new ForbiddenError("일반 유저만 프로필을 등록할 수 있습니다.", "ROLE_MISMATCH");
      }

      if (user.customer) {
        throw new ConflictError(
          "이미 일반 유저 프로필이 등록되어 있습니다.",
          "CUSTOMER_PROFILE_ALREADY_EXISTS",
        );
      }

      const references = await resolveReferenceIds(transaction, input);

      if (!references.regionId || !references.serviceTypeIds) {
        throw new ConflictError(
          "프로필 기준 데이터가 준비되지 않았습니다.",
          "PROFILE_REFERENCE_DATA_NOT_FOUND",
        );
      }

      return createCustomerProfileRecord(transaction, {
        userId,
        regionId: references.regionId,
        profileImageUrl: input.profileImageUrl,
        serviceTypeIds: references.serviceTypeIds,
      });
    });

    return toCustomerProfileDto(profile);
  } catch (error: unknown) {
    convertUniqueConstraintError(error);
  }
}

/** profiled guard가 확인한 Customer ID로 민감정보를 제외한 현재 프로필을 조회합니다. */
export async function getCustomerProfile(customerId: string): Promise<CustomerProfileDto> {
  const profile = await findCustomerProfileById(customerId);

  if (!profile) {
    throw new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED");
  }

  return toCustomerProfileDto(profile);
}

/**
 * 현재 프로필의 User·Customer·서비스 연결을 transaction으로 수정합니다.
 * 이메일·비밀번호 계정은 이메일 또는 비밀번호 변경에만 현재 비밀번호를 요구하고,
 * OAuth 계정은 이메일·비밀번호 변경을 지원하지 않으며 일반 프로필 수정만 허용합니다.
 */
export async function updateCustomerProfile(
  customerId: string,
  input: UpdateCustomerProfileInput,
): Promise<CustomerProfileDto> {
  const currentProfile = await findCustomerProfileForUpdate(customerId);

  if (!currentProfile) {
    throw new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED");
  }

  try {
    const updatedProfile = await runCustomerProfileTransaction(async (transaction) => {
      // 최신 이메일·passwordHash를 기준으로 민감정보 변경 여부와 재인증을 함께 판단합니다.
      const profile = await findCustomerProfileByIdInTransaction(transaction, customerId);

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
        const emailOwner = await findOtherUserByEmail(transaction, input.email, profile.user.id);
        if (emailOwner) {
          throw new ConflictError("이미 사용 중인 이메일입니다.", "EMAIL_ALREADY_EXISTS");
        }
      }

      if (input.phone !== undefined && input.phone !== null && input.phone !== profile.user.phone) {
        const phoneOwner = await findOtherUserByPhone(transaction, input.phone, profile.user.id);
        if (phoneOwner) {
          throw new ConflictError("이미 사용 중인 전화번호입니다.", "PHONE_ALREADY_EXISTS");
        }
      }

      const references = await resolveReferenceIds(transaction, input);
      const userChanges = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(isEmailChanging && input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      };
      const customerChanges = {
        ...(references.regionId !== undefined ? { regionId: references.regionId } : {}),
        ...(input.profileImageUrl !== undefined
          ? { profileImageUrl: input.profileImageUrl }
          : {}),
      };

      if (passwordVerification !== undefined) {
        const result = await updateCustomerUserWithPasswordMatch(
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
      } else if (Object.keys(userChanges).length > 0) {
        await updateCustomerUser(transaction, profile.user.id, userChanges);
      }

      if (Object.keys(customerChanges).length > 0) {
        await updateCustomerRecord(transaction, customerId, customerChanges);
      }

      if (references.serviceTypeIds !== undefined) {
        await replaceCustomerServiceTypes(transaction, customerId, references.serviceTypeIds);
      }

      const savedProfile = await findCustomerProfileByIdInTransaction(transaction, customerId);

      if (!savedProfile) {
        throw new ForbiddenError("프로필 등록이 필요합니다.", "PROFILE_REQUIRED");
      }

      return savedProfile;
    });

    // 새 URL이 DB에 확정된 뒤에만 이전 파일을 지워 rollback 시 기존 이미지가 사라지지 않게 합니다.
    if (
      input.profileImageUrl !== undefined &&
      input.profileImageUrl !== currentProfile.profileImageUrl
    ) {
      await removeReplacedLocalProfileImage(currentProfile.profileImageUrl);
    }

    return toCustomerProfileDto(updatedProfile);
  } catch (error: unknown) {
    convertUniqueConstraintError(error);
  }
}
