/**
 * OAuth State의 난수 생성, 서명·만료·공급자 검증과 callback 쿠키 소거를 확인합니다.
 */
import type { Request, Response } from "express";

import {
  consumeOAuthState,
  createOAuthState,
} from "../../src/modules/auth/oauth.state";

function createResponse(): Response {
  return {
    clearCookie: jest.fn(),
  } as unknown as Response;
}

describe("OAuth state", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("정상 State에서 역할과 redirect를 복원하고 쿠키를 즉시 지운다", () => {
    const created = createOAuthState("google", "MOVER", "/requests");
    const request = {
      cookies: { oauthState_google: created.cookieValue },
    } as unknown as Request;
    const response = createResponse();

    expect(
      consumeOAuthState(request, response, "google", created.state),
    ).toEqual(expect.objectContaining({
      provider: "google",
      role: "MOVER",
      redirect: "/requests",
    }));
    expect(response.clearCookie).toHaveBeenCalledWith(
      "oauthState_google",
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );

    expect(() =>
      consumeOAuthState(request, createResponse(), "google", created.state),
    ).toThrow(expect.objectContaining({ code: "OAUTH_INVALID_STATE" }));
  });

  test("query State 또는 서명이 바뀌면 OAUTH_INVALID_STATE로 거절한다", () => {
    const created = createOAuthState("kakao", "CUSTOMER");
    const request = {
      cookies: { oauthState_kakao: `${created.cookieValue}tampered` },
    } as unknown as Request;

    expect(() =>
      consumeOAuthState(request, createResponse(), "kakao", "different-state"),
    ).toThrow(expect.objectContaining({ code: "OAUTH_INVALID_STATE" }));
  });

  test("10분이 지난 State를 거절한다", () => {
    const now = 1_700_000_000_000;
    jest.spyOn(Date, "now").mockReturnValue(now);
    const created = createOAuthState("naver", "CUSTOMER");
    jest.mocked(Date.now).mockReturnValue(now + 10 * 60 * 1000 + 1);
    const request = {
      cookies: { oauthState_naver: created.cookieValue },
    } as unknown as Request;

    expect(() =>
      consumeOAuthState(request, createResponse(), "naver", created.state),
    ).toThrow(expect.objectContaining({ code: "OAUTH_INVALID_STATE" }));
  });
});
