/**
 * 이메일 회원가입·로그인·현재 사용자 조회·토큰 발급·회전 규칙을 처리합니다.
 * HTTP 객체와 cookie는 다루지 않고, 민감정보를 제거한 DTO와 토큰만 Controller에 반환합니다.
 */
import { ConflictError, UnauthorizedError } from "../../common/errors/app-error";
import { createAuthTokens, verifyToken } from "../../common/utils/auth-token";
import type {
  AuthResult,
  AuthUserDto,
  LoginRequestDto,
  SignUpRequestDto,
} from "./auth.dto";
import { toAuthUserDto } from "./auth.mapper";
import {
  createEmailUser,
  findUserByEmail,
  findUserById,
  findUserByPhone,
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
