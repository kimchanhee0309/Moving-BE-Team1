/**
 * 이메일 Auth Controller가 가입·로그인·세션 응답을 data.user로 통일하고 쿠키를 발급하는지 검증합니다.
 */
jest.mock("../../src/modules/auth/auth.validator", () => ({
  parseAccountRecoveryInput: jest.fn(),
  parseConfirmPasswordResetInput: jest.fn(),
  parseLoginInput: jest.fn(),
  parseSignUpInput: jest.fn(),
  parseVerifyPasswordResetCodeInput: jest.fn(),
  parseWithdrawAccountInput: jest.fn(),
}));

jest.mock("../../src/modules/auth/auth.service", () => ({
  confirmPasswordReset: jest.fn(),
  findAccount: jest.fn(),
  requestPasswordResetCode: jest.fn(),
  getCurrentUser: jest.fn(),
  login: jest.fn(),
  refreshAuth: jest.fn(),
  verifyPasswordResetCode: jest.fn(),
  restoreOptionalAuthSession: jest.fn(),
  signUp: jest.fn(),
  withdrawAccount: jest.fn(),
}));

jest.mock("../../src/common/cookies/auth-cookie", () => ({
  clearAuthCookies: jest.fn(),
  getAccessTokenFromCookie: jest.fn(),
  getRefreshTokenFromCookie: jest.fn(),
  setAuthCookies: jest.fn(),
}));

jest.mock("../../src/common/utils/auth-context", () => ({
  getAuthContext: jest.fn(),
}));

