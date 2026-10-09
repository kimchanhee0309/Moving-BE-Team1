/**
 * 실제 DB·SMTP 없이 Auth Service의 회원가입 이메일 인증(코드 발송·코드 확인·가입 시 토큰 검증)을 검증합니다.
 * Repository, 메일, 코드·토큰 서명, bcrypt, JWT 경계는 mock으로 분리하여 비즈니스 분기만 확인합니다.
 * 기존 가입·로그인·재설정 시나리오는 auth.service.test.ts가 담당합니다.
 */
jest.mock("../../src/modules/auth/auth.repository", () => ({
  consumeSignupEmailVerification: jest.fn(),
  createEmailUser: jest.fn(),
  createEmailUserInTransaction: jest.fn(),
  findSignupEmailVerificationByEmail: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserByPhone: jest.fn(),
  markSignupEmailVerificationVerified: jest.fn(),
  reserveSignupEmailCodeAttempt: jest.fn(),
  reserveSignupEmailVerification: jest.fn(),
  restoreSignupEmailVerification: jest.fn(),
  runAuthTransaction: jest.fn(),
}));

jest.mock("../../src/modules/auth/auth-email", () => ({
  assertSignupEmailConfigured: jest.fn(),
  sendSignupEmailCodeEmail: jest.fn(),
}));

