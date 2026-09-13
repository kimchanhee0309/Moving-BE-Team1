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

const nodeEnvironment = parseNodeEnvironment(process.env.NODE_ENV);

const cookieSecure = parseBoolean(
  process.env.COOKIE_SECURE,
  nodeEnvironment === "production",
);

const cookieSameSite = parseCookieSameSite(process.env.COOKIE_SAME_SITE);

if (cookieSameSite === "none" && !cookieSecure) {
  throw new Error("SameSite=None 쿠키는 COOKIE_SECURE=true가 필요합니다.");
}

export const env = {
  NODE_ENV: nodeEnvironment,

  PORT: parsePositiveInteger(process.env.PORT, 4000, "PORT"),

  DATABASE_URL: getRequiredEnvironmentVariable("DATABASE_URL"),

  ACCESS_TOKEN_SECRET: getRequiredSecret("ACCESS_TOKEN_SECRET"),

  REFRESH_TOKEN_SECRET: getRequiredSecret("REFRESH_TOKEN_SECRET"),

  JWT_ISSUER: process.env.JWT_ISSUER?.trim() || "moving-api",

  CORS_ORIGINS: parseCorsOrigins(process.env.CORS_ORIGINS, nodeEnvironment),

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

  TRUST_PROXY: parseBoolean(
    process.env.TRUST_PROXY,
    nodeEnvironment === "production",
  ),

  SWAGGER_ENABLED: parseBoolean(
    process.env.SWAGGER_ENABLED,
    nodeEnvironment !== "production",
  ),
} as const;
