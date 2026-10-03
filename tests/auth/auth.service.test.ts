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
  findPasswordResetUserByEmail: jest.fn(),
  reservePasswordResetChallenge: jest.fn(),
  restorePasswordResetChallenge: jest.fn(),
  findPasswordResetChallengeById: jest.fn(),
  reservePasswordResetCodeAttempt: jest.fn(),
  markPasswordResetChallengeVerified: jest.fn(),
  findPasswordResetChallengeForCompletion: jest.fn(),
  consumePasswordResetChallenge: jest.fn(),
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

jest.mock("../../src/modules/auth/auth-email", () => ({
  assertPasswordResetEmailConfigured: jest.fn(),
  sendPasswordResetCodeEmail: jest.fn(),
}));

jest.mock("../../src/modules/auth/auth-password-reset-code", () => ({
  PASSWORD_RESET_CODE_EXPIRES_IN_MS: 300_000,
  PASSWORD_RESET_CODE_EXPIRES_IN_SECONDS: 300,
  PASSWORD_RESET_CODE_MAX_FAILED_ATTEMPTS: 5,
  PASSWORD_RESET_CODE_RESEND_AFTER_SECONDS: 60,
  createPasswordResetCode: jest.fn(() => "123456"),
  hashPasswordResetCode: jest.fn(() => "code-hash"),
  matchesPasswordResetCode: jest.fn(),
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

jest.mock("../../src/modules/move-request/move-request.repository", () => ({
  createMoveRequestCancelNotifications: jest.fn(),
  findCancelableMoveRequestsByCustomerId: jest.fn(),
  findQuoteRecipientsByMoveRequestIdAndStatus: jest.fn(),
}));

jest.mock("../../src/modules/notification/notification.hub", () => ({
  publishNotificationToUser: jest.fn(),
}));

import { createAuthTokens, verifyToken } from "../../src/common/utils/auth-token";
import { UnauthorizedError } from "../../src/common/errors/app-error";
import { sendPasswordResetCodeEmail } from "../../src/modules/auth/auth-email";
import {
  createPasswordResetCode,
  hashPasswordResetCode,
  matchesPasswordResetCode,
} from "../../src/modules/auth/auth-password-reset-code";
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
  findPasswordResetUserByEmail,
  reservePasswordResetChallenge,
  restorePasswordResetChallenge,
  findPasswordResetChallengeById,
  reservePasswordResetCodeAttempt,
  markPasswordResetChallengeVerified,
  findPasswordResetChallengeForCompletion,
  consumePasswordResetChallenge,
  runAuthTransaction,
  updateEmailUserPassword,
  type AuthUserRecord,
  type AuthTransaction,
  type WithdrawalUserRecord,
} from "../../src/modules/auth/auth.repository";
import {
  confirmPasswordReset,
  getCurrentUser,
  login,
  refreshAuth,
  requestPasswordResetCode,
  verifyPasswordResetCode,
  restoreOptionalAuthSession,
  signUp,
  withdrawAccount,
} from "../../src/modules/auth/auth.service";
import { hashPassword, verifyPassword } from "../../src/modules/auth/password";
import { removeReplacedLocalProfileImage } from "../../src/modules/customer-profile/customer-profile.image";
import {
  createMoveRequestCancelNotifications,
  findCancelableMoveRequestsByCustomerId,
  findQuoteRecipientsByMoveRequestIdAndStatus,
} from "../../src/modules/move-request/move-request.repository";
import { removeReplacedMoverProfileImage } from "../../src/modules/mover-profile/mover-profile.image";
import { publishNotificationToUser } from "../../src/modules/notification/notification.hub";

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

const passwordResetUser = {
  id: customerWithoutProfile.id,
  name: customerWithoutProfile.name,
  email: customerWithoutProfile.email,
  role: customerWithoutProfile.role,
  passwordHash: customerWithoutProfile.passwordHash,
  socialProvider: null,
  passwordResetChallenge: null,
};

const passwordResetChallenge = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: customerWithoutProfile.id,
  codeHash: "code-hash",
  failedAttempts: 0,
  sentAt: new Date("2026-09-29T00:00:00.000Z"),
  expiresAt: new Date("2026-09-29T00:05:00.000Z"),
  verifiedAt: null,
  consumedAt: null,
  user: {
    id: customerWithoutProfile.id,
    role: customerWithoutProfile.role,
    passwordHash: customerWithoutProfile.passwordHash,
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
    jest.mocked(createPasswordResetCode).mockReturnValue("123456");
    jest.mocked(hashPasswordResetCode).mockReturnValue("code-hash");
    jest.mocked(runAuthTransaction).mockImplementation((operation) =>
      operation(transaction),
    );
    // 대부분의 테스트는 탈퇴 취소 알림과 무관하므로 "진행 중인 이사 요청 없음"을 기본값으로 둔다.
    jest.mocked(findCancelableMoveRequestsByCustomerId).mockResolvedValue([]);
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
    ).resolves.toEqual({
      user: expect.objectContaining({
        id: "customer-user-id",
        profileCompleted: false,
      }),
      tokens,
    });
    expect(createEmailUser).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: "bcrypt-hash" }),
    );
    expect(createAuthTokens).toHaveBeenCalledWith(
      "customer-user-id",
      "CUSTOMER",
    );
  });

  test("신규 이메일 가입은 비밀번호 hash만 저장하고 복구 질문은 만들지 않는다", async () => {
    jest.mocked(findUserByEmail).mockResolvedValue(null);
    jest.mocked(findUserByPhone).mockResolvedValue(null);
    jest.mocked(hashPassword).mockResolvedValue("password-hash");
    jest.mocked(createEmailUser).mockResolvedValue(customerWithoutProfile);
    await signUp({ name: "홍길동", email: "user@example.com", phone: "01012345678", password: "Password1!", role: "CUSTOMER" });
    expect(createEmailUser).toHaveBeenCalledWith({ name: "홍길동", email: "user@example.com", phone: "01012345678", role: "CUSTOMER", passwordHash: "password-hash" });
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

  test("이메일 계정에 5분 만료 코드를 발송하고 challenge 정보를 반환한다", async () => {
    jest.mocked(findPasswordResetUserByEmail).mockResolvedValue(passwordResetUser);
    jest.mocked(reservePasswordResetChallenge).mockResolvedValue({
      challengeId: passwordResetChallenge.id,
      previous: null,
    });

    await expect(requestPasswordResetCode({
      name: "홍길동",
      email: "user@example.com",
      role: "CUSTOMER",
    }, passwordResetChallenge.sentAt)).resolves.toEqual({
      delivery: "EMAIL",
      challengeId: passwordResetChallenge.id,
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
    });
    expect(sendPasswordResetCodeEmail).toHaveBeenCalledWith("user@example.com", "123456");
  });

  test("원자적 예약에서 60초 재발송 제한이 확인되면 메일을 보내지 않는다", async () => {
    const now = new Date("2026-09-29T00:00:30.000Z");
    jest.mocked(findPasswordResetUserByEmail).mockResolvedValue(passwordResetUser);
    jest.mocked(reservePasswordResetChallenge).mockResolvedValue(null);

    await expect(requestPasswordResetCode({
      name: "홍길동",
      email: "user@example.com",
      role: "CUSTOMER",
    }, now)).rejects.toMatchObject({ code: "PASSWORD_RESET_CODE_RESEND_TOO_SOON", status: 429 });
    expect(sendPasswordResetCodeEmail).not.toHaveBeenCalled();
  });

  test("재발송 메일이 실패하면 덮어쓰기 전의 유효한 challenge를 복원한다", async () => {
    const now = new Date("2026-09-29T00:02:00.000Z");
    const previous = {
      id: passwordResetChallenge.id,
      codeHash: "previous-code-hash",
      failedAttempts: 2,
      sentAt: passwordResetChallenge.sentAt,
      expiresAt: passwordResetChallenge.expiresAt,
      verifiedAt: null,
      consumedAt: null,
    };

    jest.mocked(findPasswordResetUserByEmail).mockResolvedValue(passwordResetUser);
    jest.mocked(reservePasswordResetChallenge).mockResolvedValue({
      challengeId: passwordResetChallenge.id,
      previous,
    });
    jest.mocked(sendPasswordResetCodeEmail).mockRejectedValue(new Error("SMTP failure"));
    jest.mocked(restorePasswordResetChallenge).mockResolvedValue({ count: 1 });

    await expect(requestPasswordResetCode({
      name: "홍길동",
      email: "user@example.com",
      role: "CUSTOMER",
    }, now)).rejects.toThrow("SMTP failure");
    expect(restorePasswordResetChallenge).toHaveBeenCalledWith(
      "customer-user-id",
      "code-hash",
      previous,
    );
  });

  test("OAuth 계정은 메일을 보내지 않고 SOCIAL 안내 결과를 반환한다", async () => {
    jest.mocked(findPasswordResetUserByEmail).mockResolvedValue({
      ...passwordResetUser,
      passwordHash: null,
      socialProvider: "GOOGLE",
    });

    await expect(requestPasswordResetCode({
      name: "홍길동",
      email: "user@example.com",
      role: "CUSTOMER",
    })).resolves.toEqual({
      delivery: "SOCIAL",
      challengeId: null,
      expiresInSeconds: null,
      resendAfterSeconds: null,
    });
    expect(sendPasswordResetCodeEmail).not.toHaveBeenCalled();
  });

  test("올바른 인증코드는 한 번만 검증 완료 처리하고 단기 재설정 토큰을 발급한다", async () => {
    jest.mocked(findPasswordResetChallengeById).mockResolvedValue(passwordResetChallenge);
    jest.mocked(reservePasswordResetCodeAttempt).mockResolvedValue({
      ...passwordResetChallenge,
      failedAttempts: 1,
    });
    jest.mocked(matchesPasswordResetCode).mockReturnValue(true);
    jest.mocked(markPasswordResetChallengeVerified).mockResolvedValue({ count: 1 });
    jest.mocked(createPasswordResetToken).mockReturnValue("reset-token");

    await expect(verifyPasswordResetCode({
      challengeId: passwordResetChallenge.id,
      code: "123456",
    }, new Date("2026-09-29T00:01:00.000Z"))).resolves.toEqual({ resetToken: "reset-token" });
    expect(createPasswordResetToken).toHaveBeenCalledWith(
      "customer-user-id", "CUSTOMER", "bcrypt-hash", passwordResetChallenge.id,
    );
  });

  test("잘못된 인증코드는 실패 횟수를 올리고 다섯 번째부터 제한한다", async () => {
    jest.mocked(findPasswordResetChallengeById).mockResolvedValue({
      ...passwordResetChallenge,
      failedAttempts: 4,
    });
    jest.mocked(reservePasswordResetCodeAttempt).mockResolvedValue({
      ...passwordResetChallenge,
      failedAttempts: 5,
    });
    jest.mocked(matchesPasswordResetCode).mockReturnValue(false);

    await expect(verifyPasswordResetCode({
      challengeId: passwordResetChallenge.id,
      code: "000000",
    }, new Date("2026-09-29T00:01:00.000Z"))).rejects.toMatchObject({
      code: "PASSWORD_RESET_CODE_ATTEMPTS_EXCEEDED",
      status: 429,
    });
    expect(reservePasswordResetCodeAttempt).toHaveBeenCalledWith(
      passwordResetChallenge.id,
      passwordResetChallenge.codeHash,
      new Date("2026-09-29T00:01:00.000Z"),
      5,
    );
  });

  test("5분이 지난 인증코드는 재설정 토큰을 발급하지 않는다", async () => {
    jest.mocked(findPasswordResetChallengeById).mockResolvedValue(passwordResetChallenge);

    await expect(verifyPasswordResetCode({
      challengeId: passwordResetChallenge.id,
      code: "123456",
    }, passwordResetChallenge.expiresAt)).rejects.toMatchObject({
      code: "PASSWORD_RESET_CODE_EXPIRED",
      status: 400,
    });
    expect(markPasswordResetChallengeVerified).not.toHaveBeenCalled();
  });

  test("유효한 재설정 링크는 현재 hash를 확인하고 새 hash를 조건부 저장한다", async () => {
    jest.mocked(verifyPasswordResetToken).mockReturnValue({
      userId: "customer-user-id",
      role: "CUSTOMER",
      credentialVersion: "version",
      challengeId: passwordResetChallenge.id,
    });
    const verifiedChallenge = {
      ...passwordResetChallenge,
      verifiedAt: new Date("2026-09-29T00:01:00.000Z"),
    };
    jest.mocked(findPasswordResetChallengeById).mockResolvedValue(verifiedChallenge);
    jest.mocked(findPasswordResetChallengeForCompletion).mockResolvedValue(verifiedChallenge);
    jest.mocked(matchesCredentialVersion).mockReturnValue(true);
    jest.mocked(hashPassword).mockResolvedValue("next-hash");
    jest.mocked(consumePasswordResetChallenge).mockResolvedValue({ count: 1 });
    jest.mocked(updateEmailUserPassword).mockResolvedValue({ count: 1 });

    await expect(confirmPasswordReset({
      token: "reset-token",
      newPassword: "NextPassword1!",
    })).resolves.toBeUndefined();

    expect(updateEmailUserPassword).toHaveBeenCalledWith(
      transaction,
      "customer-user-id",
      "bcrypt-hash",
      "next-hash",
    );
  });

  test("과거에 질문을 등록한 계정도 이메일 코드 검증 뒤 답변 없이 재설정한다", async () => {
    const challenge = { ...passwordResetChallenge, verifiedAt: new Date("2026-09-29T00:01:00.000Z"), user: { ...passwordResetChallenge.user, recoveryQuestion: "CHILDHOOD_NICKNAME" as const, recoveryAnswerHash: "answer-hash" } };
    jest.mocked(verifyPasswordResetToken).mockReturnValue({ userId: "customer-user-id", role: "CUSTOMER", credentialVersion: "version", challengeId: challenge.id });
    jest.mocked(findPasswordResetChallengeById).mockResolvedValue(challenge);
    jest.mocked(matchesCredentialVersion).mockReturnValue(true);
    jest.mocked(hashPassword).mockResolvedValue("next-hash");
    jest.mocked(findPasswordResetChallengeForCompletion).mockResolvedValue(challenge);
    jest.mocked(consumePasswordResetChallenge).mockResolvedValue({ count: 1 });
    jest.mocked(updateEmailUserPassword).mockResolvedValue({ count: 1 });
    await expect(confirmPasswordReset({ token: "reset-token", newPassword: "NextPassword1!" })).resolves.toBeUndefined();
    expect(consumePasswordResetChallenge).toHaveBeenCalledTimes(1);
  });

  /**
   * 시나리오: 이미 소비된 challenge의 재설정 토큰을 다시 제출합니다.
   * 기대 결과: hash를 만들지 않고 PASSWORD_RESET_TOKEN_INVALID(400)로 거절합니다.
   */
  test("이미 사용된 재설정 토큰은 새 hash 생성 없이 토큰 오류로 거절한다", async () => {
    const consumedChallenge = {
      ...passwordResetChallenge,
      verifiedAt: new Date("2026-09-29T00:01:00.000Z"),
      consumedAt: new Date("2026-09-29T00:02:00.000Z"),
    };
    jest.mocked(verifyPasswordResetToken).mockReturnValue({ userId: "customer-user-id", role: "CUSTOMER", credentialVersion: "version", challengeId: consumedChallenge.id });
    jest.mocked(findPasswordResetChallengeById).mockResolvedValue(consumedChallenge);

    await expect(confirmPasswordReset({ token: "reset-token", newPassword: "NextPassword1!" })).rejects.toMatchObject({ code: "PASSWORD_RESET_TOKEN_INVALID", status: 400 });
    expect(hashPassword).not.toHaveBeenCalled();
  });

  /**
   * 시나리오: 비밀번호가 바뀐 뒤 같은 challenge로 새 재설정이 검증된 상태에서, 이전 비밀번호 기준 토큰을 제출합니다.
   * 기대 결과: PASSWORD_RESET_TOKEN_INVALID(400)로 거절합니다.
   */
  test("비밀번호 변경 전 발급된 오래된 토큰은 거절한다", async () => {
    const reverifiedChallenge = {
      ...passwordResetChallenge,
      verifiedAt: new Date("2026-09-29T00:10:00.000Z"),
    };
    jest.mocked(verifyPasswordResetToken).mockReturnValue({ userId: "customer-user-id", role: "CUSTOMER", credentialVersion: "old-version", challengeId: reverifiedChallenge.id });
    jest.mocked(findPasswordResetChallengeById).mockResolvedValue(reverifiedChallenge);
    jest.mocked(matchesCredentialVersion).mockReturnValue(false);

    await expect(confirmPasswordReset({ token: "old-reset-token", newPassword: "NextPassword1!" })).rejects.toMatchObject({ code: "PASSWORD_RESET_TOKEN_INVALID", status: 400 });
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

    await expect(refreshAuth(null, "old-refresh-token")).resolves.toEqual({
      user: expect.objectContaining({ id: "mover-user-id" }),
      tokens,
    });
    expect(createAuthTokens).toHaveBeenCalledWith(
      "mover-user-id",
      "MOVER",
    );
  });

  test("유효한 Access가 있으면 명시적 Refresh에서도 토큰을 재발급하지 않는다", async () => {
    jest.mocked(verifyToken).mockReturnValue({
      userId: "customer-user-id",
      role: "CUSTOMER",
      tokenType: "access",
    });
    jest.mocked(findUserById).mockResolvedValue(customerWithoutProfile);

    await expect(
      refreshAuth("access-token", "refresh-token"),
    ).resolves.toEqual({
      user: expect.objectContaining({ id: "customer-user-id" }),
      tokens: null,
    });
    expect(createAuthTokens).not.toHaveBeenCalled();
  });

  test("위조된 Access는 유효한 Refresh가 있어도 복구하지 않는다", async () => {
    jest.mocked(verifyToken).mockImplementation(() => {
      throw new UnauthorizedError(
        "Access Token이 유효하지 않습니다.",
        "ACCESS_TOKEN_INVALID",
      );
    });

    await expect(
      refreshAuth("forged-access-token", "refresh-token"),
    ).rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID", status: 401 });
    expect(findUserById).not.toHaveBeenCalled();
  });

  test("탈퇴 후 같은 Refresh Token은 REFRESH_TOKEN_INVALID로 거절한다", async () => {
    jest.mocked(verifyToken).mockReturnValue({
      userId: "deleted-user-id",
      role: "CUSTOMER",
      tokenType: "refresh",
    });
    jest.mocked(findUserById).mockResolvedValue(null);

    await expect(refreshAuth(null, "old-refresh-token")).rejects.toMatchObject({
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

  test("Access가 만료됐지만 Refresh가 유효하면 두 토큰을 회전해 선택 세션을 복구한다", async () => {
    jest.mocked(verifyToken)
      .mockImplementationOnce(() => {
        throw new UnauthorizedError(
          "Access Token이 만료되었습니다.",
          "ACCESS_TOKEN_EXPIRED",
        );
      })
      .mockReturnValueOnce({
        userId: "mover-user-id",
        role: "MOVER",
        tokenType: "refresh",
      });
    jest.mocked(findUserById).mockResolvedValue(moverWithProfile);

    await expect(
      restoreOptionalAuthSession("expired-access-token", "refresh-token"),
    ).resolves.toEqual({
      user: expect.objectContaining({ id: "mover-user-id" }),
      tokens,
      shouldClearCookies: false,
    });
    expect(createAuthTokens).toHaveBeenCalledWith(
      "mover-user-id",
      "MOVER",
    );
  });

  test("잘못된 Refresh Token은 선택 세션에서 비회원으로 정리한다", async () => {
    jest.mocked(verifyToken).mockImplementation(() => {
      throw new UnauthorizedError(
        "Refresh Token이 유효하지 않습니다.",
        "REFRESH_TOKEN_INVALID",
      );
    });

    await expect(
      restoreOptionalAuthSession(null, "invalid-refresh-token"),
    ).resolves.toEqual({
      user: null,
      tokens: null,
      shouldClearCookies: true,
    });
  });

  test("위조된 Access는 선택 세션에서도 Refresh하지 않고 비회원으로 정리한다", async () => {
    jest.mocked(verifyToken).mockImplementation(() => {
      throw new UnauthorizedError(
        "Access Token이 유효하지 않습니다.",
        "ACCESS_TOKEN_INVALID",
      );
    });

    await expect(
      restoreOptionalAuthSession("forged-access-token", "refresh-token"),
    ).resolves.toEqual({
      user: null,
      tokens: null,
      shouldClearCookies: true,
    });
    expect(verifyToken).toHaveBeenCalledTimes(1);
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

  test("진행 중인 이사 요청이 있는 고객이 탈퇴하면 견적 상태에 맞는 취소 알림을 만들고 커밋 후 push한다", async () => {
    jest.mocked(findUserForWithdrawal).mockResolvedValue(emailWithdrawalUser);
    jest.mocked(verifyPassword).mockResolvedValue(true);
    jest.mocked(deleteUserWithAuthState).mockResolvedValue({ count: 1 });
    jest.mocked(findCancelableMoveRequestsByCustomerId).mockResolvedValue([
      {
        id: "move-request-id",
        customerId: "customer-profile-id",
        status: "CONFIRMED",
        customer: { user: { name: "홍길동" } },
      },
    ]);
    jest.mocked(findQuoteRecipientsByMoveRequestIdAndStatus).mockResolvedValue([
      { quoteId: "quote-id", moverUserId: "mover-user-id" },
    ]);
    jest.mocked(createMoveRequestCancelNotifications).mockResolvedValue([
      {
        userId: "mover-user-id",
        moveRequestId: "move-request-id",
        quoteId: "quote-id",
        type: "CONFIRMED_MOVE_CANCELED",
        title: "확정된 이사가 취소되었습니다.",
        content: "홍길동 고객님이 계정을 탈퇴하여 확정된 이사 일정이 취소되었습니다.",
      },
    ]);

    await expect(
      withdrawAccount("customer-user-id", { currentPassword: "Password1!" }),
    ).resolves.toBeUndefined();

    expect(findCancelableMoveRequestsByCustomerId).toHaveBeenCalledWith(
      "customer-profile-id",
      expect.any(Date),
      transaction,
    );
    // CONFIRMED 요청이므로 CONFIRMED 견적을 보낸 기사님만 찾아야 한다(PROPOSED 아님).
    expect(findQuoteRecipientsByMoveRequestIdAndStatus).toHaveBeenCalledWith(
      "move-request-id",
      "CONFIRMED",
      transaction,
    );
    expect(createMoveRequestCancelNotifications).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ type: "CONFIRMED_MOVE_CANCELED", reason: "WITHDRAWAL" }),
    );
    expect(publishNotificationToUser).toHaveBeenCalledWith(
      "mover-user-id",
      expect.objectContaining({ type: "CONFIRMED_MOVE_CANCELED" }),
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
