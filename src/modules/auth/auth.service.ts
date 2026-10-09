/**
 * 이메일 회원가입·로그인·세션 복구·회원 탈퇴·토큰 발급·회전 규칙을 처리합니다.
 * HTTP 객체와 cookie는 다루지 않고, 민감정보를 제거한 DTO·토큰·삭제 결과만 Controller에 반환합니다.
 */
import {
  WITHDRAWN_CUSTOMER_NAME,
  WITHDRAWN_MOVER_NAME,
  createWithdrawnEmail,
  createWithdrawnMoverNickname,
} from "../../common/constants/withdrawn-account";
import {
  BadRequestError,
  ConflictError,
  TooManyRequestsError,
  UnauthorizedError,
} from "../../common/errors/app-error";
import { createAuthTokens, verifyToken } from "../../common/utils/auth-token";
import { removeReplacedLocalProfileImage } from "../customer-profile/customer-profile.image";
import {
  createMoveRequestCancelNotifications,
  deleteMoveRequestById,
  deleteRequestRejectionsByMoveRequestId,
  findCancelableMoveRequestsByCustomerId,
  findQuoteRecipientsByMoveRequestIdAndStatus,
  type CreatedMoveRequestCancelNotificationRecord,
} from "../move-request/move-request.repository";
import { removeReplacedMoverProfileImage } from "../mover-profile/mover-profile.image";
import { publishNotificationToUser } from "../notification/notification.hub";
import type {
  AccountRecoveryRequestDto,
  AuthResult,
  AuthUserDto,
  ConfirmPasswordResetRequestDto,
  LoginRequestDto,
  OptionalAuthSessionResult,
  PasswordResetCodeRequestResultDto,
  RefreshAuthResult,
  SignUpRequestDto,
  RecoveryVerificationResultDto,
  VerifyPasswordResetCodeRequestDto,
  WithdrawAccountRequestDto,
} from "./auth.dto";
import {
  createPasswordResetToken,
  matchesCredentialVersion,
  verifyPasswordResetToken,
} from "./auth-recovery";
import {
  PASSWORD_RESET_CODE_EXPIRES_IN_MS,
  PASSWORD_RESET_CODE_EXPIRES_IN_SECONDS,
  PASSWORD_RESET_CODE_MAX_FAILED_ATTEMPTS,
  PASSWORD_RESET_CODE_RESEND_AFTER_SECONDS,
  createPasswordResetCode,
  hashPasswordResetCode,
  matchesPasswordResetCode,
} from "./auth-password-reset-code";
import {
  assertPasswordResetEmailConfigured,
  sendPasswordResetCodeEmail,
} from "./auth-email";
import { toAuthUserDto } from "./auth.mapper";
import {
  assertLoginAttemptAllowed,
  clearLoginAttempts,
  registerLoginFailure,
} from "./auth-login-attempt";
import {
  anonymizeUserWithAuthState,
  clearWithdrawnProfileData,
  countUpcomingConfirmedMoves,
  createEmailUser,
  createMoverWithdrawalNotifications,
  consumePasswordResetChallenge,
  deleteMoverWithdrawalRelations,
  findPendingQuotesByMoverId,
  findUserByEmail,
  findUserById,
  findUserByPhone,
  findUserForWithdrawal,
  findPasswordResetChallengeById,
  findPasswordResetChallengeForCompletion,
  findPasswordResetUserByEmail,
  markPasswordResetChallengeVerified,
  reservePasswordResetChallenge,
  reservePasswordResetCodeAttempt,
  restorePasswordResetChallenge,
  runAuthTransaction,
  updateEmailUserPassword,
  type CreatedMoverWithdrawalNotificationRecord,
} from "./auth.repository";
import { hashPassword, verifyPassword } from "./password";

/**
 * 이메일·전화번호 중복을 확인하고 bcrypt hash만 저장한 뒤 인증 토큰을 발급합니다.
 * @param input Validator가 정규화한 회원가입 요청 DTO
 * @returns 공개 사용자와 cookie 설정용 Access/Refresh Token
 * @throws 이메일·전화번호 중복 시 각각 EMAIL_ALREADY_EXISTS, PHONE_ALREADY_EXISTS
 * @remarks User를 생성하며 역할 profile과 cookie는 생성하지 않습니다.
 */
