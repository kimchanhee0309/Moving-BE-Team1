/**
 * 공통 Auth 쿠키의 발급·조회·삭제 계약을 실제 Express Set-Cookie 헤더로 검증합니다.
 * Node 응답 객체에 Express 응답 기능을 연결하여 경로·만료·보안 옵션을 검사합니다.
 * 서버를 열거나 DB·JWT 검증을 수행하지 않으며 환경 변경은 각 시나리오 뒤 복원합니다.
 */
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import express from "express";
import type { Request, Response } from "express";

import {
  clearAuthCookies,
  getAccessTokenFromCookie,
  getRefreshTokenFromCookie,
  setAuthCookies,
} from "../../src/common/cookies/auth-cookie";
import { env } from "../../src/config/env";

function createResponse(): Response {
  const response = new ServerResponse(new IncomingMessage(new Socket()));
  // Express도 Node ServerResponse에 응답 prototype을 연결한다. 같은 구조를 구성한 뒤 타입을 좁힌다.
  Object.setPrototypeOf(response, express.response);
  return response as Response;
}

function createRequest(cookies: unknown): Request {
  const request = new IncomingMessage(new Socket());
  // Express 요청 prototype과 cookie-parser가 채우는 입력을 구성하여 실제 요청 형태로 검증한다.
  Object.setPrototypeOf(request, express.request);
  Object.assign(request, { cookies });
  return request as Request;
}

function getCookieHeaders(response: Response): string[] {
  const headers = response.getHeader("set-cookie");
  if (!Array.isArray(headers)) {
    throw new Error("인증 쿠키 두 개가 Set-Cookie 배열로 발급되어야 합니다.");
  }
  return headers;
}

const cookieEnvironments = [
  { label: "로컬 Lax", secure: false, sameSite: "lax", domain: undefined, header: "Lax" },
  { label: "HTTPS Lax", secure: true, sameSite: "lax", domain: undefined, header: "Lax" },
  { label: "HTTPS None 및 Domain", secure: true, sameSite: "none", domain: "example.test", header: "None" },
  { label: "HTTPS Strict", secure: true, sameSite: "strict", domain: undefined, header: "Strict" },
] satisfies {
  label: string;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  domain: string | undefined;
  header: string;
}[];

describe("Auth cookie", () => {
  beforeEach(() => {
    jest.replaceProperty(env, "ACCESS_TOKEN_MAX_AGE_MS", 1_800_000);
    jest.replaceProperty(env, "REFRESH_TOKEN_MAX_AGE_MS", 604_800_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each(cookieEnvironments)("$label: 발급과 삭제의 경로·보안 옵션을 유지한다", (settings) => {
    // 환경별 발급 옵션이 삭제에도 유지되어야 브라우저에 같은 이름의 쿠키가 남지 않는다.
    jest.replaceProperty(env, "COOKIE_SECURE", settings.secure);
    jest.replaceProperty(env, "COOKIE_SAME_SITE", settings.sameSite);
    jest.replaceProperty(env, "COOKIE_DOMAIN", settings.domain);
    const issued = createResponse();
    const cleared = createResponse();

    setAuthCookies(issued, { accessToken: "test-access", refreshToken: "test-refresh" });
    clearAuthCookies(cleared);

    const issuedHeaders = getCookieHeaders(issued);
    const clearedHeaders = getCookieHeaders(cleared);
    expect(issuedHeaders).toHaveLength(2);
    expect(clearedHeaders).toHaveLength(2);
    expect(issuedHeaders[0]).toMatch(/^accessToken=test-access; Max-Age=1800;/);
    expect(issuedHeaders[1]).toMatch(/^refreshToken=test-refresh; Max-Age=604800;/);
    expect(clearedHeaders[0]).toMatch(/^accessToken=;/);
    expect(clearedHeaders[1]).toMatch(/^refreshToken=;/);

    for (const headers of [issuedHeaders, clearedHeaders]) {
      expect(headers[0]).toContain("; Path=/;");
      expect(headers[1]).toContain("; Path=/auth/refresh;");
      for (const header of headers) {
        const attributes = header.split("; ");
        expect(attributes).toContain("HttpOnly");
        expect(attributes).toContain(`SameSite=${settings.header}`);
        expect(attributes.includes("Secure")).toBe(settings.secure);
        expect(attributes.filter((attribute) => attribute.startsWith("Domain="))).toEqual(
          settings.domain ? [`Domain=${settings.domain}`] : [],
        );
      }
    }
    for (const header of clearedHeaders) {
      expect(header).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
      expect(header).not.toContain("Max-Age=");
    }
  });

  test("Access와 Refresh 쿠키를 각 이름으로 분리해 읽는다", () => {
    const request = createRequest({ accessToken: "test-access", refreshToken: "test-refresh" });

    expect(getAccessTokenFromCookie(request)).toBe("test-access");
    expect(getRefreshTokenFromCookie(request)).toBe("test-refresh");
  });

  test.each([undefined, null, 123, false, ["token"], { token: "value" }])(
    "문자열이 아닌 쿠키 값 %j는 인증 토큰으로 넘기지 않는다",
    (value: unknown) => {
      const request = createRequest({ accessToken: value, refreshToken: value });
      expect(getAccessTokenFromCookie(request)).toBeNull();
      expect(getRefreshTokenFromCookie(request)).toBeNull();
    },
  );

  test("쿠키가 없는 요청에서도 예외 없이 null을 반환한다", () => {
    const request = createRequest(undefined);
    expect(getAccessTokenFromCookie(request)).toBeNull();
    expect(getRefreshTokenFromCookie(request)).toBeNull();
  });
});
