/**
 * `/auth` 이메일·OAuth 인증 endpoint와 적용 미들웨어 순서를 선언합니다.
 * 입력 검증과 요청 제한을 Controller보다 먼저 적용하고 인증 쿠키 처리는 Controller에 위임합니다.
 */
import { Router } from "express";

import { authenticate } from "../../common/middleware/auth/authenticate";
import {
  loginRateLimiter,
  oauthCallbackRateLimiter,
  oauthStartRateLimiter,
  refreshRateLimiter,
  signUpRateLimiter,
} from "./auth-rate-limit";
import {
  loginController,
  logoutController,
  meController,
  refreshController,
  signUpController,
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
 *         name: { type: string, maxLength: 50, example: "홍길동" }
 *         email: { type: string, format: email, example: "user@example.com" }
 *         phone: { type: string, example: "01012345678" }
 *         password: { type: string, format: password, minLength: 8, example: "Password1!" }
 *         role: { $ref: "#/components/schemas/UserRole" }
 *     LoginRequest:
 *       type: object
 *       required: [email, password, role]
 *       properties:
 *         email: { type: string, format: email, example: "user@example.com" }
 *         password: { type: string, format: password, example: "Password1!" }
 *         role: { $ref: "#/components/schemas/UserRole" }
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