export async function signUp(input: SignUpRequestDto): Promise<AuthResult> {
  const [emailUser, phoneUser] = await Promise.all([
    findUserByEmail(input.email),
    findUserByPhone(input.phone),
  ]);

  if (emailUser) {
    throw new ConflictError("이미 사용 중인 이메일입니다.", "EMAIL_ALREADY_EXISTS");
  }

  if (phoneUser) {
    throw new ConflictError("이미 사용 중인 전화번호입니다.", "PHONE_ALREADY_EXISTS");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await createEmailUser({
    name: input.name,
    email: input.email,
    phone: input.phone,
    passwordHash,
    role: input.role,
  });

  return {
    user: toAuthUserDto(user),
    tokens: createAuthTokens(user.id, user.role),
  };
}

/**
 * 계정 존재·비밀번호·역할을 확인하고 인증 토큰을 발급합니다.
 * @param input Validator가 정규화한 로그인 요청 DTO
 * @returns 공개 사용자와 cookie 설정용 Access/Refresh Token
 * @throws 세 자격 증명 중 하나라도 실패하면 동일한 INVALID_CREDENTIALS
 * @remarks DB를 변경하지 않으며 cookie 설정은 Controller가 담당합니다.
 */
export async function login(input: LoginRequestDto): Promise<AuthResult> {
  assertLoginAttemptAllowed(input);
  const user = await findUserByEmail(input.email);
  const isPasswordValid =
    user?.passwordHash !== null && user?.passwordHash !== undefined
      ? await verifyPassword(input.password, user.passwordHash)
      : false;

  // 계정 존재 여부를 추측하지 못하도록 모든 자격 증명 실패를 같은 오류로 반환합니다.
  if (!user || !isPasswordValid || user.role !== input.role) {
    registerLoginFailure(input);
    throw new UnauthorizedError(
      "이메일 또는 비밀번호가 올바르지 않습니다.",
      "INVALID_CREDENTIALS",
    );
  }

  clearLoginAttempts(input);

  return {
    user: toAuthUserDto(user),
    tokens: createAuthTokens(user.id, user.role),
  };
}

/**
 * 본인 정보가 일치하는 이메일 계정에 5분 만료 숫자 코드를 발송합니다.
 * @param input 이름·이메일·역할을 포함한 계정 확인 입력
 * @param now 만료·재발송 시간을 계산할 서버 시각
 * @returns EMAIL이면 challenge 정보, OAuth와 불일치는 각각 SOCIAL/NONE
 * @throws 60초 내 재발송 시 PASSWORD_RESET_CODE_RESEND_TOO_SOON
 * @remarks 코드 HMAC을 DB에 저장하고 코드 원문은 SMTP로만 전송합니다.
 */
export async function requestPasswordResetCode(
  input: AccountRecoveryRequestDto,
  now = new Date(),
): Promise<PasswordResetCodeRequestResultDto> {
  const user = await findPasswordResetUserByEmail(input.email);

  if (!user || user.name !== input.name || user.role !== input.role) {
    return {
      delivery: "NONE",
      challengeId: null,
      expiresInSeconds: null,
      resendAfterSeconds: null,
    };
  }

  if (!user.passwordHash) {
    return {
      delivery: "SOCIAL",
      challengeId: null,
      expiresInSeconds: null,
      resendAfterSeconds: null,
    };
  }

  assertPasswordResetEmailConfigured();

  const code = createPasswordResetCode();
  const codeHash = hashPasswordResetCode(user.id, code);
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_CODE_EXPIRES_IN_MS);
  const resendAllowedAt = new Date(
    now.getTime() - PASSWORD_RESET_CODE_RESEND_AFTER_SECONDS * 1000,
  );
  const reservation = await reservePasswordResetChallenge(
    user.id,
    codeHash,
    now,
    expiresAt,
    resendAllowedAt,
  );

  if (!reservation) {
    throw new TooManyRequestsError(
      "인증코드는 1분 후 다시 보낼 수 있습니다.",
      "PASSWORD_RESET_CODE_RESEND_TOO_SOON",
    );
  }

  try {
    await sendPasswordResetCodeEmail(user.email, code);
  } catch (error: unknown) {
    await restorePasswordResetChallenge(
      user.id,
      codeHash,
      reservation.previous,
    );
    throw error;
  }

  return {
    delivery: "EMAIL",
    challengeId: reservation.challengeId,
    expiresInSeconds: PASSWORD_RESET_CODE_EXPIRES_IN_SECONDS,
    resendAfterSeconds: PASSWORD_RESET_CODE_RESEND_AFTER_SECONDS,
  };
}