jest.mock("../../src/modules/auth/auth-signup-email-verification", () => ({
  SIGNUP_EMAIL_CODE_EXPIRES_IN_MS: 300_000,
  SIGNUP_EMAIL_CODE_EXPIRES_IN_SECONDS: 300,
  SIGNUP_EMAIL_CODE_MAX_FAILED_ATTEMPTS: 5,
  SIGNUP_EMAIL_CODE_RESEND_AFTER_SECONDS: 60,
  SIGNUP_EMAIL_VERIFICATION_TOKEN_EXPIRES_IN_SECONDS: 900,
  createSignupEmailCode: jest.fn(),
  createSignupEmailVerificationToken: jest.fn(),
  hashSignupEmailCode: jest.fn(),
  matchesSignupEmailCode: jest.fn(),
  verifySignupEmailVerificationToken: jest.fn(),
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

jest.mock("../../src/modules/move-request/move-request.repository", () => ({
  createMoveRequestCancelNotifications: jest.fn(),
  findCancelableMoveRequestsByCustomerId: jest.fn(),
  findQuoteRecipientsByMoveRequestIdAndStatus: jest.fn(),
}));

jest.mock("../../src/modules/notification/notification.hub", () => ({
  publishNotificationToUser: jest.fn(),
}));

import { BadGatewayError, BadRequestError } from "../../src/common/errors/app-error";
import { createAuthTokens } from "../../src/common/utils/auth-token";
import { env } from "../../src/config/env";
import {
  assertSignupEmailConfigured,
  sendSignupEmailCodeEmail,
} from "../../src/modules/auth/auth-email";
import {
  createSignupEmailCode,
  createSignupEmailVerificationToken,
  hashSignupEmailCode,
  matchesSignupEmailCode,
  verifySignupEmailVerificationToken,
} from "../../src/modules/auth/auth-signup-email-verification";
import {
  consumeSignupEmailVerification,
  createEmailUser,
  createEmailUserInTransaction,
  findSignupEmailVerificationByEmail,
  findUserByEmail,
  findUserByPhone,
  markSignupEmailVerificationVerified,
  reserveSignupEmailCodeAttempt,
  reserveSignupEmailVerification,
  restoreSignupEmailVerification,
  runAuthTransaction,
  type AuthTransaction,
  type AuthUserRecord,
  type SignupEmailVerificationRecord,
} from "../../src/modules/auth/auth.repository";
import {
  requestSignupEmailCode,
  signUp,
  verifySignupEmailCode,
} from "../../src/modules/auth/auth.service";
import { hashPassword } from "../../src/modules/auth/password";

const EMAIL = "user@example.com";
const VERIFICATION_ID = "11111111-1111-4111-8111-111111111111";
const SENT_AT = new Date("2026-10-08T00:00:00.000Z");

const createdUser: AuthUserRecord = {
  id: "customer-user-id",
  name: "홍길동",
  email: EMAIL,
  phone: "01012345678",
  role: "CUSTOMER",
  passwordHash: "bcrypt-hash",
  customer: null,
  mover: null,
};

const pendingVerification: SignupEmailVerificationRecord = {
  id: VERIFICATION_ID,
  email: EMAIL,
  codeHash: "code-hash",
  failedAttempts: 0,
  sentAt: SENT_AT,
  expiresAt: new Date("2026-10-08T00:05:00.000Z"),
  verifiedAt: null,
};

const signUpInput = {
  name: "홍길동",
  email: EMAIL,
  phone: "01012345678",
  password: "Password1!",
  role: "CUSTOMER" as const,
};

const tokens = { accessToken: "access-token", refreshToken: "refresh-token" };
const transaction = {} as AuthTransaction;

describe("Auth service signup email verification", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(createAuthTokens).mockReturnValue(tokens);
    jest.mocked(createSignupEmailCode).mockReturnValue("123456");
    jest.mocked(hashSignupEmailCode).mockReturnValue("code-hash");
    jest.mocked(createSignupEmailVerificationToken).mockReturnValue("verification-token");
    jest.mocked(hashPassword).mockResolvedValue("bcrypt-hash");
    jest.mocked(findUserByEmail).mockResolvedValue(null);
    jest.mocked(findUserByPhone).mockResolvedValue(null);
    jest.mocked(runAuthTransaction).mockImplementation((operation) =>
      operation(transaction),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("인증코드 발송", () => {
    test("가입되지 않은 이메일에 5분 만료 코드를 보내고 타이머 정보를 반환한다", async () => {
      jest.mocked(reserveSignupEmailVerification).mockResolvedValue({
        verificationId: VERIFICATION_ID,
        previous: null,
      });

      await expect(
        requestSignupEmailCode({ email: EMAIL }, SENT_AT),
      ).resolves.toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });

      // 기대 결과: 만료 5분 뒤, 재발송 기준 60초 전, 정리 기준 1시간 전 시각으로 예약합니다.
      expect(reserveSignupEmailVerification).toHaveBeenCalledWith(
        EMAIL,
        "code-hash",
        SENT_AT,
        new Date("2026-10-08T00:05:00.000Z"),
        new Date("2026-10-07T23:59:00.000Z"),
        new Date("2026-10-07T23:00:00.000Z"),
      );
      expect(sendSignupEmailCodeEmail).toHaveBeenCalledWith(EMAIL, "123456");
    });

    test("이미 가입된 이메일은 코드를 만들거나 보내지 않고 EMAIL_ALREADY_EXISTS로 안내한다", async () => {
      jest.mocked(findUserByEmail).mockResolvedValue(createdUser);

      await expect(
        requestSignupEmailCode({ email: EMAIL }, SENT_AT),
      ).rejects.toMatchObject({ code: "EMAIL_ALREADY_EXISTS", status: 409 });
      expect(reserveSignupEmailVerification).not.toHaveBeenCalled();
      expect(sendSignupEmailCodeEmail).not.toHaveBeenCalled();
    });

    test("메일 설정이 없으면 DB에 예약하기 전에 중단한다", async () => {
      jest.mocked(assertSignupEmailConfigured).mockImplementation(() => {
        throw new BadRequestError("설정 필요", "EMAIL_VERIFICATION_EMAIL_NOT_CONFIGURED");
      });

      await expect(
        requestSignupEmailCode({ email: EMAIL }, SENT_AT),
      ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_EMAIL_NOT_CONFIGURED" });
      expect(reserveSignupEmailVerification).not.toHaveBeenCalled();
    });

    test("60초 안에 다시 요청하면 메일을 보내지 않고 429로 거절한다", async () => {
      jest.mocked(reserveSignupEmailVerification).mockResolvedValue(null);

      await expect(
        requestSignupEmailCode({ email: EMAIL }, SENT_AT),
      ).rejects.toMatchObject({
        code: "EMAIL_VERIFICATION_CODE_RESEND_TOO_SOON",
        status: 429,
      });
      expect(sendSignupEmailCodeEmail).not.toHaveBeenCalled();
    });

    test("메일 발송에 실패하면 예약을 직전 상태로 되돌리고 발송 오류를 그대로 전달한다", async () => {
      jest.mocked(reserveSignupEmailVerification).mockResolvedValue({
        verificationId: VERIFICATION_ID,
        previous: pendingVerification,
      });
      jest.mocked(sendSignupEmailCodeEmail).mockRejectedValue(
        new BadGatewayError("발송 실패", "EMAIL_VERIFICATION_EMAIL_FAILED"),
      );

      await expect(
        requestSignupEmailCode({ email: EMAIL }, SENT_AT),
      ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_EMAIL_FAILED", status: 502 });
      expect(restoreSignupEmailVerification).toHaveBeenCalledWith(
        EMAIL,
        "code-hash",
        pendingVerification,
      );
    });
  });

  describe("인증코드 확인", () => {
    const now = new Date("2026-10-08T00:01:00.000Z");

    test("올바른 코드는 한 번만 검증 완료 처리하고 15분 만료 인증 토큰을 발급한다", async () => {
      const reserved = { ...pendingVerification, failedAttempts: 1 };
      jest.mocked(findSignupEmailVerificationByEmail).mockResolvedValue(pendingVerification);
      jest.mocked(reserveSignupEmailCodeAttempt).mockResolvedValue(reserved);
      jest.mocked(matchesSignupEmailCode).mockReturnValue(true);
      jest.mocked(markSignupEmailVerificationVerified).mockResolvedValue({ count: 1 });

      await expect(
        verifySignupEmailCode({ email: EMAIL, code: "123456" }, now),
      ).resolves.toEqual({
        emailVerificationToken: "verification-token",
        expiresInSeconds: 900,
      });

      expect(reserveSignupEmailCodeAttempt).toHaveBeenCalledWith(
        VERIFICATION_ID,
        "code-hash",
        now,
        5,
      );
      expect(markSignupEmailVerificationVerified).toHaveBeenCalledWith(
        VERIFICATION_ID,
        "code-hash",
        now,
        5,
      );
      expect(createSignupEmailVerificationToken).toHaveBeenCalledWith(EMAIL, VERIFICATION_ID);
    });

    test("코드를 요청한 적이 없거나 이미 확인을 마친 이메일은 시도 차감 없이 거절한다", async () => {
      jest.mocked(findSignupEmailVerificationByEmail).mockResolvedValueOnce(null);
      await expect(
        verifySignupEmailCode({ email: EMAIL, code: "123456" }, now),
      ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_CODE_INVALID", status: 401 });

      jest.mocked(findSignupEmailVerificationByEmail).mockResolvedValueOnce({
        ...pendingVerification,
        verifiedAt: now,
      });
      await expect(
        verifySignupEmailCode({ email: EMAIL, code: "123456" }, now),
      ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_CODE_INVALID" });

      expect(reserveSignupEmailCodeAttempt).not.toHaveBeenCalled();
    });

    test("5분이 지난 코드는 EMAIL_VERIFICATION_CODE_EXPIRED로 거절한다", async () => {
      jest.mocked(findSignupEmailVerificationByEmail).mockResolvedValue(pendingVerification);

      await expect(
        verifySignupEmailCode(
          { email: EMAIL, code: "123456" },
          new Date("2026-10-08T00:05:00.000Z"),
        ),
      ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_CODE_EXPIRED", status: 400 });
      expect(reserveSignupEmailCodeAttempt).not.toHaveBeenCalled();
    });

    test("잘못된 코드는 401이고 다섯 번째 실패와 그 이후는 429로 제한한다", async () => {
      jest.mocked(findSignupEmailVerificationByEmail).mockResolvedValue(pendingVerification);
      jest.mocked(matchesSignupEmailCode).mockReturnValue(false);

      // 네 번째 실패까지는 다시 입력할 수 있습니다.
      jest.mocked(reserveSignupEmailCodeAttempt).mockResolvedValueOnce({
        ...pendingVerification,
        failedAttempts: 4,
      });
      await expect(
        verifySignupEmailCode({ email: EMAIL, code: "000000" }, now),
      ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_CODE_INVALID", status: 401 });

      // 다섯 번째 실패는 횟수 초과로 알립니다.
      jest.mocked(reserveSignupEmailCodeAttempt).mockResolvedValueOnce({
        ...pendingVerification,
        failedAttempts: 5,
      });
      await expect(
        verifySignupEmailCode({ email: EMAIL, code: "000000" }, now),
      ).rejects.toMatchObject({
        code: "EMAIL_VERIFICATION_CODE_ATTEMPTS_EXCEEDED",
        status: 429,
      });

      // 이미 횟수를 다 쓴 기록은 코드 비교 없이 거절합니다.
      jest.mocked(findSignupEmailVerificationByEmail).mockResolvedValue({
        ...pendingVerification,
        failedAttempts: 5,
      });
      jest.mocked(matchesSignupEmailCode).mockClear();
      await expect(
        verifySignupEmailCode({ email: EMAIL, code: "123456" }, now),
      ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_CODE_ATTEMPTS_EXCEEDED" });
      expect(matchesSignupEmailCode).not.toHaveBeenCalled();
      expect(createSignupEmailVerificationToken).not.toHaveBeenCalled();
    });

    test("병렬 요청으로 시도 예약에 실패하면 최신 상태로 사유를 다시 판정한다", async () => {
      jest.mocked(reserveSignupEmailCodeAttempt).mockResolvedValue(null);
      jest
        .mocked(findSignupEmailVerificationByEmail)
        .mockResolvedValueOnce(pendingVerification)
        .mockResolvedValueOnce({ ...pendingVerification, failedAttempts: 5 });

      await expect(
        verifySignupEmailCode({ email: EMAIL, code: "123456" }, now),
      ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_CODE_ATTEMPTS_EXCEEDED" });

      // 다른 요청이 먼저 확인을 마쳤다면 같은 코드를 다시 쓸 수 없습니다.
      jest
        .mocked(findSignupEmailVerificationByEmail)
        .mockResolvedValueOnce(pendingVerification)
        .mockResolvedValueOnce({ ...pendingVerification, verifiedAt: now });

      await expect(
        verifySignupEmailCode({ email: EMAIL, code: "123456" }, now),
      ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_CODE_INVALID" });
    });
  });

  describe("가입 시 인증 토큰 검증", () => {
    test("유효한 토큰이면 인증 기록 소비와 User 생성을 한 transaction에서 수행한다", async () => {
      jest.mocked(verifySignupEmailVerificationToken).mockReturnValue({
        email: EMAIL,
        verificationId: VERIFICATION_ID,
      });
      jest.mocked(consumeSignupEmailVerification).mockResolvedValue({ count: 1 });
      jest.mocked(createEmailUserInTransaction).mockResolvedValue(createdUser);

      await expect(
        signUp({ ...signUpInput, emailVerificationToken: "verification-token" }),
      ).resolves.toEqual({
        user: expect.objectContaining({ id: "customer-user-id", email: EMAIL }),
        tokens,
      });

      expect(consumeSignupEmailVerification).toHaveBeenCalledWith(
        transaction,
        VERIFICATION_ID,
        EMAIL,
      );
      // 기대 결과: 인증 토큰은 User 데이터에 저장하지 않습니다.
      expect(createEmailUserInTransaction).toHaveBeenCalledWith(transaction, {
        name: "홍길동",
        email: EMAIL,
        phone: "01012345678",
        passwordHash: "bcrypt-hash",
        role: "CUSTOMER",
      });
      expect(createEmailUser).not.toHaveBeenCalled();
    });

    test("인증한 이메일과 가입 이메일이 다르면 DB 조회 전에 거절한다", async () => {
      jest.mocked(verifySignupEmailVerificationToken).mockReturnValue({
        email: "verified@example.com",
        verificationId: VERIFICATION_ID,
      });

      await expect(
        signUp({ ...signUpInput, emailVerificationToken: "verification-token" }),
      ).rejects.toMatchObject({
        code: "EMAIL_VERIFICATION_EMAIL_MISMATCH",
        status: 400,
        details: [expect.objectContaining({ field: "email" })],
      });
      expect(findUserByEmail).not.toHaveBeenCalled();
      expect(hashPassword).not.toHaveBeenCalled();
    });

    test("위조·만료 토큰은 호환 기간에도 무시하지 않고 거절한다", async () => {
      jest.mocked(verifySignupEmailVerificationToken).mockImplementation(() => {
        throw new BadRequestError("인증 만료", "EMAIL_VERIFICATION_TOKEN_INVALID");
      });

      await expect(
        signUp({ ...signUpInput, emailVerificationToken: "forged-token" }),
      ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_TOKEN_INVALID" });
      expect(createEmailUser).not.toHaveBeenCalled();
      expect(createEmailUserInTransaction).not.toHaveBeenCalled();
    });

    test("이미 가입에 사용했거나 새 코드 요청으로 무효가 된 토큰은 User를 만들지 않는다", async () => {
      jest.mocked(verifySignupEmailVerificationToken).mockReturnValue({
        email: EMAIL,
        verificationId: VERIFICATION_ID,
      });
      jest.mocked(consumeSignupEmailVerification).mockResolvedValue({ count: 0 });

      await expect(
        signUp({ ...signUpInput, emailVerificationToken: "verification-token" }),
      ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_TOKEN_INVALID", status: 400 });
      expect(createEmailUserInTransaction).not.toHaveBeenCalled();
      expect(createAuthTokens).not.toHaveBeenCalled();
    });

    test("전화번호가 중복이면 인증 기록을 소비하지 않아 같은 토큰으로 다시 시도할 수 있다", async () => {
      jest.mocked(verifySignupEmailVerificationToken).mockReturnValue({
        email: EMAIL,
        verificationId: VERIFICATION_ID,
      });
      jest.mocked(findUserByPhone).mockResolvedValue(createdUser);

      await expect(
        signUp({ ...signUpInput, emailVerificationToken: "verification-token" }),
      ).rejects.toMatchObject({ code: "PHONE_ALREADY_EXISTS" });
      expect(consumeSignupEmailVerification).not.toHaveBeenCalled();
    });

    test("호환 기간(REQUIRED=false)에는 토큰 없는 구버전 FE 가입을 그대로 허용한다", async () => {
      jest.replaceProperty(env, "SIGNUP_EMAIL_VERIFICATION_REQUIRED", false);
      jest.mocked(createEmailUser).mockResolvedValue(createdUser);

      await expect(signUp(signUpInput)).resolves.toEqual({
        user: expect.objectContaining({ id: "customer-user-id" }),
        tokens,
      });
      expect(verifySignupEmailVerificationToken).not.toHaveBeenCalled();
      expect(runAuthTransaction).not.toHaveBeenCalled();
    });

    test("필수 전환(REQUIRED=true) 뒤에는 토큰 없는 가입을 EMAIL_VERIFICATION_REQUIRED로 거절한다", async () => {
      jest.replaceProperty(env, "SIGNUP_EMAIL_VERIFICATION_REQUIRED", true);

      await expect(signUp(signUpInput)).rejects.toMatchObject({
        code: "EMAIL_VERIFICATION_REQUIRED",
        status: 400,
        details: [expect.objectContaining({ field: "emailVerificationToken" })],
      });
      expect(findUserByEmail).not.toHaveBeenCalled();
      expect(createEmailUser).not.toHaveBeenCalled();
    });
  });
});
