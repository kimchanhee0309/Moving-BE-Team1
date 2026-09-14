/**
 * OAuth route param과 query를 허용 목록으로 검증합니다.
 * 역할 및 redirect를 공급자 callback query에서 직접 복원하지 않도록 입력 경계를 제한합니다.
 */
import type { UserRole } from "../../generated/prisma/enums";
import { BadRequestError, type ErrorDetails } from "../../common/errors/app-error";
import type { OAuthCallbackInput, OAuthProvider, OAuthStartInput } from "./oauth.dto";

function readSingleString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

/** 지원하지 않는 공급자 경로를 명시적인 입력 오류로 변환합니다. */
export function parseOAuthProvider(value: unknown): OAuthProvider {
  if (value === "google" || value === "kakao" || value === "naver") {
    return value;
  }

  throw new BadRequestError(
    "지원하지 않는 OAuth 공급자입니다.",
    "OAUTH_PROVIDER_UNSUPPORTED",
    [{ field: "provider", reason: "google, kakao, naver만 사용할 수 있습니다." }],
  );
}

function parseOAuthRole(value: unknown, details: ErrorDetails): UserRole {
  if (value === "CUSTOMER" || value === "MOVER") {
    return value;
  }

  details.push({ field: "role", reason: "CUSTOMER 또는 MOVER만 사용할 수 있습니다." });
  return "CUSTOMER";
}

/** 외부 URL과 인증 화면 순환 경로를 redirect 값으로 저장하지 못하게 합니다. */
export function parseOAuthRedirect(value: unknown, details: ErrorDetails): string | undefined {
  const redirect = readSingleString(value);

  if (!redirect) {
    return undefined;
  }

  if (
    redirect.length > 2_048 ||
    !redirect.startsWith("/") ||
    redirect.startsWith("//") ||
    [...redirect].some(
      (character) => character === "\\" || character.charCodeAt(0) <= 0x20,
    )
  ) {
    details.push({ field: "redirect", reason: "같은 사이트의 안전한 경로여야 합니다." });
    return undefined;
  }

  try {
    const parsed = new URL(redirect, "https://moving.local");
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    if (parsed.origin !== "https://moving.local" || /^\/(auth|login|signup)(\/|$)/.test(parsed.pathname)) {
      details.push({ field: "redirect", reason: "인증 화면이 아닌 같은 사이트 경로여야 합니다." });
      return undefined;
    }

    return normalized;
  } catch {
    details.push({ field: "redirect", reason: "올바른 경로 형식이어야 합니다." });
    return undefined;
  }
}

/** OAuth 시작 query에서 역할과 선택 redirect를 검증합니다. */
export function parseOAuthStartInput(
  providerValue: unknown,
  query: Record<string, unknown>,
): OAuthStartInput {
  const details: ErrorDetails = [];
  const provider = parseOAuthProvider(providerValue);
  const role = parseOAuthRole(readSingleString(query.role), details);
  const redirect = parseOAuthRedirect(query.redirect, details);
  const format = readSingleString(query.format);

  if (format !== undefined && format !== "json") {
    details.push({ field: "format", reason: "json만 사용할 수 있습니다." });
  }

  if (details.length > 0) {
    throw new BadRequestError("OAuth 요청값이 올바르지 않습니다.", "VALIDATION_ERROR", details);
  }

  return {
    provider,
    role,
    ...(redirect ? { redirect } : {}),
    responseFormat: format === "json" ? "json" : "redirect",
  };
}

/** Callback은 code/state/error 외 공급자 원문을 읽지 않고 문자열 한 개만 허용합니다. */
export function parseOAuthCallbackInput(
  providerValue: unknown,
  query: Record<string, unknown>,
): OAuthCallbackInput {
  return {
    provider: parseOAuthProvider(providerValue),
    code: readSingleString(query.code),
    state: readSingleString(query.state),
    providerError: readSingleString(query.error),
  };
}
