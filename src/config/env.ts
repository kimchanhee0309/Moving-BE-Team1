/**
 * 서버 전역 환경변수를 한 곳에서 검증합니다.
 * 인증·스토리지·Redis 설정을 파싱하고 잘못된 설정은 시작 전에 차단합니다.
 * 실제 인프라 연결은 각 lib 모듈이 담당하며 Secret 원문을 로그에 남기지 않습니다.
 */
import "dotenv/config";

type NodeEnvironment = "development" | "test" | "production";
type CookieSameSite = "lax" | "strict" | "none";
type PasswordResetDelivery = "console" | "smtp";

/** local: 서버 디스크, s3: S3에 저장하고 CloudFront URL로 공개합니다. */
type ProfileImageStorageDriver = "local" | "s3";

/** standalone: 단일 endpoint 연결, cluster: Cluster topology 기반 연결입니다. */
type RedisMode = "standalone" | "cluster";

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

  throw new Error("boolean 환경변수에는 true 또는 false만 사용할 수 있습니다.");
}

function parseCookieSameSite(value: string | undefined): CookieSameSite {
  const sameSite = value ?? "lax";

  if (sameSite !== "lax" && sameSite !== "strict" && sameSite !== "none") {
    throw new Error(
      "COOKIE_SAME_SITE 값은 lax, strict, none 중 하나여야 합니다.",
    );
  }

  return sameSite;
}

function parsePasswordResetDelivery(
  value: string | undefined,
  nodeEnvironment: NodeEnvironment,
): PasswordResetDelivery {
  const delivery = value?.trim().toLowerCase() || "smtp";

  if (delivery !== "console" && delivery !== "smtp") {
    throw new Error("PASSWORD_RESET_DELIVERY는 console 또는 smtp여야 합니다.");
  }

  if (nodeEnvironment === "production" && delivery === "console") {
    throw new Error(
      "production 환경에서는 PASSWORD_RESET_DELIVERY=console을 사용할 수 없습니다.",
    );
  }

  return delivery;
}

function parseProfileImageStorageDriver(
  value: string | undefined,
): ProfileImageStorageDriver {
  const driver = value?.trim().toLowerCase() || "local";

  if (driver !== "local" && driver !== "s3") {
    throw new Error("PROFILE_IMAGE_STORAGE는 local 또는 s3여야 합니다.");
  }

  return driver;
}

/**
 * CloudFront 배포 도메인을 hostname으로만 받습니다.
 * scheme이나 경로가 섞이면 이미지 URL과 삭제 대상 판정이 어긋나므로 거절합니다.
 */
function parseCloudFrontDomain(value: string | undefined): string | undefined {
  const domain = value?.trim().toLowerCase();

  if (!domain) {
    return undefined;
  }

  if (
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      domain,
    )
  ) {
    throw new Error(
      "CLOUDFRONT_DOMAIN에는 https://와 경로를 뺀 도메인만 설정해야 합니다. 예: d1234abcd.cloudfront.net",
    );
  }

  return domain;
}

/**
 * 캐시 무효화 대상 CloudFront 배포 ID를 받습니다.
 * 값이 없으면 무효화를 건너뛰므로 선택 값입니다.
 */
