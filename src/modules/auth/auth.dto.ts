/**
 * 이메일 인증 API의 입력과 외부 응답 DTO를 정의합니다.
 * passwordHash와 토큰 원문 같은 내부 인증 정보는 응답 DTO에 포함하지 않습니다.
 */
import type { UserRole } from "../../generated/prisma/enums";
import type { AuthTokens } from "../../common/utils/auth-token";

/** POST /auth/signup에서 Validator 검증 후 Service에 전달하는 요청 DTO입니다. */
export interface SignUpRequestDto {
  /** 1~50자의 표시 이름입니다. */
  name: string;
  /** 소문자로 정규화된 고유 이메일이며 최대 255자입니다. */
  email: string;
  /** 하이픈을 제거한 대한민국 휴대전화 번호입니다. */
  phone: string;
  /** 8자 이상·bcrypt 허용 범위 이내의 평문이며 응답과 로그에 포함하지 않습니다. */
  password: string;
  /** 가입할 계정 유형이며 CUSTOMER 또는 MOVER입니다. */
  role: UserRole;
}

/** POST /auth/login에서 Validator 검증 후 Service에 전달하는 요청 DTO입니다. */
export interface LoginRequestDto {
  /** 소문자로 정규화된 이메일입니다. */
  email: string;
  /** 자격 증명 확인에만 사용하며 응답과 로그에 포함하지 않습니다. */
  password: string;
  /** 로그인 화면에서 선택한 계정 유형입니다. */
  role: UserRole;
}

/** Auth API가 외부에 공개하는 사용자 정보이며 내부 hash와 token은 포함하지 않습니다. */
export interface AuthUserDto {
  /** User UUID입니다. */
  id: string;
  /** 화면에 표시할 사용자 이름입니다. */
  name: string;
  /** null이 될 수 없는 로그인 이메일입니다. */
  email: string;
  /** OAuth 계정에서는 null일 수 있는 휴대전화 번호입니다. */
  phone: string | null;
  /** 사용자 계정 유형입니다. */
  role: UserRole;
  /** 역할에 해당하는 Customer 또는 Mover relation의 존재 여부입니다. */
  profileCompleted: boolean;
}

/** Controller가 공개 사용자 응답과 HttpOnly cookie 설정을 분리하기 위한 내부 인증 결과입니다. */
export interface AuthResult {
  /** 응답 body의 data.user로 반환할 공개 사용자입니다. */
  user: AuthUserDto;
  /** Controller가 cookie로만 전달하며 JSON에 포함하지 않는 Access/Refresh Token입니다. */
  tokens: AuthTokens;
}
