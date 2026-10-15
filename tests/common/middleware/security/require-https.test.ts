/**
 * 운영 환경에서 평문 요청은 설정된 공개 origin으로 이동하고 HTTPS 요청은 통과하는지 검증합니다.
 */
import type { NextFunction, Request, Response } from "express";

describe("HTTPS middleware", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "https://moving.example";
    process.env.FRONTEND_URL = "https://moving.example";
    process.env.OAUTH_CALLBACK_BASE_URL = "https://api.moving.example";
    process.env.COOKIE_SECURE = "true";
    process.env.TRUST_PROXY = "1";
  });

  afterEach(() => {
    process.env.NODE_ENV = "test";
    process.env.CORS_ORIGINS = "http://localhost:3000";
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.OAUTH_CALLBACK_BASE_URL = "http://localhost:4000";
    process.env.COOKIE_SECURE = "false";
    process.env.TRUST_PROXY = "false";
  });

  test("평문 요청을 Host header가 아닌 설정된 HTTPS origin으로 308 이동한다", async () => {
    const { requireHttps } = await import("../../../../src/common/middleware/security/require-https");
    const request = {
      secure: false,
      originalUrl: "/auth/me?source=test",
    } as Request;
    const response = { redirect: jest.fn() } as unknown as Response;
    const next: NextFunction = jest.fn();

    requireHttps(request, response, next);

    expect(response.redirect).toHaveBeenCalledWith(
      308,
      "https://api.moving.example/auth/me?source=test",
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("프록시가 HTTPS로 확인한 요청은 다음 middleware로 전달한다", async () => {
    const { requireHttps } = await import("../../../../src/common/middleware/security/require-https");
    const request = { secure: true } as Request;
    const response = {} as Response;
    const next: NextFunction = jest.fn();

    requireHttps(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
