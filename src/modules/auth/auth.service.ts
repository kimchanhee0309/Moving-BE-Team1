/**
 * 이메일 회원가입·로그인·현재 사용자 조회·토큰 회전 규칙을 처리합니다.
 * HTTP 객체와 cookie는 다루지 않고, 민감정보를 제거한 DTO와 토큰만 Controller에 반환합니다.
 */
import { ConflictError, UnauthorizedError } from "../../common/errors/app-error";
import { createAuthTokens, verifyToken } from "../../common/utils/auth-token";
import type { AuthResult, AuthUserDto, LoginInput, SignUpInput } from "./auth.dto";
import {
  createEmailUser,
  findUserByEmail,
  findUserById,
  findUserByPhone,
  type AuthUserRecord,
} from "./auth.repository";
import { hashPassword, verifyPassword } from "./password";

function toAuthUserDto(user: AuthUserRecord): AuthUserDto {
  const profileCompleted =
    user.role === "CUSTOMER" ? user.customer !== null : user.mover !== null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    profileCompleted,
  };
}

/** 이메일·전화번호 중복을 확인하고 bcrypt hash만 저장한 계정을 생성합니다. */
export async function signUp(input: SignUpInput): Promise<AuthUserDto> {
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

  return toAuthUserDto(user);
}

/** 계정 존재·비밀번호·역할 실패를 하나의 오류로 처리하고 인증 토큰을 발급합니다. */
export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await findUserByEmail(input.email);
  const isPasswordValid =
    user?.passwordHash !== null && user?.passwordHash !== undefined
      ? await verifyPassword(input.password, user.passwordHash)
      : false;

  // 계정 존재 여부를 추측하지 못하도록 모든 자격 증명 실패를 같은 오류로 반환합니다.
  if (!user || !isPasswordValid || user.role !== input.role) {
    throw new UnauthorizedError(
      "이메일 또는 비밀번호가 올바르지 않습니다.",
      "INVALID_CREDENTIALS",
    );
  }

  return {
    user: toAuthUserDto(user),
    tokens: createAuthTokens(user.id, user.role),
  };
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
