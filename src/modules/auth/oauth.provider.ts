/**
 * Google·Kakao·Naver의 authorization URL, code 교환, 최소 프로필 조회를 담당합니다.
 * 공급자 토큰과 원문 응답은 함수 밖으로 반환하거나 저장·로그하지 않습니다.
 */
import { BadGatewayError, ServiceUnavailableError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import type { SocialProvider } from "../../generated/prisma/enums";
import type { OAuthProfile, OAuthProvider } from "./oauth.dto";

const OAUTH_FETCH_TIMEOUT_MS = 10_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

function getCredentials(provider: OAuthProvider): OAuthCredentials {
  const values = {
    google: [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET],
    kakao: [env.KAKAO_CLIENT_ID, env.KAKAO_CLIENT_SECRET],
    naver: [env.NAVER_CLIENT_ID, env.NAVER_CLIENT_SECRET],
  }[provider];
  const [clientId, clientSecret] = values;

  if (!clientId || !clientSecret) {
    throw new ServiceUnavailableError(
      "해당 SNS 로그인이 아직 설정되지 않았습니다.",
      "OAUTH_NOT_CONFIGURED",
    );
  }

  return { clientId, clientSecret };
}

function getCallbackUrl(provider: OAuthProvider): string {
  return `${env.OAUTH_CALLBACK_BASE_URL}/auth/oauth/${provider}/callback`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => undefined);
    const record = asRecord(body);

    if (!response.ok || !record) {
      throw new BadGatewayError();
    }

    return record;
  } catch (error: unknown) {
    if (error instanceof BadGatewayError) {
      throw error;
    }

    // 네트워크·timeout 세부 내용에는 공급자 URL이나 응답이 포함될 수 있어 외부로 전달하지 않습니다.
    throw new BadGatewayError();
  }
}

function readAccessToken(response: Record<string, unknown>): string {
  const accessToken = readString(response, "access_token");
  if (!accessToken) {
    throw new BadGatewayError();
  }
  return accessToken;
}

function normalizeProfile(
  provider: SocialProvider,
  socialIdValue: unknown,
  emailValue: unknown,
  nameValue: unknown,
): OAuthProfile {
  const socialId =
    typeof socialIdValue === "number" && Number.isSafeInteger(socialIdValue)
      ? String(socialIdValue)
      : typeof socialIdValue === "string"
        ? socialIdValue.trim()
        : "";
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";

  if (!socialId || socialId.length > 255) {
    throw new BadGatewayError();
  }

  if (email && (email.length > 255 || !EMAIL_PATTERN.test(email))) {
    throw new BadGatewayError();
  }

  const receivedName = typeof nameValue === "string" ? nameValue.trim() : "";
  const fallbackName = email.split("@")[0] || "Moving 사용자";
  const name = (receivedName || fallbackName).slice(0, 50);

  return {
    provider,
    socialId,
    ...(email ? { email } : {}),
    name,
  };
}

/** 검증된 State를 포함한 공급자 authorization URL을 생성합니다. */
export function createOAuthAuthorizationUrl(provider: OAuthProvider, state: string): string {
  const { clientId } = getCredentials(provider);
  const callbackUrl = getCallbackUrl(provider);

  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      state,
    }).toString();
    return url.toString();
  }

  if (provider === "kakao") {
    const url = new URL("https://kauth.kakao.com/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: "profile_nickname account_email",
      state,
    }).toString();
    return url.toString();
  }

  const url = new URL("https://nid.naver.com/oauth2.0/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    state,
  }).toString();
  return url.toString();
}

async function getGoogleProfile(code: string): Promise<OAuthProfile> {
  const credentials = getCredentials("google");
  const tokenResponse = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getCallbackUrl("google"),
    }),
  });
  const profile = await fetchJson("https://openidconnect.googleapis.com/v1/userinfo", {
    method: "GET",
    headers: { Authorization: `Bearer ${readAccessToken(tokenResponse)}` },
  });

  return normalizeProfile(
    "GOOGLE",
    profile.sub,
    profile.email_verified === true ? profile.email : undefined,
    profile.name,
  );
}

async function getKakaoProfile(code: string): Promise<OAuthProfile> {
  const credentials = getCredentials("kakao");
  const tokenResponse = await fetchJson("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getCallbackUrl("kakao"),
    }),
  });
  const profile = await fetchJson("https://kapi.kakao.com/v2/user/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${readAccessToken(tokenResponse)}` },
  });
  const account = asRecord(profile.kakao_account);
  const kakaoProfile = asRecord(account?.profile);

  return normalizeProfile(
    "KAKAO",
    profile.id,
    account?.is_email_valid === false || account?.is_email_verified === false
      ? undefined
      : account?.email,
    kakaoProfile?.nickname,
  );
}

async function getNaverProfile(code: string, state: string): Promise<OAuthProfile> {
  const credentials = getCredentials("naver");
  const tokenResponse = await fetchJson("https://nid.naver.com/oauth2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      grant_type: "authorization_code",
      state,
    }),
  });
  const profileResponse = await fetchJson("https://openapi.naver.com/v1/nid/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${readAccessToken(tokenResponse)}` },
  });
  const profile = asRecord(profileResponse.response);

  if (profileResponse.resultcode !== "00" || !profile) {
    throw new BadGatewayError();
  }

  return normalizeProfile(
    "NAVER",
    profile.id,
    profile.email,
    profile.name ?? profile.nickname,
  );
}

/** Authorization code를 공급자 토큰으로 교환한 뒤 최소 사용자 정보만 정규화합니다. */
export function fetchOAuthProfile(
  provider: OAuthProvider,
  code: string,
  state: string,
): Promise<OAuthProfile> {
  if (provider === "google") {
    return getGoogleProfile(code);
  }
  if (provider === "kakao") {
    return getKakaoProfile(code);
  }
  return getNaverProfile(code, state);
}