jest.mock("../../src/modules/auth/auth-rate-limit", () => ({
  markOptionalSessionRefreshFailure: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import {
  clearAuthCookies,
  getAccessTokenFromCookie,
  getRefreshTokenFromCookie,
  setAuthCookies,
} from "../../src/common/cookies/auth-cookie";
import {
  type AuthContext,
  getAuthContext,
} from "../../src/common/utils/auth-context";
import {
  confirmPasswordResetController,
  findAccountController,
  loginController,
  logoutController,
  meController,
  optionalSessionController,
  requestPasswordResetCodeController,
  refreshController,
  signUpController,
  verifyPasswordResetCodeController,
  withdrawAccountController,
} from "../../src/modules/auth/auth.controller";
import { markOptionalSessionRefreshFailure } from "../../src/modules/auth/auth-rate-limit";
import {
  confirmPasswordReset,
  findAccount,
  requestPasswordResetCode,
  getCurrentUser,
  login,
  refreshAuth,
  verifyPasswordResetCode,
  restoreOptionalAuthSession,
  signUp,
  withdrawAccount,
} from "../../src/modules/auth/auth.service";
import {
  parseAccountRecoveryInput,
  parseConfirmPasswordResetInput,
  parseLoginInput,
  parseSignUpInput,
  parseVerifyPasswordResetCodeInput,
  parseWithdrawAccountInput,
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
    const authContext: AuthContext = {
      userId: "user-id",
      role: "CUSTOMER",
    };
    const request = { auth: authContext } as Request;
    jest.mocked(getAuthContext).mockReturnValue(authContext);
    jest.mocked(getCurrentUser).mockResolvedValue(user);
    const response = createResponse();

    await meController(
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(getAuthContext).toHaveBeenCalledWith(request);
    expect(getCurrentUser).toHaveBeenCalledWith("user-id");
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

  test("계정 찾기 결과를 민감정보 없이 반환한다", async () => {
    const input = { name: "홍길동", email: "user@example.com", role: "CUSTOMER" as const };
    jest.mocked(parseAccountRecoveryInput).mockReturnValue(input);
    jest.mocked(findAccount).mockResolvedValue({ found: true, loginId: input.email, loginMethod: "EMAIL" });
    const response = createResponse();

    await findAccountController({ body: input } as Request, response, jest.fn() as NextFunction);

    expect(response.json).toHaveBeenCalledWith({ success: true, data: { found: true, loginId: input.email, loginMethod: "EMAIL" } });
  });

  test("비밀번호 재설정 코드를 발송하고 challenge 정보를 반환한다", async () => {
    const input = { name: "홍길동", email: "user@example.com", role: "CUSTOMER" as const };
    jest.mocked(parseAccountRecoveryInput).mockReturnValue(input);
    const result = {
      delivery: "EMAIL" as const,
      challengeId: "11111111-1111-4111-8111-111111111111",
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
    };
    jest.mocked(requestPasswordResetCode).mockResolvedValue(result);
    const response = createResponse();

    await requestPasswordResetCodeController({ body: input } as Request, response, jest.fn() as NextFunction);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  test("인증코드 확인 성공 시 단기 토큰을 반환한다", async () => {
    const input = { challengeId: "11111111-1111-4111-8111-111111111111", code: "123456" };
    jest.mocked(parseVerifyPasswordResetCodeInput).mockReturnValue(input);
    jest.mocked(verifyPasswordResetCode).mockResolvedValue({ resetToken: "reset-token", recoveryQuestion: null });
    const response = createResponse();
    await verifyPasswordResetCodeController({ body: input } as Request, response, jest.fn() as NextFunction);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { resetToken: "reset-token", recoveryQuestion: null } });
  });

  test("새 비밀번호 확인 성공은 빈 성공 응답을 반환한다", async () => {
    const input = { token: "reset-token", newPassword: "NextPassword1!" };
    jest.mocked(parseConfirmPasswordResetInput).mockReturnValue(input);
    jest.mocked(confirmPasswordReset).mockResolvedValue();
    const response = createResponse();

    await confirmPasswordResetController({ body: input } as Request, response, jest.fn() as NextFunction);

    expect(response.json).toHaveBeenCalledWith({ success: true, data: null });
  });

  test("토큰 갱신도 회전된 쿠키와 최신 data.user를 반환한다", async () => {
    jest.mocked(getAccessTokenFromCookie).mockReturnValue(null);
    jest.mocked(getRefreshTokenFromCookie).mockReturnValue("old-refresh-token");
    jest.mocked(refreshAuth).mockResolvedValue({ user, tokens });
    const response = createResponse();

    await refreshController(
      {} as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(setAuthCookies).toHaveBeenCalledWith(response, tokens);
    expect(refreshAuth).toHaveBeenCalledWith(null, "old-refresh-token");
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { user } });
  });

  test("유효 Access 결과는 사용자만 반환하고 쿠키를 재발급하지 않는다", async () => {
    jest.mocked(getAccessTokenFromCookie).mockReturnValue("access-token");
    jest.mocked(getRefreshTokenFromCookie).mockReturnValue("refresh-token");
    jest.mocked(refreshAuth).mockResolvedValue({ user, tokens: null });
    const response = createResponse();

    await refreshController({} as Request, response, jest.fn() as NextFunction);

    expect(setAuthCookies).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { user } });
  });

  test("선택 세션은 쿠키 없는 비회원에게 user null을 200으로 반환한다", async () => {
    jest.mocked(getAccessTokenFromCookie).mockReturnValue(null);
    jest.mocked(getRefreshTokenFromCookie).mockReturnValue(null);
    jest.mocked(restoreOptionalAuthSession).mockResolvedValue({
      user: null,
      tokens: null,
      shouldClearCookies: false,
    });
    const response = createResponse();

    await optionalSessionController(
      {} as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(setAuthCookies).not.toHaveBeenCalled();
    expect(clearAuthCookies).not.toHaveBeenCalled();
    expect(markOptionalSessionRefreshFailure).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { user: null },
    });
  });

  test("선택 세션이 Refresh로 복구되면 회전된 쿠키와 사용자를 반환한다", async () => {
    jest.mocked(getAccessTokenFromCookie).mockReturnValue(null);
    jest.mocked(getRefreshTokenFromCookie).mockReturnValue("refresh-token");
    jest.mocked(restoreOptionalAuthSession).mockResolvedValue({
      user,
      tokens,
      shouldClearCookies: false,
    });
    const response = createResponse();

    await optionalSessionController(
      {} as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(setAuthCookies).toHaveBeenCalledWith(response, tokens);
    expect(markOptionalSessionRefreshFailure).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { user },
    });
  });

  test("선택 세션의 잘못된 Refresh 결과를 limiter 실패로 표시한다", async () => {
    jest.mocked(getAccessTokenFromCookie).mockReturnValue(null);
    jest.mocked(getRefreshTokenFromCookie).mockReturnValue("invalid-refresh-token");
    jest.mocked(restoreOptionalAuthSession).mockResolvedValue({
      user: null,
      tokens: null,
      shouldClearCookies: true,
    });
    const request = {} as Request;
    const response = createResponse();

    await optionalSessionController(
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(markOptionalSessionRefreshFailure).toHaveBeenCalledWith(request);
    expect(clearAuthCookies).toHaveBeenCalledWith(response);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { user: null },
    });
  });

  test("회원 탈퇴 성공은 본인 ID를 사용하고 두 인증 쿠키를 지운다", async () => {
    const authContext: AuthContext = {
      userId: "user-id",
      role: "CUSTOMER",
    };
    const input = { currentPassword: "Password1!" };
    const request = { auth: authContext, body: input } as Request;
    jest.mocked(getAuthContext).mockReturnValue(authContext);
    jest.mocked(parseWithdrawAccountInput).mockReturnValue(input);
    jest.mocked(withdrawAccount).mockResolvedValue();
    const response = createResponse();

    await withdrawAccountController(
      request,
      response,
      jest.fn() as NextFunction,
    );

    expect(withdrawAccount).toHaveBeenCalledWith("user-id", input);
    expect(clearAuthCookies).toHaveBeenCalledWith(response);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: null });
  });

  test("로그아웃은 인증 쿠키가 없어도 두 쿠키를 지우고 공통 빈 응답을 반환한다", async () => {
    const response = createResponse();

    await logoutController(
      {} as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(clearAuthCookies).toHaveBeenCalledWith(response);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: null });
  });
});
