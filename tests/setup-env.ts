/**
 * 단위 테스트가 실제 DB나 운영 Secret 없이 환경 설정 모듈을 불러오도록 안전한 값을 주입합니다.
 * 이 값은 테스트 프로세스 전용이며 외부 서비스 접속에는 사용하지 않습니다.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/moving_test";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.OAUTH_CALLBACK_BASE_URL = "http://localhost:4000";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.KAKAO_CLIENT_ID = "test-kakao-client-id";
process.env.KAKAO_CLIENT_SECRET = "test-kakao-client-secret";
process.env.NAVER_CLIENT_ID = "test-naver-client-id";
process.env.NAVER_CLIENT_SECRET = "test-naver-client-secret";
process.env.ACCESS_TOKEN_SECRET = "test-access-token-secret-at-least-32-characters";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-token-secret-at-least-32-characters";
process.env.ACCESS_TOKEN_MAX_AGE_MS = "1800000";
process.env.REFRESH_TOKEN_MAX_AGE_MS = "604800000";
process.env.COOKIE_SECURE = "false";
process.env.COOKIE_SAME_SITE = "lax";
process.env.TRUST_PROXY = "false";
process.env.SWAGGER_ENABLED = "false";
