import "dotenv/config";

/**
 * 서버 전역 환경변수를 한 곳에서 검증합니다.
 * Secret 원문을 로그에 남기지 않으며 잘못된 보안 조합은 서버 시작 전에 차단합니다.
 */

type NodeEnvironment = "development" | "test" | "production";

type CookieSameSite = "lax" | "strict" | "none";

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }

  return value;
}

function getRequiredSecret(name: string): string {
  const secret = getRequiredEnvironmentVariable(name);

  if (secret.length < 32) {
    throw new Error(`${name}은 32자 이상이어야 합니다.`);
  }

  return secret;
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  const nodeEnvironment = value ?? "development";

  if (
    nodeEnvironment !== "development" &&
    nodeEnvironment !== "test" &&
    nodeEnvironment !== "production"
  ) {
    throw new Error(`올바르지 않은 NODE_ENV 값입니다: ${nodeEnvironment}`);
  }

  return nodeEnvironment;
}

function parsePositiveInteger(
  value: string | undefined,
  defaultValue: number,
  name: string,
): number {
  if (!value) {
    return defaultValue;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name}은 양의 정수여야 합니다.`);
  }

  return parsedValue;
}

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`boolean 환경변수에는 true 또는 false만 사용할 수 있습니다.`);
}

function parseCookieSameSite(value: string | undefined): CookieSameSite {
  const sameSite = value ?? "lax";

  if (sameSite !== "lax" && sameSite !== "strict" && sameSite !== "none") {
    throw new Error(
      `COOKIE_SAME_SITE 값은 lax, strict, none 중 하나여야 합니다.`,
    );
  }

  return sameSite;
}

function parseCorsOrigins(
  value: string | undefined,
  nodeEnvironment: NodeEnvironment,
): string[] {
  const defaultOrigins =
    nodeEnvironment === "development" ? ["http://localhost:3000"] : [];

  const origins = value
    ? value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : defaultOrigins;

  if (nodeEnvironment === "production" && origins.length === 0) {
    throw new Error("production 환경에서는 CORS_ORIGINS가 필요합니다.");
  }

  return origins;
}

function parseTrustProxy(
  value: string | undefined,
  nodeEnvironment: NodeEnvironment,
): false | number {
  if (value === undefined) {
    return nodeEnvironment === "production" ? 1 : false;
  }

  if (value === "false") {
    return false;
  }

  const proxyHops = Number(value);
  if (Number.isInteger(proxyHops) && proxyHops > 0) {
    return proxyHops;
  }

  // true는 임의 X-Forwarded-For를 신뢰해 IP 요청 제한을 우회할 수 있으므로 허용하지 않습니다.
  throw new Error("TRUST_PROXY는 false 또는 신뢰할 proxy hop 수여야 합니다.");
}

function parseHttpOrigin(
  value: string,
  name: string,
  nodeEnvironment: NodeEnvironment,
): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name}은 올바른 URL이어야 합니다.`);
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name}에는 origin만 설정해야 합니다.`);
  }

  if (nodeEnvironment === "production" && url.protocol !== "https:") {
    throw new Error(`production 환경의 ${name}은 HTTPS여야 합니다.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name}은 HTTP 또는 HTTPS URL이어야 합니다.`);
  }

  return url.origin;
}

function getOptionalEnvironmentVariable(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

const nodeEnvironment = parseNodeEnvironment(process.env.NODE_ENV);

const cookieSecure = parseBoolean(
  process.env.COOKIE_SECURE,
  nodeEnvironment === "production",
);

const cookieSameSite = parseCookieSameSite(process.env.COOKIE_SAME_SITE);

const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS, nodeEnvironment);

const frontendUrl = parseHttpOrigin(
  process.env.FRONTEND_URL?.trim() || "http://localhost:3000",
  "FRONTEND_URL",
  nodeEnvironment,
);

const oauthCallbackBaseUrl = parseHttpOrigin(
  process.env.OAUTH_CALLBACK_BASE_URL?.trim() || "http://localhost:4000",
  "OAUTH_CALLBACK_BASE_URL",
  nodeEnvironment,
);

if (cookieSameSite === "none" && !cookieSecure) {
  throw new Error("SameSite=None 쿠키는 COOKIE_SECURE=true가 필요합니다.");
}

if (!corsOrigins.includes(frontendUrl)) {
  throw new Error("FRONTEND_URL은 CORS_ORIGINS에 포함되어야 합니다.");
}

export const env = {
  NODE_ENV: nodeEnvironment,

  PORT: parsePositiveInteger(process.env.PORT, 4000, "PORT"),

  DATABASE_URL: getRequiredEnvironmentVariable("DATABASE_URL"),

  ACCESS_TOKEN_SECRET: getRequiredSecret("ACCESS_TOKEN_SECRET"),

  REFRESH_TOKEN_SECRET: getRequiredSecret("REFRESH_TOKEN_SECRET"),

  JWT_ISSUER: process.env.JWT_ISSUER?.trim() || "moving-api",

  CORS_ORIGINS: corsOrigins,

  FRONTEND_URL: frontendUrl,

  OAUTH_CALLBACK_BASE_URL: oauthCallbackBaseUrl,

  GOOGLE_CLIENT_ID: getOptionalEnvironmentVariable("GOOGLE_CLIENT_ID"),

  GOOGLE_CLIENT_SECRET: getOptionalEnvironmentVariable("GOOGLE_CLIENT_SECRET"),

  KAKAO_CLIENT_ID: getOptionalEnvironmentVariable("KAKAO_CLIENT_ID"),

  KAKAO_CLIENT_SECRET: getOptionalEnvironmentVariable("KAKAO_CLIENT_SECRET"),

  NAVER_CLIENT_ID: getOptionalEnvironmentVariable("NAVER_CLIENT_ID"),

  NAVER_CLIENT_SECRET: getOptionalEnvironmentVariable("NAVER_CLIENT_SECRET"),

  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN?.trim() || undefined,

  COOKIE_SECURE: cookieSecure,

  COOKIE_SAME_SITE: cookieSameSite,

  ACCESS_TOKEN_MAX_AGE_MS: parsePositiveInteger(
    process.env.ACCESS_TOKEN_MAX_AGE_MS,
    30 * 60 * 1000,
    "ACCESS_TOKEN_MAX_AGE_MS",
  ),

  REFRESH_TOKEN_MAX_AGE_MS: parsePositiveInteger(
    process.env.REFRESH_TOKEN_MAX_AGE_MS,
    7 * 24 * 60 * 60 * 1000,
    "REFRESH_TOKEN_MAX_AGE_MS",
  ),

  TRUST_PROXY: parseTrustProxy(
    process.env.TRUST_PROXY,
    nodeEnvironment,
  ),

  SWAGGER_ENABLED: parseBoolean(
    process.env.SWAGGER_ENABLED,
    nodeEnvironment !== "production",
  ),
} as const;
