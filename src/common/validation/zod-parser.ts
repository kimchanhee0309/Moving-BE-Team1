/**
 * Zod 검증 결과를 프로젝트 공통 VALIDATION_ERROR 형식으로 변환
 * 외부 입력값을 오류 응답이나 로그에 포함하지 않음
 * details 항목마다 사유 code를 붙여 클라이언트가 언어별 문구로 번역할 수 있게 함
 */
import type { z } from "zod";

import { BadRequestError } from "../errors/app-error";

interface ParseWithZodOptions {
  message?: string;
  fallbackField?: string;
}

/**
 * Zod issue 종류를 API 오류 details의 code로 바꿉니다.
 * 값이 아예 없는 타입 오류(undefined)는 필수값 누락(REQUIRED)으로 구분해 화면이 "입력해 주세요" 문구를 쓸 수 있게 합니다.
 *
 * @param issue Zod가 반환한 검증 실패 한 건
 * @returns details[].code 값
 */
function toDetailCode(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined ? "REQUIRED" : "INVALID_TYPE";
    case "too_small":
      return "TOO_SMALL";
    case "too_big":
      return "TOO_BIG";
    case "invalid_format":
      return "INVALID_FORMAT";
    default:
      return "INVALID_VALUE";
  }
}

/**
 * Zod schema로 외부 입력을 검증하고 성공 값을 반환합니다.
 *
 * @param schema 검증할 Zod schema
 * @param value params·query·body 등 외부 입력
 * @param options 오류 message와 경로가 없을 때 쓸 field 이름
 * @returns 검증·변환된 값
 * @throws BadRequestError VALIDATION_ERROR와 field·reason·code details
 */
export function parseWithZod<TOutput>(
  schema: z.ZodType<TOutput>,
  value: unknown,
  options: ParseWithZodOptions = {},
): TOutput {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const fallbackField = options.fallbackField ?? "value";

  const details = result.error.issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        field: key,
        reason: "허용되지 않은 필드입니다.",
        code: "UNRECOGNIZED_FIELD",
      }));
    }

    const field =
      issue.path.length > 0
        ? issue.path.map((segment) => String(segment)).join(".")
        : fallbackField;

    return {
      field,
      reason: issue.message,
      code: toDetailCode(issue),
    };
  });

  throw new BadRequestError(
    options.message ?? "요청값이 올바르지 않습니다.",
    "VALIDATION_ERROR",
    details,
  );
}