/**
 * 6자리 코드의 HMAC·만료·실패 횟수를 확인하고 challenge를 한 번만 검증 완료 처리합니다.
 * @param input 공개 challenge ID와 사용자가 입력한 6자리 코드
 * @param now 만료와 검증 완료 시각에 사용할 서버 시각
 * @returns 기존 비밀번호 hash에 연결된 15분 만료 재설정 토큰
 * @throws 코드 불일치·만료·실패 횟수 초과·재사용 시 인증 오류
 * @remarks 실패 횟수와 verifiedAt을 DB에 원자적으로 갱신합니다.
 */
export async function verifyPasswordResetCode(
  input: VerifyPasswordResetCodeRequestDto,
  now = new Date(),
): Promise<RecoveryVerificationResultDto> {
  const challenge = await findPasswordResetChallengeById(input.challengeId);

  if (!challenge?.user.passwordHash || challenge.consumedAt || challenge.verifiedAt) {
    throw new UnauthorizedError(
      "인증코드가 올바르지 않습니다.",
      "PASSWORD_RESET_CODE_INVALID",
    );
  }

  if (challenge.expiresAt.getTime() <= now.getTime()) {
    throw new BadRequestError(
      "인증코드가 만료되었습니다. 새 코드를 요청해 주세요.",
      "PASSWORD_RESET_CODE_EXPIRED",
    );
  }

  if (challenge.failedAttempts >= PASSWORD_RESET_CODE_MAX_FAILED_ATTEMPTS) {
    throw new TooManyRequestsError(
      "인증코드 확인 횟수를 초과했습니다. 새 코드를 요청해 주세요.",
      "PASSWORD_RESET_CODE_ATTEMPTS_EXCEEDED",
    );
  }

  const reservedAttempt = await reservePasswordResetCodeAttempt(
    challenge.id,
    challenge.codeHash,
    now,
    PASSWORD_RESET_CODE_MAX_FAILED_ATTEMPTS,
  );

  if (!reservedAttempt) {
    const latestChallenge = await findPasswordResetChallengeById(challenge.id);
    if (latestChallenge?.expiresAt && latestChallenge.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestError(
        "인증코드가 만료되었습니다. 새 코드를 요청해 주세요.",
        "PASSWORD_RESET_CODE_EXPIRED",
      );
    }
    if (
      latestChallenge &&
      latestChallenge.failedAttempts >= PASSWORD_RESET_CODE_MAX_FAILED_ATTEMPTS
    ) {
      throw new TooManyRequestsError(
        "인증코드 확인 횟수를 초과했습니다. 새 코드를 요청해 주세요.",
        "PASSWORD_RESET_CODE_ATTEMPTS_EXCEEDED",
      );
    }

    throw new UnauthorizedError(
      "인증코드가 올바르지 않습니다.",
      "PASSWORD_RESET_CODE_INVALID",
    );
  }

  if (!matchesPasswordResetCode(
    reservedAttempt.userId,
    input.code,
    reservedAttempt.codeHash,
  )) {
    if (reservedAttempt.failedAttempts >= PASSWORD_RESET_CODE_MAX_FAILED_ATTEMPTS) {
      throw new TooManyRequestsError(
        "인증코드 확인 횟수를 초과했습니다. 새 코드를 요청해 주세요.",
        "PASSWORD_RESET_CODE_ATTEMPTS_EXCEEDED",
      );
    }

    throw new UnauthorizedError(
      "인증코드가 올바르지 않습니다.",
      "PASSWORD_RESET_CODE_INVALID",
    );
  }

  if (!reservedAttempt.user.passwordHash) {
    throw new UnauthorizedError(
      "인증코드가 올바르지 않습니다.",
      "PASSWORD_RESET_CODE_INVALID",
    );
  }

  const verification = await markPasswordResetChallengeVerified(
    reservedAttempt.id,
    reservedAttempt.codeHash,
    now,
    PASSWORD_RESET_CODE_MAX_FAILED_ATTEMPTS,
  );
  if (verification.count !== 1) {
    throw new BadRequestError(
      "인증코드가 만료되었거나 이미 사용되었습니다.",
      "PASSWORD_RESET_CODE_INVALID",
    );
  }

  return {
    resetToken: createPasswordResetToken(
      reservedAttempt.user.id,
      reservedAttempt.user.role,
      reservedAttempt.user.passwordHash,
      reservedAttempt.id,
    ),
  };
}

