/**
 * OAuth 시작·callback과 공급자 사용자 정보의 내부 DTO를 정의합니다.
 * 공급자 Access Token 및 원문 응답은 DTO와 DB에 포함하지 않습니다.
 */
import type { SocialProvider, UserRole } from "../../../generated/prisma/enums";

/** URL 경로에서 사용하는 소문자 공급자 식별자입니다. */
export type OAuthProvider = "google" | "kakao" | "naver";

/** OAuth 시작 화면에서 검증한 역할과 선택 redirect입니다. */
export interface OAuthStartInput {
  provider: OAuthProvider;
  role: UserRole;
  redirect?: string;
  responseFormat: "json" | "redirect";
}

/** 공급자 callback query에서 허용하는 최소 필드입니다. */
export interface OAuthCallbackInput {
  provider: OAuthProvider;
  code?: string;
  state?: string;
  providerError?: string;
}

/** 공급자별 응답을 정규화한 뒤 Service에 전달하는 최소 사용자 정보입니다. */
export interface OAuthProfile {
  provider: SocialProvider;
  socialId: string;
  /** 기존 소셜 계정 로그인에는 불필요하지만 신규 User 생성에는 필수입니다. */
  email?: string;
  name: string;
}

/** 서명된 State 쿠키가 보존하는 OAuth 요청 문맥입니다. */
export interface OAuthStateContext {
  provider: OAuthProvider;
  role: UserRole;
  nonce: string;
  expiresAt: number;
  redirect?: string;
}
