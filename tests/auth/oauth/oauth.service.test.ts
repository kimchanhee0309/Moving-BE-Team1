/**
 * OAuth 계정의 재로그인, 신규 User 생성, 이메일 충돌 및 역할 불일치 정책을 검증합니다.
 */
jest.mock("../../../src/modules/auth/auth.repository", () => ({
  createOAuthUser: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserBySocialAccount: jest.fn(),
}));

jest.mock("../../../src/common/utils/auth-token", () => ({
  createAuthTokens: jest.fn(),
}));

import { createAuthTokens } from "../../../src/common/utils/auth-token";
import {
  createOAuthUser,
  findUserByEmail,
  findUserBySocialAccount,
  type AuthUserRecord,
} from "../../../src/modules/auth/auth.repository";
import { authenticateWithOAuth } from "../../../src/modules/auth/oauth/oauth.service";

const oauthUser: AuthUserRecord = {
  id: "oauth-user-id",
  name: "OAuth 사용자",
  email: "oauth@example.com",
  phone: null,
  role: "CUSTOMER",
  passwordHash: null,
  customer: null,
  mover: null,
};

const profile = {
  provider: "GOOGLE" as const,
  socialId: "google-subject",
  email: "oauth@example.com",
  name: "OAuth 사용자",
};

describe("OAuth service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(createAuthTokens).mockReturnValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  test("기존 소셜 계정은 새 User를 만들지 않고 로그인한다", async () => {
    jest.mocked(findUserBySocialAccount).mockResolvedValue(oauthUser);

    await expect(authenticateWithOAuth(profile, "CUSTOMER")).resolves.toEqual({
      user: expect.objectContaining({ id: "oauth-user-id", profileCompleted: false }),
      tokens: { accessToken: "access-token", refreshToken: "refresh-token" },
    });
    expect(createOAuthUser).not.toHaveBeenCalled();
  });

  test("신규 소셜 계정은 password와 profile 없이 User만 생성한다", async () => {
    jest.mocked(findUserBySocialAccount).mockResolvedValue(null);
    jest.mocked(findUserByEmail).mockResolvedValue(null);
    jest.mocked(createOAuthUser).mockResolvedValue(oauthUser);

    await authenticateWithOAuth(profile, "CUSTOMER");

    expect(createOAuthUser).toHaveBeenCalledWith({
      name: "OAuth 사용자",
      email: "oauth@example.com",
      role: "CUSTOMER",
      socialProvider: "GOOGLE",
      socialId: "google-subject",
    });
  });

  test("같은 이메일 계정은 자동 병합하지 않고 충돌시킨다", async () => {
    jest.mocked(findUserBySocialAccount).mockResolvedValue(null);
    jest.mocked(findUserByEmail).mockResolvedValue(oauthUser);

    await expect(authenticateWithOAuth(profile, "CUSTOMER")).rejects.toMatchObject({
      code: "OAUTH_ACCOUNT_CONFLICT",
    });
  });

  test("신규 계정에 이메일이 없으면 User를 만들지 않는다", async () => {
    jest.mocked(findUserBySocialAccount).mockResolvedValue(null);

    await expect(
      authenticateWithOAuth({ ...profile, email: undefined }, "CUSTOMER"),
    ).rejects.toMatchObject({ code: "OAUTH_EMAIL_REQUIRED" });
    expect(createOAuthUser).not.toHaveBeenCalled();
  });

  test("기존 소셜 계정과 시작 페이지 역할이 다르면 거절한다", async () => {
    jest.mocked(findUserBySocialAccount).mockResolvedValue(oauthUser);

    await expect(authenticateWithOAuth(profile, "MOVER")).rejects.toMatchObject({
      code: "ROLE_MISMATCH",
    });
  });
});
