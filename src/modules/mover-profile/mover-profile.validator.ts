/**
 * multipart/form-data 문자열 body를 Mover Profile 요청 DTO로 검증·정규화합니다.
 * 인증과 파일 바이너리 검증, DB 기준 데이터 존재 여부는 담당하지 않습니다.
 */
import { z } from "zod";

import { BadRequestError } from "../../common/errors/app-error";
import { parseWithZod } from "../../common/validation/zod-parser";
import {
  MOVER_CAREER_YEARS_MAX,
  MOVER_CAREER_YEARS_MIN,
  MOVER_DESCRIPTION_MAX_LENGTH,
  MOVER_NICKNAME_MAX_LENGTH,
  MOVER_REGIONS,
  MOVER_SERVICE_TYPES,
  MOVER_SHORT_INTRODUCTION_MAX_LENGTH,
} from "./mover-profile.constants";
import type {
  CreateMoverProfileRequestDto,
  UpdateMoverProfileRequestDto,
} from "./mover-profile.dto";

function createUniqueArraySchema<T extends readonly [string, ...string[]]>(
  values: T,
  emptyMessage: string,
  invalidMessage: string,
  duplicateMessage: string,
) {
  return z
    .preprocess(
      (value) => {
        if (value === undefined) return [];
        const items = Array.isArray(value) ? value : [value];
        // multipart client마다 배열을 반복 field 또는 쉼표 문자열로 직렬화하므로
        // HTTP 경계에서 두 표현을 같은 배열 DTO로 통일합니다.
        return items.flatMap((item) =>
          typeof item === "string"
            ? item.split(",").map((part) => part.trim())
            : [item],
        );
      },
      z
        .array(z.enum(values, { error: invalidMessage }))
        .min(1, { error: emptyMessage }),
    )
    .superRefine((items, context) => {
      if (new Set(items).size !== items.length) {
        context.addIssue({ code: "custom", message: duplicateMessage });
      }
    });
}

const serviceTypesSchema = createUniqueArraySchema(
  MOVER_SERVICE_TYPES,
  "서비스 유형을 한 개 이상 선택해 주세요.",
  "SMALL, HOME, OFFICE만 사용할 수 있습니다.",
  "같은 서비스 유형을 중복 선택할 수 없습니다.",
);

const regionsSchema = createUniqueArraySchema(
  MOVER_REGIONS,
  "활동 지역을 한 개 이상 선택해 주세요.",
  "지원하는 17개 시·도만 선택할 수 있습니다.",
  "같은 활동 지역을 중복 선택할 수 없습니다.",
);

const nicknameSchema = z
  .string({ error: "닉네임을 입력해 주세요." })
  .trim()
  .min(1, { error: "닉네임을 입력해 주세요." })
  .max(MOVER_NICKNAME_MAX_LENGTH, {
    error: `닉네임은 ${MOVER_NICKNAME_MAX_LENGTH}자 이하여야 합니다.`,
  });

const careerYearsSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }
    return value;
  },
  z
    .number({ error: "경력은 숫자로 입력해 주세요." })
    .int({ error: "경력은 정수로 입력해 주세요." })
    .min(MOVER_CAREER_YEARS_MIN, {
      error: `경력은 ${MOVER_CAREER_YEARS_MIN}년 이상이어야 합니다.`,
    })
    .max(MOVER_CAREER_YEARS_MAX, {
      error: `경력은 ${MOVER_CAREER_YEARS_MAX}년 이하여야 합니다.`,
    }),
);

const shortIntroductionSchema = z
  .string({ error: "한 줄 소개를 입력해 주세요." })
  .trim()
  .min(1, { error: "한 줄 소개를 입력해 주세요." })
  .max(MOVER_SHORT_INTRODUCTION_MAX_LENGTH, {
    error: `한 줄 소개는 ${MOVER_SHORT_INTRODUCTION_MAX_LENGTH}자 이하여야 합니다.`,
  });

const descriptionSchema = z
  .string({ error: "상세 설명을 입력해 주세요." })
  .trim()
  .min(1, { error: "상세 설명을 입력해 주세요." })
  .max(MOVER_DESCRIPTION_MAX_LENGTH, {
    error: `상세 설명은 ${MOVER_DESCRIPTION_MAX_LENGTH.toLocaleString()}자 이하여야 합니다.`,
  });

const createMoverProfileSchema = z
  .object({
    nickname: nicknameSchema,
    careerYears: careerYearsSchema,
    shortIntroduction: shortIntroductionSchema,
    description: descriptionSchema,
    serviceTypes: serviceTypesSchema,
    regions: regionsSchema,
  })
  .strict();

const updateMoverProfileSchema = z
  .object({
    nickname: nicknameSchema.optional(),
    careerYears: careerYearsSchema.optional(),
    shortIntroduction: shortIntroductionSchema.optional(),
    description: descriptionSchema.optional(),
    serviceTypes: serviceTypesSchema.optional(),
    regions: regionsSchema.optional(),
  })
  .strict();

/** 최초 프로필 생성 body와 선택 이미지를 검증된 DTO로 변환합니다. */
export function parseCreateMoverProfileRequest(
  bodyValue: unknown,
  profileImageUrl: string | null,
): CreateMoverProfileRequestDto {
  const body = parseWithZod(createMoverProfileSchema, bodyValue, {
    message: "입력값을 확인해 주세요.",
    fallbackField: "body",
  });

  return { ...body, profileImageUrl };
}

/** PATCH body의 전달 필드만 정규화하며 빈 요청은 거절합니다. */
export function parseUpdateMoverProfileRequest(
  bodyValue: unknown,
  profileImageUrl?: string,
): UpdateMoverProfileRequestDto {
  const body = parseWithZod(updateMoverProfileSchema, bodyValue, {
    message: "입력값을 확인해 주세요.",
    fallbackField: "body",
  });

  if (Object.keys(body).length === 0 && profileImageUrl === undefined) {
    throw new BadRequestError(
      "입력값을 확인해 주세요.",
      "VALIDATION_ERROR",
      [{ field: "body", reason: "수정할 값을 한 개 이상 입력해 주세요." }],
    );
  }

  return {
    ...body,
    ...(profileImageUrl !== undefined ? { profileImageUrl } : {}),
  };
}