/** 이메일 코드 검증으로 발급한 토큰의 서명·만료·현재 password hash를 확인한 뒤 새 hash를 저장합니다. */
export async function confirmPasswordReset(
  input: ConfirmPasswordResetRequestDto,
): Promise<void> {
  const payload = verifyPasswordResetToken(input.token);

  // 이미 사용됐거나 비밀번호가 바뀐 토큰은 bcrypt 비용을 쓰기 전에 거절합니다.
  // 경쟁 상황은 아래 transaction 안에서 같은 조건을 다시 확인합니다.
  const challengeBeforeUpdate = await findPasswordResetChallengeById(payload.challengeId);
  if (
    !challengeBeforeUpdate?.verifiedAt ||
    challengeBeforeUpdate.consumedAt ||
    challengeBeforeUpdate.user.id !== payload.userId ||
    challengeBeforeUpdate.user.role !== payload.role ||
    !challengeBeforeUpdate.user.passwordHash ||
    !matchesCredentialVersion(challengeBeforeUpdate.user.passwordHash, payload.credentialVersion)
  ) {
    throw new BadRequestError(
      "비밀번호 재설정 인증이 만료되었거나 올바르지 않습니다.",
      "PASSWORD_RESET_TOKEN_INVALID",
    );
  }

  const nextPasswordHash = await hashPassword(input.newPassword);

  await runAuthTransaction(async (transaction) => {
    const challenge = await findPasswordResetChallengeForCompletion(
      transaction,
      payload.challengeId,
    );
    const user = challenge?.user;

    if (
      !challenge?.verifiedAt ||
      challenge.consumedAt ||
      !user?.passwordHash ||
      user.id !== payload.userId ||
      user.role !== payload.role ||
      !matchesCredentialVersion(user.passwordHash, payload.credentialVersion)
    ) {
      throw new BadRequestError(
        "비밀번호 재설정 인증이 만료되었거나 올바르지 않습니다.",
        "PASSWORD_RESET_TOKEN_INVALID",
      );
    }

    const consumed = await consumePasswordResetChallenge(
      transaction,
      challenge.id,
      user.id,
      new Date(),
    );
    const updated = await updateEmailUserPassword(
      transaction,
      user.id,
      user.passwordHash,
      nextPasswordHash,
    );

    if (consumed.count !== 1 || updated.count !== 1) {
      throw new BadRequestError(
        "비밀번호 재설정 인증이 이미 사용되었습니다.",
        "PASSWORD_RESET_TOKEN_INVALID",
      );
    }
  });
}

/** 인증된 ID를 DB에서 다시 조회해 삭제된 사용자와 최신 profile 등록 상태를 확인합니다. */
export async function getCurrentUser(userId: string): Promise<AuthUserDto> {
  const user = await findUserById(userId);

  if (!user) {
    throw new UnauthorizedError("사용자 정보를 확인할 수 없습니다.", "USER_NOT_FOUND");
  }

  return toAuthUserDto(user);
}

async function rotateRefreshAuth(refreshToken: string): Promise<AuthResult> {
  const payload = verifyToken(refreshToken, "refresh");
  const user = await findUserById(payload.userId);

  if (!user || user.role !== payload.role) {
    throw new UnauthorizedError(
      "Refresh Token이 유효하지 않습니다.",
      "REFRESH_TOKEN_INVALID",
    );
  }

  return {
    user: toAuthUserDto(user),
    tokens: createAuthTokens(user.id, user.role),
  };
}

/**
 * 유효 Access는 그대로 사용하고, Access가 없거나 만료된 경우에만 stateless Refresh를 회전합니다.
 * 위조·서명 오류·잘못된 payload의 Access는 Refresh로 우회하지 않고 기존 Access 오류를 반환합니다.
 */
