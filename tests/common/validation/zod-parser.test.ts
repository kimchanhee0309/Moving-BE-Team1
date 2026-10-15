/**
 * 공통 Zod 검증기의 VALIDATION_ERROR details가 field·reason과 함께 다국어 번역용 code를 내려주는지 검증합니다.
 * 사전 조건: 실제 DB나 HTTP 없이 schema와 입력값만 사용합니다.
 */
import { z } from "zod";

import { BadRequestError } from "../../../src/common/errors/app-error";
import { parseWithZod } from "../../../src/common/validation/zod-parser";

const schema = z
  .object({
    name: z.string().min(2, "2자 이상 입력해 주세요.").max(5, "5자 이하로 입력해 주세요."),
    email: z.email("이메일 형식이 아닙니다."),
    role: z.enum(["CUSTOMER", "MOVER"], "허용되지 않은 역할입니다."),
  })
  .strict();

/** parseWithZod가 던진 BadRequestError의 details를 꺼냅니다. 오류가 나지 않으면 테스트를 실패시킵니다. */
function captureDetails(value: unknown) {
  try {
    parseWithZod(schema, value);
  } catch (error: unknown) {
    if (error instanceof BadRequestError) return error.details;
    throw error;
  }
  throw new Error("VALIDATION_ERROR가 발생해야 합니다.");
}

describe("parseWithZod details code", () => {
  test("필수값 누락은 REQUIRED, 형식 오류는 INVALID_FORMAT, 허용값 밖은 INVALID_VALUE를 준다", () => {
    expect(captureDetails({ email: "not-email", role: "ADMIN" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "name", code: "REQUIRED" }),
        expect.objectContaining({ field: "email", code: "INVALID_FORMAT", reason: "이메일 형식이 아닙니다." }),
        expect.objectContaining({ field: "role", code: "INVALID_VALUE" }),
      ]),
    );
  });

  test("길이 하한·상한 위반은 TOO_SMALL·TOO_BIG을 준다", () => {
    expect(captureDetails({ name: "a", email: "a@b.co", role: "MOVER" })).toEqual([
      { field: "name", reason: "2자 이상 입력해 주세요.", code: "TOO_SMALL" },
    ]);
    expect(captureDetails({ name: "abcdefg", email: "a@b.co", role: "MOVER" })).toEqual([
      { field: "name", reason: "5자 이하로 입력해 주세요.", code: "TOO_BIG" },
    ]);
  });

  test("허용되지 않은 필드는 UNRECOGNIZED_FIELD를 준다", () => {
    expect(captureDetails({ name: "abc", email: "a@b.co", role: "MOVER", extra: "x" })).toEqual([
      { field: "extra", reason: "허용되지 않은 필드입니다.", code: "UNRECOGNIZED_FIELD" },
    ]);
  });
});
