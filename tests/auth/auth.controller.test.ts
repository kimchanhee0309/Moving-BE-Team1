/**
 * 이메일 Auth Controller가 가입·로그인·세션 응답을 data.user로 통일하고 쿠키를 발급하는지 검증합니다.
 */
jest.mock("../../src/modules/auth/auth.validator", () => ({
  parseLoginInput: jest.fn(),
  parseSignUpInput: jest.fn(),
}));

jest.mock("../../src/modules/auth/auth.service", () => ({
  getCurrentUser: jest.fn(),
  login: jest.fn(),
  refreshAuth: jest.fn(),
  signUp: jest.fn(),
}));

jest.mock("../../src/common/cookies/auth-cookie", () => ({
  clearAuthCookies: jest.fn(),
  getRefreshTokenFromCookie: jest.fn(),
  setAuthCookies: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import {
  clearAuthCookies,
  getRefreshTokenFromCookie,
  setAuthCookies,
} from "../../src/common/cookies/auth-cookie";
import {
  loginController,
  logoutController,
  meController,
  refreshController,
  signUpController,
} from "../../src/modules/auth/auth.controller";
import {
  getCurrentUser,
  login,
  refreshAuth,
  signUp,
} from "../../src/modules/auth/auth.service";
import {
  parseLoginInput,
  parseSignUpInput,
} from "../../src/modules/auth/auth.validator";

const user = {
  id: "user-id",
  name: "홍길동",
  email: "user@example.com",
  phone: "01012345678",
  role: "CUSTOMER" as const,
  profileCompleted: false,
};

const tokens = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

function createResponse(): Response {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  jest.mocked(response.status).mockReturnValue(response);
  return response;
}

describe("Auth controller response contract", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("회원가입 성공 시 두 인증 쿠키와 data.user를 반환한다", async () => {
    const input = {
      name: "홍길동",
      email: "user@example.com",
      phone: "01012345678",
      password: "Password1!",
      role: "CUSTOMER" as const,
    };
    jest.mocked(parseSignUpInput).mockReturnValue(input);
    jest.mocked(signUp).mockResolvedValue({ user, tokens });
    const response = createResponse();

    await signUpController(
      { body: input } as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(setAuthCookies).toHaveBeenCalledWith(response, tokens);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { user },
    });
  });

  test("현재 사용자 조회는 data.user 형식을 사용한다", async () => {
    jest.mocked(getCurrentUser).mockResolvedValue(user);
    const response = createResponse();

    await meController(
      { auth: { userId: "user-id", role: "CUSTOMER" } } as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(response.json).toHaveBeenCalledWith({ success: true, data: { user } });
  });

  test("로그인 성공 시 두 인증 쿠키와 data.user를 반환한다", async () => {
    const input = {
      email: "user@example.com",
      password: "Password1!",
      role: "CUSTOMER" as const,
    };
    jest.mocked(parseLoginInput).mockReturnValue(input);
    jest.mocked(login).mockResolvedValue({ user, tokens });
    const response = createResponse();

    await loginController(
      { body: input } as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(setAuthCookies).toHaveBeenCalledWith(response, tokens);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { user } });
  });

  test("토큰 갱신도 회전된 쿠키와 최신 data.user를 반환한다", async () => {
    jest.mocked(getRefreshTokenFromCookie).mockReturnValue("old-refresh-token");
    jest.mocked(refreshAuth).mockResolvedValue({ user, tokens });
    const response = createResponse();

    await refreshController(
      {} as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(setAuthCookies).toHaveBeenCalledWith(response, tokens);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { user } });
  });

  test("로그아웃은 인증 여부와 관계없이 쿠키를 지우고 공통 빈 응답을 반환한다", () => {
    const response = createResponse();

    logoutController(
      {} as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(clearAuthCookies).toHaveBeenCalledWith(response);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: null });
  });
});
