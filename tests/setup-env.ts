/**
 * 단위 테스트가 실제 DB나 운영 Secret 없이 환경 설정 모듈을 불러오도록 값을 주입합니다.
 * 테스트 전용 값이며 실제 외부 서비스 접속에는 사용하지 않습니다.
 * Redis 연결을 호출하는 테스트는 별도 mock 또는 테스트용 Redis가 필요합니다.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/moving_test";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.OAUTH_CALLBACK_BASE_URL = "http://localhost:4000";

process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.KAKAO_CLIENT_ID = "test-kakao-client-id";
process.env.KAKAO_CLIENT_SECRET = "test-kakao-client-secret";
process.env.NAVER_CLIENT_ID = "test-naver-client-id";
process.env.NAVER_CLIENT_SECRET = "test-naver-client-secret";

process.env.ACCESS_TOKEN_SECRET =
  "test-access-token-secret-at-least-32-characters";
process.env.REFRESH_TOKEN_SECRET =
  "test-refresh-token-secret-at-least-32-characters";
process.env.PASSWORD_RESET_TOKEN_SECRET =
  "test-password-reset-secret-at-least-32-characters";
process.env.PASSWORD_RESET_CODE_SECRET =
  "test-password-code-secret-at-least-32-characters";

process.env.PASSWORD_RESET_DELIVERY = "smtp";
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_PORT = "587";
process.env;