export async function refreshAuth(
  accessToken: string | null,
  refreshToken: string | null,
): Promise<RefreshAuthResult> {
  if (accessToken) {
    try {
      const payload = verifyToken(accessToken, "access");
      const user = await findUserById(payload.userId);

      if (!user || user.role !== payload.role) {
        throw new UnauthorizedError(
          "Access Token이 유효하지 않습니다.",
          "ACCESS_TOKEN_INVALID",
        );
      }

      return { user: toAuthUserDto(user), tokens: null };
    } catch (error: unknown) {
      if (
        !(error instanceof UnauthorizedError) ||
        error.code !== "ACCESS_TOKEN_EXPIRED"
      ) {
        throw error;
      }
    }
  }

  if (!refreshToken) {
    throw new UnauthorizedError(
      "Refresh Token이 필요합니다.",
      "REFRESH_TOKEN_MISSING",
    );
  }

  return rotateRefreshAuth(refreshToken);
}

/**
 * 공개 페이지의 선택적 세션 확인에서 Access를 우선 사용하고 필요할 때만 Refresh로 복구합니다.
 * @param accessToken 브라우저가 보낸 Access Token 또는 null
 * @param refreshToken `/auth/refresh` 경로에만 전송되는 Refresh Token 또는 null
 * @returns 로그인 사용자, 선택적 회전 토큰, 오래된 쿠키 정리 여부
 * @throws DB 장애 등 인증 실패가 아닌 예기치 않은 오류
 * @remarks 잘못되거나 만료된 인증은 이 선택적 endpoint에서 비회원으로 정리하며 보호 API 계약은 바꾸지 않습니다.
 */
export async function restoreOptionalAuthSession(
  accessToken: string | null,
  refreshToken: string | null,
): Promise<OptionalAuthSessionResult> {
  const hadAuthCookie = accessToken !== null || refreshToken !== null;

  if (accessToken) {
    try {
      const payload = verifyToken(accessToken, "access");
      const user = await findUserById(payload.userId);

      if (user && user.role === payload.role) {
        return {
          user: toAuthUserDto(user),
          tokens: null,
          shouldClearCookies: false,
        };
      }

      return {
        user: null,
        tokens: null,
        shouldClearCookies: true,
      };
    } catch (error: unknown) {
      if (!(error instanceof UnauthorizedError)) throw error;
      if (error.code !== "ACCESS_TOKEN_EXPIRED") {
        return {
          user: null,
          tokens: null,
          shouldClearCookies: true,
        };
      }
    }
  }

  if (refreshToken) {
    try {
      const refreshed = await rotateRefreshAuth(refreshToken);

      return {
        user: refreshed.user,
        tokens: refreshed.tokens,
        shouldClearCookies: false,
      };
    } catch (error: unknown) {
      if (!(error instanceof UnauthorizedError)) throw error;
    }
  }

  return {
    user: null,
    tokens: null,
    shouldClearCookies: hadAuthCookie,
  };
}

/** 탈퇴 transaction 커밋 뒤 상대방에게 실시간으로 보낼 알림입니다. */
type WithdrawalNotificationRecord =
  | CreatedMoveRequestCancelNotificationRecord
  | CreatedMoverWithdrawalNotificationRecord;

/** withdrawAccount transaction이 반환하는 정리 대상(프로필 이미지 경로와 커밋 뒤 push할 알림)입니다. */
interface WithdrawalTransactionResult {
  profileImages: {
    customer: string | null;
    mover: string | null;
  };
  notifications: WithdrawalNotificationRecord[];
}

function createWithdrawalBlockedError(): ConflictError {
  return new ConflictError(
    "확정된 이사가 있어 탈퇴할 수 없습니다. 이사가 끝난 뒤 다시 시도해 주세요.",
    "WITHDRAWAL_BLOCKED_BY_CONFIRMED_MOVE",
  );
}

