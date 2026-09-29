/**
 * `/auth` 이메일·OAuth 인증 endpoint와 적용 미들웨어 순서를 선언합니다.
 * 입력 검증과 요청 제한을 Controller보다 먼저 적용하고 인증 쿠키 처리는 Controller에 위임합니다.
 */
import { Router } from "express";

import { authenticate } from "../../common/middleware/auth/authenticate";
import {
  accountRecoveryRateLimiter,
  loginRateLimiter,
  oauthCallbackRateLimiter,
  oauthStartRateLimiter,
  recoveryAnswerRateLimiter,
  refreshRateLimiter,
  signUpRateLimiter,
} from "./auth-rate-limit";
import {
  confirmPasswordResetController,
  findAccountController,
  loginController,
  logoutController,
  meController,
  optionalSessionController,
  recoveryQuestionController,
  refreshController,
  signUpController,
  verifyRecoveryAnswerController,
  withdrawAccountController,
} from "./auth.controller";
import {
  oauthCallbackController,
  oauthStartController,
} from "./oauth/oauth.controller";

export const authRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     AuthUser:
 *       type: object
 *       required: [id, name, email, phone, role, profileCompleted]
 *       properties:
 *         id: { type: string, format: uuid }
 *         name: { type: string, example: "홍길동" }
 *         email: { type: string, format: email, example: "user@example.com" }
 *         phone: { type: string, nullable: true, example: "01012345678" }
 *         role: { $ref: "#/components/schemas/UserRole" }
 *         profileCompleted: { type: boolean, example: false }
 *     SignUpRequest:
 *       type: object
 *       required: [name, email, phone, password, role, recoveryQuestion, recoveryAnswer]
 *       properties:
 *         name: { type: string, minLength: 1, maxLength: 50, pattern: "^[가-힣A-Za-z]+(?:[ '·-][가-힣A-Za-z]+)*$", description: "완성형 한글 또는 영문 이름. 단어 사이 공백·하이픈·아포스트로피·가운뎃점 허용", example: "홍길동" }
 *         email: { type: string, format: email, example: "user@example.com" }
 *         phone: { type: string, example: "01012345678" }
 *         password: { type: string, format: password, minLength: 8, example: "Password1!" }
 *         role: { $ref: "#/components/schemas/UserRole" }
 *         recoveryQuestion: { type: string, enum: [CHILDHOOD_NICKNAME, MEMORABLE_PLACE, PERSONAL_PHRASE] }
 *         recoveryAnswer: { type: string, minLength: 2, maxLength: 100, description: "복구 답변은 정규화 후 bcrypt hash로만 저장" }
 *     LoginRequest:
 *       type: object
 *       required: [email, password, role]
 *       properties:
 *         email: { type: string, format: email, example: "user@example.com" }
 *         password: { type: string, format: password, example: "Password1!" }
 *         role: { $ref: "#/components/schemas/UserRole" }
 *     RecoveryAnswerVerifyRequest:
 *       allOf:
 *         - { $ref: "#/components/schemas/AccountRecoveryRequest" }
 *         - type: object
 *           required: [recoveryAnswer]
 *           properties:
 *             recoveryAnswer: { type: string, minLength: 2, maxLength: 100 }
 *     AccountRecoveryRequest:
 *       type: object
 *       additionalProperties: false
 *       required: [name, email, role]
 *       properties:
 *         name: { type: string, example: "홍길동" }
 *         email: { type: string, format: email, example: "user@example.com" }
 *         role: { $ref: "#/components/schemas/UserRole" }
 *     PasswordResetConfirmRequest:
 *       type: object
 *       additionalProperties: false
 *       required: [token, newPassword]
 *       properties:
 *         token: { type: string, description: "복구 답변 검증 후 발급된 15분 만료 토큰" }
 *         newPassword: { type: string, format: password, minLength: 8, example: "NextPassword1!" }
 *     WithdrawAccountRequest:
 *       type: object
 *       additionalProperties: false
 *       properties:
 *         currentPassword:
 *           type: string
 *           format: password
 *           description: 이메일·비밀번호 계정은 필수이며 OAuth 계정은 생략합니다.
 *     AuthUserResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [user]
 *           properties:
 *             user: { $ref: "#/components/schemas/AuthUser" }
 *     EmptySuccessResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data: { nullable: true, example: null }
 *     OptionalAuthSessionResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [user]
 *           properties:
 *             user:
 *               nullable: true
 *               allOf:
 *                 - { $ref: "#/components/schemas/AuthUser" }
 *     OAuthStartResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [url]
 *           properties:
 *             url: { type: string, format: uri, description: "공급자 인증 화면 URL" }
 */

/**
 * @openapi
 * /auth/oauth/{provider}:
 *   get:
 *     tags: [Auth]
 *     summary: Start OAuth Login
 *     description: 역할을 검증하고 10분 만료 State 쿠키를 만든 뒤 공급자 인증을 시작합니다.
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema: { type: string, enum: [google, kakao, naver] }
 *       - in: query
 *         name: role
 *         required: true
 *         schema: { $ref: "#/components/schemas/UserRole" }
 *       - in: query
 *         name: redirect
 *         schema: { type: string, example: "/move-request" }
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json] }
 *         description: json이면 URL을 공통 응답으로 반환하며 생략하면 공급자로 302 이동합니다.
 *     responses:
 *       200:
 *         description: 공급자 인증 URL 반환
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/OAuthStartResponse" }
 *       302: { description: 공급자 인증 화면으로 이동 }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 *       503: { $ref: "#/components/responses/ServiceUnavailable" }
 */
