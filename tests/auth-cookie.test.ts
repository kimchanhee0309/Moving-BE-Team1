/**
 * Auth 쿠키가 HttpOnly와 올바른 만료시간·경로로 발급되고 동일 경로로 삭제되는지 검증합니다.
 */
import type { Request, Response } from "express";

import {
  clearAuthCookies,
  getAccessTokenFromCookie,
  getRefreshTokenFromCookie,
  setAuthCookies,
} from "../src/common/cookies/auth-cookie";

function createResponseMock(): Pick<Response, "cookie" | "clearCookie"> {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

describe("Auth cookie", () => {
  test("Access와 Refresh Token을 서로 다른 경로로 발급한다", () => {
    const response = createResponseMock();

    setAuthCookies(response as Response, {
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      "accessToken",
      "access-token",
      expect.objectContaining({ httpOnly: true, maxAge: 1_800_000, path: "/" }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      "refreshToken",
      "refresh-token",
      expect.objectContaining({
        httpOnly: true,
        maxAge: 604_800_000,
        path: "/auth/refresh",
      }),
    );
  });

  test("발급 경로와 같은 경로로 쿠키를 삭제한다", () => {
    const response = createResponseMock();

    clearAuthCookies(response as Response);

    expect(response.clearCookie).toHaveBeenNthCalledWith(
      1,
      "accessToken",
      expect.objectContaining({ path: "/" }),
    );
    expect(response.clearCookie).toHaveBeenNthCalledWith(
      2,
      "refreshToken",
      expect.objectContaining({ path: "/auth/refresh" }),
    );
  });

  test("문자열 쿠키만 인증 토큰으로 읽는다", () => {
    const request = {
      cookies: { accessToken: "access", refreshToken: "refresh" },
    } as unknown as Request;

    expect(getAccessTokenFromCookie(request)).toBe("access");
    expect(getRefreshTokenFromCookie(request)).toBe("refresh");
  });
});
