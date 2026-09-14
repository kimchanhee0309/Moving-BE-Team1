/**
 * OAuth 시작 응답과 공급자 callback의 쿠키·redirect 경계를 담당합니다.
 * 역할 결정, 계정 충돌, 공급자 통신은 Validator와 Service 계층에 위임합니다.
 */
import type { RequestHandler } from "express";

import { setAuthCookies } from "../../common/cookies/auth-cookie";
import { AppError, BadRequestError } from "../../common/errors/app-error";
import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { env } from "../../config/env";
import { authenticateWithOAuth } from "./oauth.service";
import { createOAuthAuthorizationUrl, fetchOAuthProfile } from "./oauth.provider";
import {
  consumeOAuthState,
  createOAuthState,
  setOAuthStateCookie,
} from "./oauth.state";
import {
  parseOAuthCallbackInput,
  parseOAuthStartInput,
} from "./oauth.validator";
import type { OAuthStateContext } from "./oauth.dto";

const REDIRECTABLE_ERROR_CODES = new Set([
  "OAUTH_CANCELLED",
  "OAUTH_INVALID_STATE",
  "OAUTH_ACCOUNT_CONFLICT",
  "ROLE_MISMATCH",
  "OAUTH_EMAIL_REQUIRED",
  "OAUTH_EMAIL_UNVERIFIED",
  "OAUTH_PROVIDER_ERROR",
  "OAUTH_CODE_MISSING",
  "OAUTH_NOT_CONFIGURED",
  "OAUTH_PROVIDER_UNSUPPORTED",
  "AUTH_RATE_LIMIT_EXCEEDED",
]);

function buildFrontendCallbackUrl(
  context?: OAuthStateContext,
  errorCode?: string,
): string {
  const url = new URL("/auth/callback", env.FRONTEND_URL);

  if (context) {
    url.searchParams.set("role", context.role);
    if (context.redirect) {
      url.searchParams.set("redirect", context.redirect);
    }
  }

  if (errorCode) {
    url.searchParams.set("error", errorCode);
  }

  return url.toString();
}

function getSafeCallbackErrorCode(error: unknown): string {
  if (error instanceof AppError && REDIRECTABLE_ERROR_CODES.has(error.code)) {
    return error.code;
  }
  return "OAUTH_PROVIDER_ERROR";
}

function setOAuthResponseHeaders(response: Parameters<RequestHandler>[1]): void {
  response.set({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
  });
}

/** 역할·redirect를 검증해 State 쿠키를 만들고 공급자 인증 URL을 반환하거나 redirect합니다. */
export const oauthStartController: RequestHandler = (request, response) => {
  const input = parseOAuthStartInput(request.params.provider, request.query);
  const state = createOAuthState(input.provider, input.role, input.redirect);
  const authorizationUrl = createOAuthAuthorizationUrl(input.provider, state.state);

  setOAuthResponseHeaders(response);
  setOAuthStateCookie(response, input.provider, state.cookieValue);

  if (input.responseFormat === "json") {
    return sendSuccess(response, HTTP_STATUS.OK, { url: authorizationUrl });
  }

  return response.redirect(302, authorizationUrl);
};

/**
 * State를 먼저 일회성 소비한 뒤 code를 교환하고 서비스 JWT 쿠키를 발급합니다.
 * 실패 시 공급자 원문이나 token을 노출하지 않고 프론트 callback에 제한된 오류 코드만 보냅니다.
 */
export const oauthCallbackController: RequestHandler = async (request, response) => {
  let context: OAuthStateContext | undefined;
  setOAuthResponseHeaders(response);

  try {
    const input = parseOAuthCallbackInput(request.params.provider, request.query);
    context = consumeOAuthState(
      request,
      response,
      input.provider,
      input.state,
    );

    if (input.providerError) {
      throw new BadRequestError("SNS 로그인이 취소되었습니다.", "OAUTH_CANCELLED");
    }

    if (!input.code || !input.state) {
      throw new BadRequestError(
        "OAuth 인증 code가 필요합니다.",
        "OAUTH_CODE_MISSING",
      );
    }

    const profile = await fetchOAuthProfile(input.provider, input.code, input.state);
    const result = await authenticateWithOAuth(profile, context.role);

    setAuthCookies(response, result.tokens);
    return response.redirect(302, buildFrontendCallbackUrl(context));
  } catch (error: unknown) {
    // Callback은 브라우저 탐색이므로 JSON 대신 공통 프론트 오류 화면으로만 복귀시킵니다.
    return response.redirect(
      302,
      buildFrontendCallbackUrl(context, getSafeCallbackErrorCode(error)),
    );
  }
};
