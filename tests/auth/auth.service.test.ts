/**
 * 실제 DB를 사용하지 않고 Auth Service의 회원가입·로그인·profile 상태·Refresh 회전을 검증합니다.
 * Repository, bcrypt, JWT 경계는 mock으로 분리하여 비즈니스 분기만 확인합니다.
 */
jest.mock("../../src/modules/auth/auth.repository", () => ({
  createEmailUser: jest.fn(),
  deleteRestrictedWithdrawalRelations: jest.fn(),
  deleteUserWithAuthState: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  findUserByPhone: jest.fn(),
  findUserForWithdrawal: jest.fn(),
  findRecoveryUserByEmail: jest.fn(),
  runAuthTransaction: jest.fn(),
  updateEmailUserPassword: jest.fn(),
}));

jest.mock("../../src/modules/auth/auth-recovery", () => ({
  createPasswordResetToken: jest.fn(),
  matchesCredentialVersion: jest.fn(),
  verifyPasswordResetToken: jest.fn(),
}));

jest.mock("../../src/modules/auth/password", () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
}));

jest.mock("../../src/common/utils/auth-token", () => ({
  createAuthTokens: jest.fn(),
  verifyToken: jest.fn(),
}));

jest.mock("../../src/modules/customer-profile/customer-profile.image", () => ({
  removeReplacedLocalProfileImage: jest.fn(),
}));

jest.mock("../../src/modules/mover-profile/mover-profile.image", () => ({
  removeReplacedMoverProfileImage: jest.fn(),
}));

import { createAuthTokens, verifyToken } from "../../src/common/utils/auth-token";
import {
  createPasswordResetToken,
  matchesCredentialVersion,
  verifyPasswordResetToken,
} from "../../src/modules/auth/auth-recovery";
import {
  createEmailUser,
  deleteRestrictedWithdrawalRelations,
  deleteUserWithAuthState,
  findUserByEmail,
  findUserById,
  findUserByPhone,
  findUserForWithdrawal,
  findRecoveryUserByEmail,
  runAuthTransaction,
  updateEmailUserPassword,
  type AuthUserRecord,
  type AuthTransaction,
  type WithdrawalUserRecord,
} from "../../src/modules/auth/auth.repository";
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
import { hashPassword, verifyPassword } from "../../src/modules/auth/password";
import { removeReplacedLocalProfileImage } from "../../src/modules/customer-profile/customer-profile.image";
import { removeReplacedMoverProfileImage } from "../../src/modules/mover-profile/mover-profile.image";

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

const recoveryUser = {
  id: customerWithoutProfile.id,
  name: customerWithoutProfile.name,
  email: customerWithoutProfile.email,
  role: customerWithoutProfile.role,
  passwordHash: customerWithoutProfile.passwordHash,
  socialProvider: null,
  passwordRecoveryChallenge: {
    question: "PERSONAL_PHRASE" as const,
    answerHash: "answer-hash",
  },
};

const tokens = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
};

const transaction = {} as AuthTransaction;
const emailWithdrawalUser: WithdrawalUserRecord = {
  id: "customer-user-id",
  passwordHash: "bcrypt-hash",
  socialProvider: null,
  socialId: null,
  customer: {
    id: "customer-profile-id",
    profileImageUrl: "/uploads/customer-profiles/00000000-0000-0000-0000-000000000001.jpg",
  },
  mover: null,
};

const oauthWithdrawalUser: WithdrawalUserRecord = {
  id: "mover-user-id",
  passwordHash: null,
  socialProvider: "GOOGLE",
  socialId: "google-user-id",
  customer: null,
  mover: {
    id: "mover-profile-id",
    profileImageUrl: "/uploads/mover-profiles/00000000-0000-0000-0000-000000000002.webp",
  },
};

