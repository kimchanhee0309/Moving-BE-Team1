/**
 * 실제 DB를 사용하지 않고 Auth Service의 회원가입·로그인·profile 상태·Refresh 회전을 검증합니다.
 * Repository, bcrypt, JWT 경계는 mock으로 분리하여 비즈니스 분기만 확인합니다.
 */
jest.mock("../src/modules/auth/auth.repository", () => ({
  createEmailUser: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  findUserByPhone: jest.fn(),
}));

jest.mock("../src/modules/auth/password", () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
}));

jest.mock("../src/common/utils/auth-token", () => ({
  createAuthTokens: jest.fn(),
  verifyToken: jest.fn(),
}));

import { createAuthTokens, verifyToken } from "../src/common/utils/auth-token";
import {
  createEmailUser,
  findUserByEmail,
  findUserById,
  findUserByPhone,
  type AuthUserRecord,
} from "../src/modules/auth/auth.repository";
import {
  getCurrentUser,
  login,
  refreshAuth,
  signUp,
} from "../src/modules/auth/auth.service";
import { hashPassword, verifyPassword } from "../src/modules/auth/password";

const customerWithoutProfile: AuthUserRecord = {
  id: "customer-user-id",
  name: "홍길동",
  email: "user@example.com",
  phone: "01012345678",
  role: "CUSTOMER",
  passwordHash: "bcrypt-hash",
  customer: null,
  mover: null,
};

const moverWithProfile: AuthUserRecord = {
  ...customerWithoutProfile,
  id: "mover-user-id",
  email: "mover@example.com",
  role: "MOVER",
  mover: { id: "mover-profile-id" },
};

const tokens = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

describe("Auth service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(createAuthTokens).mockReturnValue(tokens);
  });

  test("중복이 없는 이메일 사용자를 hash와 함께 생성한다", async () => {
    jest.mocked(findUserByEmail).mockResolvedValue(null);
    jest.mocked(findUserByPhone).mockResolvedValue(null);
    jest.mocked(hashPassword).mockResolvedValue("bcrypt-hash");
    jest.mocked(createEmailUser).mockResolvedValue(customerWithoutProfile);

    await expect(
      signUp({
        name: "홍길동",
        email: "user@example.com",
        phone: "01012345678",
        password: "Password1!",
        role: "CUSTOMER",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "customer-user-id",
        profileCompleted: false,
      }),
    );
    expect(createEmailUser).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: "bcrypt-hash" }),
    );
  });

  test("중복 이메일은 EMAIL_ALREADY_EXISTS로 거절한다", async () => {
    jest.mocked(findUserByEmail).mockResolvedValue(customerWithoutProfile);
    jest.mocked(findUserByPhone).mockResolvedValue(null);

    await expect(
      signUp({
        name: "홍길동",
        email: "user@example.com",
        phone: "01012345678",
        password: "Password1!",
        role: "CUSTOMER",
      }),
    ).rejects.toMatchObject({
      code: "EMAIL_ALREADY_EXISTS",
    });
  });

  test("로그인 성공 시 사용자와 두 토큰을 반환한다", async () => {
    jest.mocked(findUserByEmail).mockResolvedValue(customerWithoutProfile);
    jest.mocked(verifyPassword).mockResolvedValue(true);

    await expect(
      login({
        email: "user@example.com",
        password: "Password1!",
        role: "CUSTOMER",
      }),
    ).resolves.toEqual({
      user: {
        id: "customer-user-id",
        name: "홍길동",
        email: "user@example.com",
        phone: "01012345678",
        role: "CUSTOMER",
        profileCompleted: false,
      },
      tokens,
    });
  });

  test("역할이 다르면 계정 노출 없이 INVALID_CREDENTIALS를 반환한다", async () => {
    jest.mocked(findUserByEmail).mockResolvedValue(customerWithoutProfile);
    jest.mocked(verifyPassword).mockResolvedValue(true);

    await expect(
      login({
        email: "user@example.com",
        password: "Password1!",
        role: "MOVER",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  test("역할별 relation 존재 여부로 profileCompleted를 계산한다", async () => {
    jest.mocked(findUserById).mockResolvedValue(moverWithProfile);

    await expect(getCurrentUser("mover-user-id")).resolves.toMatchObject({
      role: "MOVER",
      profileCompleted: true,
    });
  });

  test("Refresh Token 검증 후 Access와 Refresh Token을 함께 회전한다", async () => {
    jest.mocked(verifyToken).mockReturnValue({
      userId: "mover-user-id",
      role: "MOVER",
      tokenType: "refresh",
    });
    jest.mocked(findUserById).mockResolvedValue(moverWithProfile);

    await expect(refreshAuth("old-refresh-token")).resolves.toEqual({
      user: expect.objectContaining({ id: "mover-user-id" }),
      tokens,
    });
    expect(createAuthTokens).toHaveBeenCalledWith("mover-user-id", "MOVER");
  });
});