function parseCloudFrontDistributionId(
  value: string | undefined,
): string | undefined {
  const distributionId = value?.trim();

  if (!distributionId) {
    return undefined;
  }

  if (!/^E[A-Z0-9]{5,31}$/.test(distributionId)) {
    throw new Error(
      "CLOUDFRONT_DISTRIBUTION_ID에는 도메인이 아닌 CloudFront 배포 ID를 설정해야 합니다. 예: E1ABCDEFGHIJKL",
    );
  }

  return distributionId;
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

  // true는 임의 X-Forwarded-For를 신뢰할 수 있으므로 허용하지 않습니다.
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

/**
 * Redis 접속 방식을 검증합니다.
 * @param value standalone 또는 cluster
 * @returns 검증된 연결 모드
 * @throws 지원하지 않는 모드
 */
function parseRedisMode(value: string | undefined): RedisMode {
  const mode = value?.trim().toLowerCase() || "standalone";

  if (mode !== "standalone" && mode !== "cluster") {
    throw new Error("REDIS_MODE는 standalone 또는 cluster여야 합니다.");
  }

  return mode;
}

/**
 * Redis 접속 URL과 인증정보 인코딩을 검증합니다.
 * @param value redis:// 또는 rediss:// URL
 * @returns 검증된 URL
 * @throws 누락, 잘못된 protocol·port·경로·인코딩
 * @remarks ElastiCache와 로컬 설정을 맞추기 위해 DB 0만 허용합니다.
 */
function parseRedisUrl(value: string | undefined): string {
  const redisUrl = value?.trim();

  if (!redisUrl) {
    throw new Error("REDIS_URL 환경변수가 설정되지 않았습니다.");
  }

  try {
    const parsed = new URL(redisUrl);
    const port = parsed.port ? Number(parsed.port) : 6379;

    if (
      !["redis:", "rediss:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !["", "/", "/0"].includes(parsed.pathname) ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("INVALID_REDIS_URL");
    }

    // Cluster 연결에서는 URL 인증정보를 직접 해석하므로 인코딩도 검증합니다.
    decodeURIComponent(parsed.username);
    decodeURIComponent(parsed.password);
  } catch {
    // URL에는 비밀번호가 포함될 수 있으므로 원문을 오류에 넣지 않습니다.
    throw new Error(
      "REDIS_URL은 DB 0을 사용하는 redis:// 또는 rediss:// 접속 URL이어야 합니다.",
    );
  }

  return redisUrl;
}

/**
 * 프로젝트·환경별 Redis namespace를 검증합니다.
 * @param value moving:development 같은 prefix
 * @returns 끝에 콜론이 없는 prefix
 * @throws 누락 또는 허용되지 않은 문자
 */
function parseRedisKeyPrefix(value: string | undefined): string {
  const prefix = value?.trim();

  if (!prefix || !/^[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)*$/.test(prefix)) {
    throw new Error(
      "REDIS_KEY_PREFIX는 moving:development처럼 지정해야 합니다.",
    );
  }

  return prefix;
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

const profileImageStorage = parseProfileImageStorageDriver(
  process.env.PROFILE_IMAGE_STORAGE,
);

const awsBucketName = getOptionalEnvironmentVariable("AWS_BUCKET_NAME");

const cloudFrontDomain = parseCloudFrontDomain(process.env.CLOUDFRONT_DOMAIN);

const cloudFrontDistributionId = parseCloudFrontDistributionId(
  process.env.CLOUDFRONT_DISTRIBUTION_ID,
);

// s3 설정 누락은 업로드 요청 시점이 아니라 서버 시작 전에 확인합니다.
// AWS 자격 증명은 SDK의 환경변수 또는 IAM Role 처리를 사용합니다.
if (profileImageStorage === "s3" && (!awsBucketName || !cloudFrontDomain)) {
  throw new Error(
    "PROFILE_IMAGE_STORAGE=s3에는 AWS_BUCKET_NAME과 CLOUDFRONT_DOMAIN이 필요합니다.",
  );
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

  PASSWORD_RESET_TOKEN_SECRET: getOptionalEnvironmentVariable(
    "PASSWORD_RESET_TOKEN_SECRET",
  ),

  PASSWORD_RESET_CODE_SECRET: getOptionalEnvironmentVariable(
    "PASSWORD_RESET_CODE_SECRET",
  ),

  PASSWORD_RESET_DELIVERY: parsePasswordResetDelivery(
    process.env.PASSWORD_RESET_DELIVERY,
    nodeEnvironment,
  ),

  // 구버전 FE가 남아 있는 동안 false로 두고 인증 화면 배포 후 전환합니다.
  SIGNUP_EMAIL_VERIFICATION_REQUIRED: parseBoolean(
    process.env.SIGNUP_EMAIL_VERIFICATION_REQUIRED,
    false,
  ),

  SMTP_HOST: getOptionalEnvironmentVariable("SMTP_HOST"),

  SMTP_PORT: parsePositiveInteger(process.env.SMTP_PORT, 587, "SMTP_PORT"),

  SMTP_SECURE: parseBoolean(process.env.SMTP_SECURE, false),

  SMTP_USER: getOptionalEnvironmentVariable("SMTP_USER"),

  SMTP_PASS: getOptionalEnvironmentVariable("SMTP_PASS"),

  SMTP_FROM: getOptionalEnvironmentVariable("SMTP_FROM"),

  PROFILE_IMAGE_STORAGE: profileImageStorage,

  AWS_REGION: process.env.AWS_REGION?.trim() || "ap-northeast-2",

  AWS_BUCKET_NAME: awsBucketName,

  CLOUDFRONT_DOMAIN: cloudFrontDomain,

  // 없으면 CloudFront 캐시 무효화를 건너뜁니다.
  CLOUDFRONT_DISTRIBUTION_ID: cloudFrontDistributionId,

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

  TRUST_PROXY: parseTrustProxy(process.env.TRUST_PROXY, nodeEnvironment),

  SWAGGER_ENABLED: parseBoolean(
    process.env.SWAGGER_ENABLED,
    nodeEnvironment !== "production",
  ),

  // 로컬·ElastiCache 구성에 따라 연결 구현을 선택합니다.
  REDIS_MODE: parseRedisMode(process.env.REDIS_MODE),

  // rediss://를 사용하면 TLS 연결이 활성화됩니다.
  REDIS_URL: parseRedisUrl(process.env.REDIS_URL),

  // 같은 환경의 모든 백엔드 인스턴스에서 같은 값을 사용합니다.
  REDIS_KEY_PREFIX: parseRedisKeyPrefix(process.env.REDIS_KEY_PREFIX),
} as const;
