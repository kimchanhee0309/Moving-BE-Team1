/**
 * 이메일 회원가입·로그인·세션 복구·회원 탈퇴·토큰 발급·회전 규칙을 처리합니다.
 * HTTP 객체와 cookie는 다루지 않고, 민감정보를 제거한 DTO·토큰·삭제 결과만 Controller에 반환합니다.
 */
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from "../../common/errors/app-error";
import { createAuthTokens, verifyToken } from "../../common/utils/auth-token";
import { removeReplacedLocalProfileImage } from "../customer-profile/customer-profile.image";
import { removeReplacedMoverProfileImage } from "../mover-profile/mover-profile.image";
import type {
  AccountLookupResultDto,
  AccountRecoveryRequestDto,
  AuthResult,
  AuthUserDto,
  ConfirmPasswordResetRequestDto,
  LoginRequestDto,
  OptionalAuthSessionResult,
  SignUpRequestDto,
  RecoveryQuestionResultDto,
  RecoveryVerificationResultDto,
  VerifyRecoveryAnswerRequestDto,
  WithdrawAccountRequestDto,
} from "./auth.dto";
import {
  createPasswordResetToken,
  matchesCredentialVersion,
  verifyPasswordResetToken,
} from "./auth-recovery";
import { toAuthUserDto } from "./auth.mapper";
import {
  assertLoginAttemptAllowed,
  clearLoginAttempts,
  registerLoginFailure,
} from "./auth-login-attempt";
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

  const [passwordHash, recoveryAnswerHash] = await Promise.all([
    hashPassword(input.password),
    hashPassword(input.recoveryAnswer),
  ]);
  const user = await createEmailUser({
    name: input.name,
    email: input.email,
    phone: input.phone,
    passwordHash,
    role: input.role,
    recoveryQuestion: input.recoveryQuestion,
    recoveryAnswerHash,
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

/** 입력한 이름·이메일·역할이 정확히 일치할 때 로그인 ID와 계정 방식을 반환합니다. */
export async function findAccount(
  input: AccountRecoveryRequestDto,
): Promise<AccountLookupResultDto> {
  const user = await findUserByEmail(input.email);
  if (!user || user.name !== input.name || user.role !== input.role) {
    return { found: false, loginId: null, loginMethod: null };
  }
  return {
    found: true,
    loginId: user.email,
    loginMethod: user.passwordHash ? "EMAIL" : "SOCIAL",
  };
}

/** 본인 정보가 일치하는 이메일 계정의 복구 질문을 반환합니다. OAuth는 SNS 로그인을 안내합니다. */
export async function getRecoveryQuestion(
  input: AccountRecoveryRequestDto,
): Promise<RecoveryQuestionResultDto> {
  const user = await findRecoveryUserByEmail(input.email);
  if (!user || user.name !== input.name || user.role !== input.role) {
    return { available: false, question: null, loginMethod: null };
  }
  if (!user.passwordHash) {
    return { available: false, question: null, loginMethod: "SOCIAL" };
  }
  return {
    available: user.passwordRecoveryChallenge !== null,
    question: user.passwordRecoveryChallenge?.question ?? null,
    loginMethod: "EMAIL",
  };
}

/** 복구 답변 hash를 확인하고 성공한 경우에만 15분 만료 재설정 토큰을 발급합니다. */
export async function verifyRecoveryAnswer(
  input: VerifyRecoveryAnswerRequestDto,
): Promise<RecoveryVerificationResultDto> {
  const user = await findRecoveryUserByEmail(input.email);
  const challenge = user?.passwordRecoveryChallenge;
  const isValid = challenge
    ? await verifyPassword(input.recoveryAnswer, challenge.answerHash)
    : false;
  if (
    !user?.passwordHash ||
    user.name !== input.name ||
    user.role !== input.role ||
    !isValid
  ) {
    throw new UnauthorizedError(
      "입력한 정보 또는 복구 답변이 올바르지 않습니다.",
      "INVALID_RECOVERY_ANSWER",
    );
  }
  return {
    resetToken: createPasswordResetToken(user.id, user.role, user.passwordHash),
  };
}

/** 링크의 서명·만료·현재 password hash를 확인한 뒤 조건부로 새 hash를 저장합니다. */
export async function confirmPasswordReset(
  input: ConfirmPasswordResetRequestDto,
): Promise<void> {
  const payload = verifyPasswordResetToken(input.token);
  const user = await findUserById(payload.userId);
  if (
    !user?.passwordHash ||
    user.role !== payload.role ||
    !matchesCredentialVersion(user.passwordHash, payload.credentialVersion)
  ) {
    throw new BadRequestError(
      "비밀번호 재설정 인증이 만료되었거나 올바르지 않습니다.",
      "PASSWORD_RESET_TOKEN_INVALID",
    );
  }
  const nextPasswordHash = await hashPassword(input.newPassword);
  const result = await updateEmailUserPassword(
    user.id,
    user.passwordHash,
    nextPasswordHash,
  );
  if (result.count !== 1) {
    throw new BadRequestError(
      "비밀번호 재설정 인증이 이미 사용되었습니다.",
      "PASSWORD_RESET_TOKEN_INVALID",
    );
  }
}

/** 인증된 ID를 DB에서 다시 조회해 삭제된 사용자와 최신 profile 등록 상태를 확인합니다. */
export async function getCurrentUser(userId: string): Promise<AuthUserDto> {
  const user = await findUserById(userId);

  if (!user) {
    throw new UnauthorizedError("사용자 정보를 확인할 수 없습니다.", "USER_NOT_FOUND");
  }

  return toAuthUserDto(user);
}

/** Refresh Token을 검증하고 현재 사용자 기준으로 Access/Refresh Token을 모두 회전합니다. */
export async function refreshAuth(refreshToken: string): Promise<AuthResult> {
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
    } catch (error: unknown) {
      if (!(error instanceof UnauthorizedError)) throw error;
    }
  }

  if (refreshToken) {
    try {
      const refreshed = await refreshAuth(refreshToken);

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

/**
 * 최신 User 인증 수단으로 본인을 재확인하고 Restrict 관계와 User를 한 transaction에서 삭제합니다.
 * @param userId Access Token으로 검증된 요청 사용자 ID
 * @param input 이메일 계정의 현재 비밀번호 또는 OAuth 계정의 빈 요청
 * @returns 삭제 완료 후 반환값이 없는 Promise
 * @throws 이메일 계정 비밀번호 누락 시 CURRENT_PASSWORD_REQUIRED, 불일치 시 INVALID_CURRENT_PASSWORD
 * @remarks Customer/Mover cascade 데이터와 알림이 삭제되고 transaction 성공 후 소유한 로컬 프로필 이미지도 정리합니다.
 */
export async function withdrawAccount(
  userId: string,
  input: WithdrawAccountRequestDto,
): Promise<void> {
  const deletedProfileImages = await runAuthTransaction(async (transaction) => {
    const user = await findUserForWithdrawal(transaction, userId);

    // 서명된 이전 토큰으로 동시에 재요청한 경우 이미 달성된 삭제를 멱등 성공으로 처리합니다.
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

    // RequestRejection만 Cascade가 아니므로 먼저 지우며 이후 실패하면 transaction 전체가 rollback됩니다.
    await deleteRestrictedWithdrawalRelations(transaction, user);
    const deletion = await deleteUserWithAuthState(transaction, user);

    if (deletion.count === 0) {
      const latestUser = await findUserForWithdrawal(transaction, userId);

      if (!latestUser) return null;

      if (user.passwordHash) {
        throw new UnauthorizedError(
          "현재 비밀번호가 올바르지 않습니다.",
          "INVALID_CURRENT_PASSWORD",
        );
      }

      throw new ConflictError(
        "계정 정보가 변경되었습니다. 다시 시도해 주세요.",
        "ACCOUNT_STATE_CHANGED",
      );
    }

    return {
      customer: user.customer?.profileImageUrl ?? null,
      mover: user.mover?.profileImageUrl ?? null,
    };
  });

  if (!deletedProfileImages) return;

  // DB 삭제는 확정됐으므로 파일 정리 실패가 탈퇴 성공을 되돌리지는 않습니다.
  await Promise.all([
    removeReplacedLocalProfileImage(deletedProfileImages.customer),
    removeReplacedMoverProfileImage(deletedProfileImages.mover),
  ]);
}
