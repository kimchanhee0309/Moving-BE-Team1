/**
 * Zod 검증 결과를 프로젝트 공통 VALIDATION_ERROR 형식으로 변환
 * 외부 입력값을 오류 응답이나 로그에 포함하지 않음
 */
import type { z } from "zod";

import { BadRequestError } from "../errors/app-error";

interface ParseWithZodOptions {
  message?: string;
  fallbackField?: string;
}

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
      }));
    }

    const field =
      issue.path.length > 0
        ? issue.path.map((segment) => String(segment)).join(".")
        : fallbackField;

    return {
      field,
      reason: issue.message,
    };
  });

  throw new BadRequestError(
    options.message ?? "요청값이 올바르지 않습니다.",
    "VALIDATION_ERROR",
    details,
  );
}