/**
 * 최신 User 인증 수단으로 본인을 재확인한 뒤 계정을 soft delete하고 개인정보를 즉시 익명화합니다.
 * @param userId Access Token으로 검증된 요청 사용자 ID
 * @param input 이메일 계정의 현재 비밀번호 또는 OAuth 계정의 빈 요청
 * @param now 확정 이사 차단 판정과 탈퇴 시각에 사용할 서버 시각
 * @returns 탈퇴 완료 후 반환값이 없는 Promise. 이미 탈퇴한 계정의 재요청은 멱등 성공입니다.
 * @throws 이메일 계정 비밀번호 누락 시 CURRENT_PASSWORD_REQUIRED, 불일치 시 INVALID_CURRENT_PASSWORD,
 * 확정됐고 이사일이 지나지 않은 이사가 있으면 WITHDRAWAL_BLOCKED_BY_CONFIRMED_MOVE(409)
 * @remarks 처리 순서와 남기는 데이터는 다음과 같습니다.
 * 1) 본인 재확인 → 2) 확정 이사가 있으면 차단(상대방 일정 보호) →
 * 3) 고객: 대기 중인 이사 요청을 삭제하고 견적을 보낸 기사님에게 MOVE_REQUEST_CANCELED 알림 →
 * 4) 기사님: 대기 중인 견적을 삭제하고 고객에게 QUOTE_CANCELED_BY_MOVER_WITHDRAWAL 알림, 활동 지역·서비스 삭제 →
 * 5) User 익명화(이름·이메일·전화번호·비밀번호·SNS 연결 제거, deletedAt 기록) → 6) 프로필 이미지·소개·본인 알림 정리.
 * 리뷰, 완료된 이사의 요청·확정 견적, 찜은 남깁니다. 같은 이메일·SNS로 즉시 재가입할 수 있고 탈퇴 계정은 복구할 수 없습니다.
 * User row를 남기므로 탈퇴 전에 발급된 토큰은 findUserById와 profile guard의 deletedAt 조건으로 거절합니다.
 */
