/**
 * 팀의 도메인 Router가 인증·역할·프로필 검사를 같은 순서로 재사용하도록 조합합니다.
 * Resource 소유권과 비즈니스 상태 검사는 각 Service가 별도로 수행해야 합니다.
 */
import type { RequestHandler } from "express";

import { authenticate } from "./authenticate";
import { authorize } from "./authorize";
import { requireProfile } from "./require-profile";

/** 로그인만 필요한 CUSTOMER/MOVER 공통 endpoint용 조합입니다. */
export const requireAuthenticated = [authenticate] satisfies RequestHandler[];

/** CUSTOMER 프로필 생성처럼 로그인과 역할만 필요한 endpoint용 조합입니다. */
export const requireCustomer = [
  authenticate,
  authorize("CUSTOMER"),
] satisfies RequestHandler[];

/** MOVER 프로필 생성처럼 로그인과 역할만 필요한 endpoint용 조합입니다. */
export const requireMover = [
  authenticate,
  authorize("MOVER"),
] satisfies RequestHandler[];

/** 등록 완료한 CUSTOMER만 사용하는 개인 기능 endpoint용 조합입니다. */
export const requireProfiledCustomer = [
  ...requireCustomer,
  requireProfile,
] satisfies RequestHandler[];

/** 등록 완료한 MOVER만 사용하는 개인 기능 endpoint용 조합입니다. */
export const requireProfiledMover = [
  ...requireMover,
  requireProfile,
] satisfies RequestHandler[];

/** CUSTOMER와 MOVER가 함께 쓰되 각 역할의 profile 등록이 필요한 알림 endpoint용 조합입니다. */
export const requireProfiledUser = [
  authenticate,
  requireProfile,
] satisfies RequestHandler[];
