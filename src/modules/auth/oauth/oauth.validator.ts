/**
 * OAuth route param과 query를 Zod 허용 목록으로 검증합니다.
 * 역할 및 redirect를 공급자 callback query에서 직접 복원하지 않도록 입력 경계를 제한합니다.
 */
import { z } from "zod";

import { BadRequestError, type ErrorDetails } from "../../../common/errors/app-error";
import { parseWithZod } from "../../../common/validation/zod-parser";
import type { OAuthCallbackInput, OAuthProvider, OAuthStartInput } from "./oauth.dto";

const optionalTrimmedStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
  z.string().optional(),
);

const providerSchema = z.enum(["google", "kakao", "naver"], {
  error: "google, kakao, naver만 사용할 수 있습니다.",
});

const redirectSchema = optionalTrimmedStringSchema.transform(
  (redirect, context) => {
    if (redirect === undefined) return undefined;

    if (
      redirect.length > 2_048 ||
      !redirect.startsWith("/") ||
      redirect.startsWith("//") ||
      [...redirect].some(
        (character) => character === "\\" || character.charCodeAt(0) <= 0x20,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "같은 사이트의 안전한 경로여야 합니다.",
      });
      return z.NEVER;
    }

    try {
      const parsed = new URL(redirect, "https://moving.local");

      if (
        parsed.origin !== "https://moving.local" ||
        /^\/(auth|login|signup)(\/|$)/.test(parsed.pathname)
      ) {
        context.addIssue({
          code: "custom",
          message: "인증 화면이 아닌 같은 사이트 경로여야 합니다.",
        });
        return z.NEVER;
      }

      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      context.addIssue({ code: "custom", message: "올바른 경로 형식이어야 합니다." });
      return z.NEVER;
    }
  },
);

const oauthStartQuerySchema = z
  .object({
    role: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.enum(["CUSTOMER", "MOVER"], {
        error: "CUSTOMER 또는 MOVER만 사용할 수 있습니다.",
      }),
    ),
    redirect: redirectSchema,
    format: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
      z.literal("json", { error: "json만 사용할 수 있습니다." }).optional(),
    ),
  })
  .transform(({ role, redirect, format }) => {
    const responseFormat: OAuthStartInput["responseFormat"] =
      format === "json" ? "json" : "redirect";

    return {
      role,
      ...(redirect ? { redirect } : {}),
      responseFormat,
    };
  });

const oauthCallbackQuerySchema = z.object({
  code: optionalTrimmedStringSchema,
  state: optionalTrimmedStringSchema,
  error: optionalTrimmedStringSchema,
});

/** 지원하지 않는 공급자 경로를 명시적인 입력 오류로 변환합니다. */
export function parseOAuthProvider(value: unknown): OAuthProvider {
  const result = providerSchema.safeParse(value);

  if (result.success) return result.data;

  throw new BadRequestError(
    "지원하지 않는 OAuth 공급자입니다.",
    "OAUTH_PROVIDER_UNSUPPORTED",
    [{ field: "provider", reason: result.error.issues[0]?.message ?? "지원하지 않는 공급자입니다." }],
  );
}

/** 외부 URL과 인증 화면 순환 경로를 redirect 값으로 저장하지 못하게 합니다. */
export function parseOAuthRedirect(value: unknown, details: ErrorDetails): string | undefined {
  const result = redirectSchema.safeParse(value);

  if (result.success) return result.data;

  details.push(
    ...result.error.issues.map((issue) => ({
      field: "redirect",
      reason: issue.message,
    })),
  );
  return undefined;
}

/** OAuth 시작 query에서 역할과 선택 redirect를 검증합니다. */
export function parseOAuthStartInput(
  providerValue: unknown,
  query: Record<string, unknown>,
): OAuthStartInput {
  const provider = parseOAuthProvider(providerValue);
  const parsedQuery = parseWithZod(oauthStartQuerySchema, query, {
    message: "OAuth 요청값이 올바르지 않습니다.",
    fallbackField: "query",
  });

  return { provider, ...parsedQuery };
}

/** Callback은 code/state/error 외 공급자 원문을 읽지 않고 문자열 한 개만 허용합니다. */
export function parseOAuthCallbackInput(
  providerValue: unknown,
  query: Record<string, unknown>,
): OAuthCallbackInput {
  const provider = parseOAuthProvider(providerValue);
  const parsedQuery = parseWithZod(oauthCallbackQuerySchema, query, {
    message: "OAuth callback 요청값이 올바르지 않습니다.",
    fallbackField: "query",
  });

  return {
    provider,
    code: parsedQuery.code,
    state: parsedQuery.state,
    providerError: parsedQuery.error,
  };
}