export async function withdrawAccount(
  userId: string,
  input: WithdrawAccountRequestDto,
  now = new Date(),
): Promise<void> {
  const result = await runAuthTransaction(async (transaction) => {
    // 1) 본인 재확인
    const user = await findUserForWithdrawal(transaction, userId);

    // 서명된 이전 토큰으로 동시에 재요청한 경우 이미 달성된 탈퇴를 멱등 성공으로 처리합니다.
    if (!user) return null;

    if (user.passwordHash) {
      if (input.currentPassword === undefined) {
        throw new BadRequestError(
          "현재 비밀번호를 입력해 주세요.",
          "CURRENT_PASSWORD_REQUIRED",
          [{
            field: "currentPassword",
            reason: "이메일 계정 탈퇴에는 현재 비밀번호가 필요합니다.",
          }],
        );
      }

      const isCurrentPasswordValid = await verifyPassword(
        input.currentPassword,
        user.passwordHash,
      );

      if (!isCurrentPasswordValid) {
        throw new UnauthorizedError(
          "현재 비밀번호가 올바르지 않습니다.",
          "INVALID_CURRENT_PASSWORD",
        );
      }
    } else if (!user.socialProvider) {
      throw new ConflictError(
        "계정의 인증 방법을 확인할 수 없습니다.",
        "ACCOUNT_AUTH_METHOD_INVALID",
      );
    }

    // 2) 확정됐고 이사일이 지나지 않은 이사가 있으면 상대방이 이사 직전에 혼자 남지 않도록 탈퇴를 막습니다.
    if ((await countUpcomingConfirmedMoves(transaction, user, now)) > 0) {
      throw createWithdrawalBlockedError();
    }

    const notifications: WithdrawalNotificationRecord[] = [];

    // 3) 고객: 아직 확정하지 않은 이사 요청을 삭제하고 견적을 보낸 기사님에게 알립니다.
    // 완료됐거나 이사일이 지난 확정 요청은 기사님의 완료 이력과 리뷰를 위해 남깁니다.
    if (user.customer) {
      const moveRequests = await findCancelableMoveRequestsByCustomerId(
        user.customer.id,
        now,
        transaction,
      );

      for (const moveRequest of moveRequests) {
        // 위 차단 검사와 이 조회 사이에 견적이 확정됐다면 삭제하지 않고 탈퇴를 막습니다.
        if (moveRequest.status !== "WAITING") {
          throw createWithdrawalBlockedError();
        }

        const recipients = await findQuoteRecipientsByMoveRequestIdAndStatus(
          moveRequest.id,
          "PROPOSED",
          transaction,
        );

        // 알림은 참조할 요청·견적이 남아 있을 때 먼저 만들고, 그다음 요청을 삭제합니다.
        notifications.push(
          ...(await createMoveRequestCancelNotifications(transaction, {
            type: "MOVE_REQUEST_CANCELED",
            reason: "WITHDRAWAL",
            moveRequestId: moveRequest.id,
            customerName: moveRequest.customer.user.name,
            recipients,
          })),
        );

        // RequestRejection만 Cascade가 아니므로 요청보다 먼저 지웁니다.
        await deleteRequestRejectionsByMoveRequestId(moveRequest.id, transaction);
        await deleteMoveRequestById(moveRequest.id, transaction);
      }
    }

    // 4) 기사님: 고객이 아직 확정하지 않은 견적을 삭제하고 그 고객에게 알립니다.
    if (user.mover) {
      const pendingQuotes = await findPendingQuotesByMoverId(transaction, user.mover.id);

      notifications.push(
        ...(await createMoverWithdrawalNotifications(transaction, {
          // 익명화하기 전의 닉네임이어야 고객이 어느 기사님의 견적인지 알 수 있습니다.
          moverNickname: user.mover.nickname,
          quotes: pendingQuotes,
        })),
      );

      await deleteMoverWithdrawalRelations(transaction, user.mover.id);
    }

    // 5) 개인정보를 즉시 익명화합니다. 조회한 인증 상태가 그대로인 계정만 바꿔 비밀번호 변경과의 경쟁을 막습니다.
    const withdrawnAccount = {
      name: user.role === "MOVER" ? WITHDRAWN_MOVER_NAME : WITHDRAWN_CUSTOMER_NAME,
      email: createWithdrawnEmail(user.id),
      moverNickname: createWithdrawnMoverNickname(user.id),
      deletedAt: now,
    };
    const anonymized = await anonymizeUserWithAuthState(
      transaction,
      user,
      withdrawnAccount,
    );

    if (anonymized.count === 0) {
      const latestUser = await findUserForWithdrawal(transaction, userId);

      // 계정은 남아 있는데 인증 수단만 바뀐 이메일 계정은 방금 확인한 비밀번호가 더는 유효하지 않은 것입니다.
      if (latestUser && user.passwordHash) {
        throw new UnauthorizedError(
          "현재 비밀번호가 올바르지 않습니다.",
          "INVALID_CURRENT_PASSWORD",
        );
      }

      // 동시 요청이 먼저 탈퇴를 끝냈거나 SNS 연결이 바뀐 경우입니다.
      // 이번 transaction이 만든 삭제와 알림이 중복으로 남지 않도록 오류로 rollback합니다.
      throw new ConflictError(
        "계정 정보가 변경되었습니다. 다시 시도해 주세요.",
        "ACCOUNT_STATE_CHANGED",
      );
    }

    // 6) 프로필 이미지 주소·소개·본인 알림을 지웁니다. 실패하면 transaction 전체가 rollback됩니다.
    await clearWithdrawnProfileData(transaction, user, withdrawnAccount);

    return {
      profileImages: {
        customer: user.customer?.profileImageUrl ?? null,
        mover: user.mover?.profileImageUrl ?? null,
      },
      notifications,
    } satisfies WithdrawalTransactionResult;
  });

  if (!result) return;

  // transaction이 커밋된 뒤에만 push한다(다른 도메인의 취소·확정 알림과 동일한 관례). 커밋 전에
  // push하면 이후 오류로 rollback될 경우 실제로 저장되지 않은 알림을 클라이언트가 먼저 받을 수 있다.
  if (result.notifications.length > 0) {
    const createdAt = new Date().toISOString();

    for (const notification of result.notifications) {
      publishNotificationToUser(notification.userId, {
        type: notification.type,
        title: notification.title,
        content: notification.content,
        params: notification.params ?? null,
        moveRequestId: notification.moveRequestId,
        quoteId: notification.quoteId,
        createdAt,
      });
    }
  }

  // DB 탈퇴는 확정됐으므로 파일 정리 실패가 탈퇴 성공을 되돌리지는 않습니다.
  await Promise.all([
    removeReplacedLocalProfileImage(result.profileImages.customer),
    removeReplacedMoverProfileImage(result.profileImages.mover),
  ]);
}
