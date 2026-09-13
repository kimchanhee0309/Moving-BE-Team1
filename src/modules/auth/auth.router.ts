/**
 * `/auth` 이메일 인증 endpoint와 적용 미들웨어 순서를 선언합니다.
 * OAuth endpoint는 공급자 콘솔과 State 정책이 확정되는 후속 작업에서 추가합니다.
 */
import { Router } from "express";

import { authenticate } from "../../common/middleware/authenticate";
import {
  loginController,
  logoutController,
  meController,
  refreshController,
  signUpController,
} from "./auth.controller";

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
 *         data: { $ref: "#/components/schemas/AuthUser" }
 *     EmptySuccessResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data: { nullable: true, example: null }
 */

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Sign Up With Email
 *     description: 이메일 계정을 만들며 역할별 profile은 생성하지 않습니다.
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
 */
authRouter.post("/signup", signUpController);

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
 */
authRouter.post("/login", loginController);

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
 *     description: Refresh Token 검증 후 Access/Refresh Token을 모두 회전합니다.
 *     security: [{ refreshTokenCookie: [] }]
 *     responses:
 *       200:
 *         description: 토큰 갱신 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/EmptySuccessResponse" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 */
authRouter.post("/refresh", refreshController);

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