authRouter.get("/oauth/:provider", oauthStartRateLimiter, oauthStartController);

/**
 * @openapi
 * /auth/oauth/{provider}/callback:
 *   get:
 *     tags: [Auth]
 *     summary: Complete OAuth Login
 *     description: State와 code를 검증하고 서비스 JWT 쿠키를 발급한 뒤 프론트 /auth/callback으로 이동합니다.
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema: { type: string, enum: [google, kakao, naver] }
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *       - in: query
 *         name: error
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: 성공 또는 제한된 오류 코드와 함께 프론트 callback으로 이동
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 */
authRouter.get(
  "/oauth/:provider/callback",
  oauthCallbackRateLimiter,
  oauthCallbackController,
);

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Sign Up With Email
 *     description: 이메일 계정을 만들고 인증 쿠키를 발급하며 역할별 profile은 생성하지 않습니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/SignUpRequest" }
 *     responses:
 *       201:
 *         description: 회원가입 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/AuthUserResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 */
authRouter.post("/signup", signUpRateLimiter, signUpController);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log In With Email
 *     description: 로그인 후 Access/Refresh Token을 HttpOnly 쿠키로 발급합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/LoginRequest" }
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/AuthUserResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 */
authRouter.post("/login", loginRateLimiter, loginController);

/**
 * @openapi
 * /auth/recovery/account:
 *   post:
 *     tags: [Auth]
 *     summary: Find Login Account
 *     description: 이름·이메일·역할이 정확히 일치하면 로그인 ID와 이메일/SNS 계정 방식을 반환합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/AccountRecoveryRequest" }
 *     responses:
 *       200: { description: 계정 일치 결과 }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 */
authRouter.post(
  "/recovery/account",
  accountRecoveryRateLimiter,
  findAccountController,
);

/**
 * @openapi
 * /auth/recovery/question:
 *   post:
 *     tags: [Auth]
 *     summary: Get Password Recovery Question
 *     description: 이름·이메일·역할이 일치하는 이메일 계정의 복구 질문을 반환합니다. OAuth 계정은 SNS 로그인을 안내합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/AccountRecoveryRequest" }
 *     responses:
 *       200: { description: 복구 질문 조회 결과 }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 */
authRouter.post(
  "/recovery/question",
  accountRecoveryRateLimiter,
  recoveryQuestionController,
);

/**
 * @openapi
 * /auth/recovery/question/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify Password Recovery Answer
 *     description: 복구 답변 hash를 확인하고 성공하면 15분 만료 비밀번호 재설정 토큰을 반환합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/RecoveryAnswerVerifyRequest" }
 *     responses:
 *       200: { description: 복구 답변 확인 및 재설정 토큰 발급 }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 *       503: { $ref: "#/components/responses/ServiceUnavailable" }
 */
authRouter.post(
  "/recovery/question/verify",
  recoveryAnswerRateLimiter,
  verifyRecoveryAnswerController,
);

/**
 * @openapi
 * /auth/recovery/password/confirm:
 *   post:
 *     tags: [Auth]
 *     summary: Confirm Password Reset
 *     description: 단기 재설정 토큰과 새 비밀번호를 검증해 이메일 계정 비밀번호를 교체합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/PasswordResetConfirmRequest" }
 *     responses:
 *       200:
 *         description: 비밀번호 재설정 완료
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/EmptySuccessResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 */
authRouter.post(
  "/recovery/password/confirm",
  accountRecoveryRateLimiter,
  confirmPasswordResetController,
);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get Current User
 *     security: [{ accessTokenCookie: [] }]
 *     responses:
 *       200:
 *         description: 현재 사용자 조회 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/AuthUserResponse" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
authRouter.get("/me", authenticate, meController);

/**
 * @openapi
 * /auth/me:
 *   delete:
 *     tags: [Auth]
 *     summary: Withdraw Current Account
 *     description: 이메일 계정은 현재 비밀번호를 다시 확인하고 OAuth 계정은 현재 세션으로 본인 계정과 연관 데이터를 삭제합니다.
 *     security: [{ accessTokenCookie: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/WithdrawAccountRequest" }
 *     responses:
 *       200:
 *         description: 탈퇴 및 인증 쿠키 삭제 완료
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/EmptySuccessResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
authRouter.delete("/me", authenticate, withdrawAccountController);

/**
 * @openapi
 * /auth/refresh/session:
 *   post:
 *     tags: [Auth]
 *     summary: Restore Optional Browser Session
 *     description: 공개 페이지용 세션 확인입니다. 비회원은 user null로 성공하고, Access가 없거나 만료됐지만 Refresh가 유효하면 두 토큰을 회전합니다. Refresh 쿠키 Path는 넓히지 않습니다.
 *     responses:
 *       200:
 *         description: 로그인 사용자 또는 정상 비회원 상태
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/OptionalAuthSessionResponse" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 */
authRouter.post(
  "/refresh/session",
  refreshRateLimiter,
  optionalSessionController,
);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh Auth Tokens
 *     description: Refresh Token 검증 후 Access/Refresh Token을 모두 회전하고 최신 사용자를 반환합니다.
 *     security: [{ refreshTokenCookie: [] }]
 *     responses:
 *       200:
 *         description: 토큰 갱신 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/AuthUserResponse" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 */
authRouter.post("/refresh", refreshRateLimiter, refreshController);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log Out
 *     description: 인증 상태와 관계없이 브라우저의 Access/Refresh 쿠키를 만료시킵니다.
 *     responses:
 *       200:
 *         description: 로그아웃 처리 완료
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/EmptySuccessResponse" }
 */
authRouter.post("/logout", logoutController);
