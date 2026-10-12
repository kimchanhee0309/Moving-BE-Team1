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
  passwordResetCodeSendRateLimiter,
  passwordResetCodeVerifyRateLimiter,
  refreshRateLimiter,
  sessionRefreshRateLimiter,
  signUpRateLimiter,
  signupEmailCodeSendRateLimiter,
  signupEmailCodeVerifyRateLimiter,
} from "./auth-rate-limit";
import {
  confirmPasswordResetController,
  loginController,
  logoutController,
  meController,
  optionalSessionController,
  refreshController,
  requestPasswordResetCodeController,
  requestSignupEmailCodeController,
  signUpController,
  verifyPasswordResetCodeController,
  verifySignupEmailCodeController,
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
 *       required: [name, email, phone, password, role]
 *       properties:
 *         name: { type: string, minLength: 1, maxLength: 50, pattern: "^[가-힣A-Za-z]+(?:[ '·-][가-힣A-Za-z]+)*$", description: "완성형 한글 또는 영문 이름. 단어 사이 공백·하이픈·아포스트로피·가운뎃점 허용", example: "홍길동" }
 *         email: { type: string, format: email, example: "user@example.com" }
 *         phone: { type: string, example: "01012345678" }
 *         password: { type: string, format: password, minLength: 8, example: "Password1!" }
 *         role: { $ref: "#/components/schemas/UserRole" }
 *         emailVerificationToken: { type: string, maxLength: 4096, description: "POST /auth/signup/email-code/verify가 반환한 15분 만료 일회성 토큰. 호환 기간에는 선택이며 SIGNUP_EMAIL_VERIFICATION_REQUIRED=true 전환 뒤 필수" }
 *         recoveryQuestion: { deprecated: true, description: "구버전 FE 호환용 필드. 배포 전환 기간에만 받으며 값은 검증·저장하지 않고 무시" }
 *         recoveryAnswer: { deprecated: true, description: "구버전 FE 호환용 필드. 배포 전환 기간에만 받으며 값은 검증·저장하지 않고 무시" }
 *     SignupEmailCodeRequest:
 *       type: object
 *       additionalProperties: false
 *       required: [email]
 *       properties:
 *         email: { type: string, format: email, maxLength: 255, example: "user@example.com" }
 *     SignupEmailCodeResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [expiresInSeconds, resendAfterSeconds]
 *           properties:
 *             expiresInSeconds: { type: integer, example: 300, description: "인증코드 유효 시간(초)" }
 *             resendAfterSeconds: { type: integer, example: 60, description: "같은 이메일로 다시 요청할 수 있을 때까지의 시간(초)" }
 *     SignupEmailCodeVerifyRequest:
 *       type: object
 *       additionalProperties: false
 *       required: [email, code]
 *       properties:
 *         email: { type: string, format: email, maxLength: 255, example: "user@example.com" }
 *         code: { type: string, pattern: "^[0-9]{6}$", example: "012345" }
 *     SignupEmailCodeVerifyResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [emailVerificationToken, expiresInSeconds]
 *           properties:
 *             emailVerificationToken: { type: string, description: "인증한 이메일에만 유효한 15분 만료 일회성 토큰" }
 *             expiresInSeconds: { type: integer, example: 900, description: "토큰 유효 시간(초)" }
 *     LoginRequest:
 *       type: object
 *       required: [email, password, role]
 *       properties:
 *         email: { type: string, format: email, example: "user@example.com" }
 *         password: { type: string, format: password, example: "Password1!" }
 *         role: { $ref: "#/components/schemas/UserRole" }
 *     PasswordResetCodeVerifyRequest:
 *       type: object
 *       additionalProperties: false
 *       required: [challengeId, code]
 *       properties:
 *         challengeId: { type: string, format: uuid }
 *         code: { type: string, pattern: "^[0-9]{6}$", example: "012345" }
 *     PasswordResetCodeVerifyResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [resetToken]
 *           properties:
 *             resetToken: { type: string, description: "15분 만료 비밀번호 재설정 토큰" }
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
 *         token: { type: string, description: "이메일 코드 검증 후 발급된 15분 만료 토큰" }
 *         newPassword: { type: string, format: password, minLength: 8, example: "NextPassword1!" }
 *         recoveryAnswer: { deprecated: true, description: "구버전 FE 호환용 필드. 배포 전환 기간에만 받으며 값은 검증·저장하지 않고 무시" }
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
 * /auth/signup/email-code:
 *   post:
 *     tags: [Auth]
 *     summary: Send Signup Email Verification Code
 *     description: 가입하려는 이메일로 6자리 인증코드를 발송합니다. 코드는 5분간 유효하고 같은 이메일은 60초 뒤 다시 요청할 수 있으며 IP별 1시간 10회로 제한합니다. 이미 가입된 이메일은 코드를 보내지 않고 EMAIL_ALREADY_EXISTS(409)로 안내합니다. 60초 내 재요청은 EMAIL_VERIFICATION_CODE_RESEND_TOO_SOON(429)입니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/SignupEmailCodeRequest" }
 *     responses:
 *       200:
 *         description: 인증코드 발송 완료
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/SignupEmailCodeResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 *       502: { $ref: "#/components/responses/BadGateway" }
 *       503: { $ref: "#/components/responses/ServiceUnavailable" }
 */
authRouter.post(
  "/signup/email-code",
  signupEmailCodeSendRateLimiter,
  requestSignupEmailCodeController,
);

/**
 * @openapi
 * /auth/signup/email-code/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify Signup Email Verification Code
 *     description: 이메일과 6자리 코드를 확인하고 성공하면 15분 만료 이메일 인증 토큰을 반환합니다. 코드 한 건당 5회, IP별 1시간 20회로 대입을 제한합니다. 불일치는 EMAIL_VERIFICATION_CODE_INVALID(401), 만료는 EMAIL_VERIFICATION_CODE_EXPIRED(400), 횟수 초과는 EMAIL_VERIFICATION_CODE_ATTEMPTS_EXCEEDED(429)입니다. 인증 쿠키는 발급하지 않습니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/SignupEmailCodeVerifyRequest" }
 *     responses:
 *       200:
 *         description: 이메일 코드 확인 및 이메일 인증 토큰 반환
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/SignupEmailCodeVerifyResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 *       503: { $ref: "#/components/responses/ServiceUnavailable" }
 */
authRouter.post(
  "/signup/email-code/verify",
  signupEmailCodeVerifyRateLimiter,
  verifySignupEmailCodeController,
);

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Sign Up With Email
 *     description: 이메일 계정을 만들고 인증 쿠키를 발급하며 역할별 profile은 생성하지 않습니다. emailVerificationToken을 보내면 서명·만료·일회성과 가입 이메일 일치를 확인하며 실패 시 EMAIL_VERIFICATION_TOKEN_INVALID 또는 EMAIL_VERIFICATION_EMAIL_MISMATCH(400)입니다. 서버 설정 SIGNUP_EMAIL_VERIFICATION_REQUIRED가 true이면 토큰이 없을 때 EMAIL_VERIFICATION_REQUIRED(400)로 거절합니다.
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
 * /auth/recovery/password/code:
 *   post:
 *     tags: [Auth]
 *     summary: Send Password Reset Code
 *     description: 이름·이메일·역할이 일치하는 일반 계정에 5분 만료 코드를 발송합니다. OAuth 계정은 SNS 로그인 안내 결과를 반환합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/AccountRecoveryRequest" }
 *     responses:
 *       200: { description: 코드 발송·OAuth·계정 불일치 결과 }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 *       502: { $ref: "#/components/responses/BadGateway" }
 *       503: { $ref: "#/components/responses/ServiceUnavailable" }
 */
authRouter.post(
  "/recovery/password/code",
  passwordResetCodeSendRateLimiter,
  requestPasswordResetCodeController,
);

/**
 * @openapi
 * /auth/recovery/password/code/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify Password Reset Code
 *     description: 6자리 코드의 HMAC·5분 만료·실패 횟수를 확인하고 성공하면 15분 만료 재설정 토큰을 반환합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/PasswordResetCodeVerifyRequest" }
 *     responses:
 *       200:
 *         description: 이메일 코드 확인 및 재설정 토큰 반환
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/PasswordResetCodeVerifyResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 *       503: { $ref: "#/components/responses/ServiceUnavailable" }
 */
authRouter.post(
  "/recovery/password/code/verify",
  passwordResetCodeVerifyRateLimiter,
  verifyPasswordResetCodeController,
);

/**
 * @openapi
 * /auth/recovery/password/confirm:
 *   post:
 *     tags: [Auth]
 *     summary: Confirm Password Reset
 *     description: 이메일 코드 확인 뒤 발급된 단기 재설정 토큰과 새 비밀번호를 검증해 비밀번호를 교체합니다. 이전에 복구 질문을 등록한 계정도 이메일 코드만 사용합니다. 만료·재사용 토큰은 PASSWORD_RESET_TOKEN_INVALID(400)입니다.
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
 *       401: { $ref: "#/components/responses/Unauthorized" }
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
 *     description: 공개 페이지용 세션 확인입니다. 비회원은 user null로 성공하고, Access가 없거나 만료됐지만 Refresh가 유효하면 두 토큰을 회전합니다. 위조·서명 오류 Access는 Refresh하지 않으며 Refresh 쿠키 Path는 넓히지 않습니다.
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
  sessionRefreshRateLimiter,
  optionalSessionController,
);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh Auth Tokens
 *     description: 유효한 Access는 재발급하지 않고 최신 사용자만 반환합니다. Access가 없거나 만료된 경우에만 Refresh Token을 원자적으로 소비해 두 토큰을 회전하며, 위조 Access와 만료·위조·재사용 Refresh는 거절합니다.
 *     security: [{ refreshTokenCookie: [] }]
 *     responses:
 *       200:
 *         description: 토큰 갱신 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/AuthUserResponse" }
 *       401:
 *         description: Access 위조 또는 Refresh 누락·만료·위조·재사용
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ErrorResponse" }
 *       429: { $ref: "#/components/responses/TooManyRequests" }
 */
authRouter.post("/refresh", refreshRateLimiter, refreshController);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log Out
 *     description: Stateless 인증 계약에 따라 브라우저의 Access/Refresh 쿠키를 만료시킵니다. 토큰이나 쿠키가 없어도 멱등 성공하며 서버 DB 세션은 사용하지 않습니다.
 *     responses:
 *       200:
 *         description: 로그아웃 처리 완료
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/EmptySuccessResponse" }
 */
authRouter.post("/logout", logoutController);
