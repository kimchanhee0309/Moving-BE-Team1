/**
 * 이메일 인증 API의 입력과 외부 응답 DTO를 정의합니다.
 * passwordHash와 토큰 원문 같은 내부 인증 정보는 응답 DTO에 포함하지 않습니다.
 */
import type { UserRole } from "../../generated/prisma/enums";
import type { AuthTokens } from "../../common/utils/auth-token";

export interface SignUpInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
  role: UserRole;
}

export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  profileCompleted: boolean;
}

export interface AuthResult {
  user: AuthUserDto;
  tokens: AuthTokens;
}
