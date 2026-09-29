/**
 * 이메일 Auth Controller가 가입·로그인·세션 응답을 data.user로 통일하고 쿠키를 발급하는지 검증합니다.
 */
jest.mock("../../src/modules/auth/auth.validator", () => ({
  parseAccountRecoveryInput: jest.fn(),
  parseConfirmPasswordResetInput: jest.fn(),
  parseLoginInput: jest.fn(),
  parseSignUpInput: jest.fn(),
  parseVerifyRecoveryAnswerInput: jest.fn(),
  parseWithdrawAccountInput: jest.fn(),
}));

jest.mock("../../src/modules/auth/auth.service", () => ({
  confirmPasswordReset: jest.fn(),
  findAccount: jest.fn(),
  getRecoveryQuestion: jest.fn(),
  getCurrentUser: jest.fn(),
  login: jest.fn(),
  refreshAuth: jest.fn(),
  verifyRecoveryAnswer: jest.fn(),
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
  recoveryQuestionController,
  refreshController,
  signUpController,
  verifyRecoveryAnswerController,
  withdrawAccountController,
} from "../../src/modules/auth/auth.controller";
import {
  confirmPasswordReset,
  findAccount,
  getRecoveryQuestion,
  getCurrentUser,
  login,
  refreshAuth,
  verifyRecoveryAnswer,
  restoreOptionalAuthSession,
  signUp,
  withdrawAccount,
} from "../../src/modules/auth/auth.service";
import {
  parseAccountRecoveryInput,
  parseConfirmPasswordResetInput,
  parseLoginInput,
  parseSignUpInput,
  parseVerifyRecoveryAnswerInput,
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
      recoveryQuestion: "PERSONAL_PHRASE" as const,
      recoveryAnswer: "moving answer",
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

  test("복구 질문 조회 결과를 반환한다", async () => {
    const input = { name: "홍길동", email: "user@example.com", role: "CUSTOMER" as const };
    jest.mocked(parseAccountRecoveryInput).mockReturnValue(input);
    jest.mocked(getRecoveryQuestion).mockResolvedValue({ available: true, question: "PERSONAL_PHRASE", loginMethod: "EMAIL" });
    const response = createResponse();

    await recoveryQuestionController({ body: input } as Request, response, jest.fn() as NextFunction);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { available: true, question: "PERSONAL_PHRASE", loginMethod: "EMAIL" } });
  });

  test("복구 답변 확인 성공 시 단기 토큰을 반환한다", async () => {
    const input = { name: "홍길동", email: "user@example.com", role: "CUSTOMER" as const, recoveryAnswer: "moving answer" };
    jest.mocked(parseVerifyRecoveryAnswerInput).mockReturnValue(input);
    jest.mocked(verifyRecoveryAnswer).mockResolvedValue({ resetToken: "reset-token" });
    const response = createResponse();
    await verifyRecoveryAnswerController({ body: input } as Request, response, jest.fn() as NextFunction);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { resetToken: "reset-token" } });
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
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { user },
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