describe("Auth service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(createAuthTokens).mockReturnValue(tokens);
    jest.mocked(runAuthTransaction).mockImplementation((operation) =>
      operation(transaction),
    );
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
        recoveryQuestion: "PERSONAL_PHRASE",
        recoveryAnswer: "moving answer",
      }),
    ).resolves.toEqual({
      user: expect.objectContaining({
        id: "customer-user-id",
        profileCompleted: false,
      }),
      tokens,
    });
    expect(createEmailUser).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: "bcrypt-hash", recoveryQuestion: "PERSONAL_PHRASE", recoveryAnswerHash: "bcrypt-hash" }),
    );
    expect(createAuthTokens).toHaveBeenCalledWith(
      "customer-user-id",
      "CUSTOMER",
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
        recoveryQuestion: "PERSONAL_PHRASE",
        recoveryAnswer: "moving answer",
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

  test("이름·이메일·역할이 일치하면 로그인 ID와 계정 방식을 찾는다", async () => {
    jest.mocked(findUserByEmail).mockResolvedValue(customerWithoutProfile);

    await expect(findAccount({
      name: "홍길동",
      email: "user@example.com",
      role: "CUSTOMER",
    })).resolves.toEqual({
      found: true,
      loginId: "user@example.com",
      loginMethod: "EMAIL",
    });

    await expect(findAccount({
      name: "다른이름",
      email: "user@example.com",
      role: "CUSTOMER",
    })).resolves.toEqual({ found: false, loginId: null, loginMethod: null });
  });

  test("복구 질문을 조회하고 올바른 답변에만 단기 재설정 토큰을 발급한다", async () => {
    jest.mocked(findRecoveryUserByEmail).mockResolvedValue(recoveryUser);
    jest.mocked(createPasswordResetToken).mockReturnValue("reset-token");
    jest.mocked(verifyPassword).mockResolvedValue(true);

    await expect(getRecoveryQuestion({
      name: "홍길동",
      email: "user@example.com",
      role: "CUSTOMER",
    })).resolves.toEqual({ available: true, question: "PERSONAL_PHRASE", loginMethod: "EMAIL" });

    await expect(verifyRecoveryAnswer({
      name: "홍길동",
      email: "user@example.com",
      role: "CUSTOMER",
      recoveryAnswer: "moving answer",
    })).resolves.toEqual({ resetToken: "reset-token" });
    expect(verifyPassword).toHaveBeenCalledWith("moving answer", "answer-hash");
    expect(createPasswordResetToken).toHaveBeenCalledWith("customer-user-id", "CUSTOMER", "bcrypt-hash");
  });

  test("유효한 재설정 링크는 현재 hash를 확인하고 새 hash를 조건부 저장한다", async () => {
    jest.mocked(verifyPasswordResetToken).mockReturnValue({
      userId: "customer-user-id",
      role: "CUSTOMER",
      credentialVersion: "version",
    });
    jest.mocked(findUserById).mockResolvedValue(customerWithoutProfile);
    jest.mocked(matchesCredentialVersion).mockReturnValue(true);
    jest.mocked(hashPassword).mockResolvedValue("next-hash");
    jest.mocked(updateEmailUserPassword).mockResolvedValue({ count: 1 });

    await expect(confirmPasswordReset({
      token: "reset-token",
      newPassword: "NextPassword1!",
    })).resolves.toBeUndefined();

    expect(updateEmailUserPassword).toHaveBeenCalledWith(
      "customer-user-id",
      "bcrypt-hash",
      "next-hash",
    );
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

  test("탈퇴 후 같은 Access Token의 현재 사용자 조회를 USER_NOT_FOUND로 거절한다", async () => {
    jest.mocked(findUserById).mockResolvedValue(null);

    await expect(getCurrentUser("deleted-user-id")).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
      status: 401,
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

  test("탈퇴 후 같은 Refresh Token은 REFRESH_TOKEN_INVALID로 거절한다", async () => {
    jest.mocked(verifyToken).mockReturnValue({
      userId: "deleted-user-id",
      role: "CUSTOMER",
      tokenType: "refresh",
    });
    jest.mocked(findUserById).mockResolvedValue(null);

    await expect(refreshAuth("old-refresh-token")).rejects.toMatchObject({
      code: "REFRESH_TOKEN_INVALID",
      status: 401,
    });
  });

  test("비회원 선택 세션은 401 없이 user null을 반환한다", async () => {
    await expect(restoreOptionalAuthSession(null, null)).resolves.toEqual({
      user: null,
      tokens: null,
      shouldClearCookies: false,
    });
    expect(verifyToken).not.toHaveBeenCalled();
  });

  test("유효한 Access가 있으면 Refresh를 회전하지 않고 선택 세션을 복구한다", async () => {
    jest.mocked(verifyToken).mockReturnValue({
      userId: "customer-user-id",
      role: "CUSTOMER",
      tokenType: "access",
    });
    jest.mocked(findUserById).mockResolvedValue(customerWithoutProfile);

    await expect(
      restoreOptionalAuthSession("access-token", "refresh-token"),
    ).resolves.toEqual({
      user: expect.objectContaining({ id: "customer-user-id" }),
      tokens: null,
      shouldClearCookies: false,
    });
    expect(createAuthTokens).not.toHaveBeenCalled();
  });

  test("Access가 없고 Refresh가 유효하면 두 토큰을 회전해 선택 세션을 복구한다", async () => {
    jest.mocked(verifyToken).mockReturnValue({
      userId: "mover-user-id",
      role: "MOVER",
      tokenType: "refresh",
    });
    jest.mocked(findUserById).mockResolvedValue(moverWithProfile);

    await expect(
      restoreOptionalAuthSession(null, "refresh-token"),
    ).resolves.toEqual({
      user: expect.objectContaining({ id: "mover-user-id" }),
      tokens,
      shouldClearCookies: false,
    });
  });

  test("선택 세션의 삭제 사용자 토큰은 비회원으로 정리하고 쿠키 삭제를 지시한다", async () => {
    jest.mocked(verifyToken).mockReturnValue({
      userId: "deleted-user-id",
      role: "CUSTOMER",
      tokenType: "access",
    });
    jest.mocked(findUserById).mockResolvedValue(null);

    await expect(
      restoreOptionalAuthSession("stale-access-token", null),
    ).resolves.toEqual({
      user: null,
      tokens: null,
      shouldClearCookies: true,
    });
  });

  test("이메일 계정은 올바른 현재 비밀번호로 연관 제약과 User를 삭제한다", async () => {
    jest.mocked(findUserForWithdrawal).mockResolvedValue(emailWithdrawalUser);
    jest.mocked(verifyPassword).mockResolvedValue(true);
    jest.mocked(deleteUserWithAuthState).mockResolvedValue({ count: 1 });

    await expect(
      withdrawAccount("customer-user-id", { currentPassword: "Password1!" }),
    ).resolves.toBeUndefined();

    expect(deleteRestrictedWithdrawalRelations).toHaveBeenCalledWith(
      transaction,
      emailWithdrawalUser,
    );
    expect(deleteUserWithAuthState).toHaveBeenCalledWith(
      transaction,
      emailWithdrawalUser,
    );
    expect(removeReplacedLocalProfileImage).toHaveBeenCalledWith(
      emailWithdrawalUser.customer?.profileImageUrl,
    );
  });

  test("이메일 계정의 현재 비밀번호 누락과 불일치를 명확히 거절한다", async () => {
    jest.mocked(findUserForWithdrawal).mockResolvedValue(emailWithdrawalUser);

    await expect(
      withdrawAccount("customer-user-id", {}),
    ).rejects.toMatchObject({ code: "CURRENT_PASSWORD_REQUIRED", status: 400 });

    jest.mocked(verifyPassword).mockResolvedValue(false);
    await expect(
      withdrawAccount("customer-user-id", { currentPassword: "wrong" }),
    ).rejects.toMatchObject({ code: "INVALID_CURRENT_PASSWORD", status: 401 });
    expect(deleteUserWithAuthState).not.toHaveBeenCalled();
  });

  test("OAuth 기사 계정은 현재 세션만으로 탈퇴하고 기사 이미지를 정리한다", async () => {
    jest.mocked(findUserForWithdrawal).mockResolvedValue(oauthWithdrawalUser);
    jest.mocked(deleteUserWithAuthState).mockResolvedValue({ count: 1 });

    await expect(withdrawAccount("mover-user-id", {})).resolves.toBeUndefined();

    expect(verifyPassword).not.toHaveBeenCalled();
    expect(removeReplacedMoverProfileImage).toHaveBeenCalledWith(
      oauthWithdrawalUser.mover?.profileImageUrl,
    );
  });

  test("동시 탈퇴로 조건부 삭제 대상이 이미 없으면 멱등 성공한다", async () => {
    jest.mocked(findUserForWithdrawal)
      .mockResolvedValueOnce(emailWithdrawalUser)
      .mockResolvedValueOnce(null);
    jest.mocked(verifyPassword).mockResolvedValue(true);
    jest.mocked(deleteUserWithAuthState).mockResolvedValue({ count: 0 });

    await expect(
      withdrawAccount("customer-user-id", { currentPassword: "Password1!" }),
    ).resolves.toBeUndefined();
  });
});
