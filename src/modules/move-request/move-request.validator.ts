/**
 * MoveRequest Router의 요청 Body를 zod로 검증합니다.
 * 검증 실패 시 `{ field, reason }[]` details를 담은 `BadRequestError("VALIDATION_ERROR")`를 던집니다.
 */
import { z } from "zod";

import { parseWithZod } from "../../common/validation/zod-parser";
import { SERVICE_TYPE_NAMES } from "./move-request.dto";

export const createMoveRequestBodySchema = z.object({
  serviceType: z.enum(SERVICE_TYPE_NAMES, {
    message: `serviceType은 ${SERVICE_TYPE_NAMES.join(", ")} 중 하나여야 합니다.`,
  }),
  // "오늘보다 미래"인지는 현재 시각에 의존하므로 여기서는 형식만 확인하고 Service에서 검증합니다.
  moveDate: z
    .string({ message: "moveDate는 필수 문자열입니다." })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "moveDate는 YYYY-MM-DD 형식의 ISO 8601 날짜여야 합니다."),
  fromAddress: z
    .string({ message: "fromAddress는 필수 문자열입니다." })
    .trim()
    .min(1, "fromAddress는 공백을 제외하고 1자 이상이어야 합니다.")
    .max(255, "fromAddress는 255자 이하여야 합니다."),
  toAddress: z
    .string({ message: "toAddress는 필수 문자열입니다." })
    .trim()
    .min(1, "toAddress는 공백을 제외하고 1자 이상이어야 합니다.")
    .max(255, "toAddress는 255자 이하여야 합니다."),
});

export type CreateMoveRequestInput = z.infer<typeof createMoveRequestBodySchema>;

export const createDesignatedRequestBodySchema = z.object({
  moverId: z
    .string({ message: "moverId는 필수 문자열입니다." })
    .uuid("moverId는 UUID 형식이어야 합니다."),
});

export type CreateDesignatedRequestInput = z.infer<
  typeof createDesignatedRequestBodySchema
>;

export function parseCreateMoveRequestInput(value: unknown): CreateMoveRequestInput {
  return parseWithZod(createMoveRequestBodySchema, value, {
    fallbackField: "body",
  });
}

export function parseCreateDesignatedRequestInput(
  value: unknown,
): CreateDesignatedRequestInput {
  return parseWithZod(createDesignatedRequestBodySchema, value, {
    fallbackField: "body",
  });
}

const moveRequestIdParamSchema = z.string({
  message: "moveRequestId는 필수 문자열입니다.",
}).uuid("moveRequestId는 UUID 형식이어야 합니다.");

export function parseMoveRequestIdParam(value: unknown): string {
  return parseWithZod(moveRequestIdParamSchema, value, {
    fallbackField: "moveRequestId",
  });
}
