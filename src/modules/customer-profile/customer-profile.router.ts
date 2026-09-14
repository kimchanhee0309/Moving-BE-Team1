/**
 * `/customers/me/profile`의 Method, 공통 Auth guard, multer와 Controller 순서를 선언합니다.
 * 인증 cookie 해석과 비즈니스 규칙은 각각 공통 middleware와 Service에 위임합니다.
 */
import { Router } from "express";

import {
  requireCustomer,
  requireProfiledCustomer,
} from "../../common/middleware/auth-guards";
import {
  createCustomerProfileController,
  getCustomerProfileController,
  updateCustomerProfileController,
} from "./customer-profile.controller";
import { uploadCustomerProfileImage } from "./customer-profile.image";

/** Customer Profile endpoint를 상위 `/customers` 경로에 연결할 Router입니다. */
export const customerProfileRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     CustomerProfile:
 *       type: object
 *       required: [id, name, email, phone, profileImageUrl, serviceTypes, region, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, format: uuid }
 *         name: { type: string, maxLength: 50, example: "홍길동" }
 *         email: { type: string, format: email, example: "customer@example.com" }
 *         phone: { type: string, nullable: true, example: "01012345678" }
 *         profileImageUrl: { type: string, nullable: true, example: "/uploads/customer-profiles/example.jpg" }
 *         serviceTypes:
 *           type: array
 *           minItems: 1
 *           uniqueItems: true
 *           items: { type: string, enum: [SMALL, HOME, OFFICE] }
 *         region:
 *           type: string
 *           enum: [서울, 경기, 인천, 강원, 충북, 충남, 세종, 대전, 전북, 전남, 광주, 경북, 경남, 대구, 울산, 부산, 제주]
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     CustomerProfileResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [profile]
 *           properties:
 *             profile: { $ref: "#/components/schemas/CustomerProfile" }
 */

/**
 * @openapi
 * /customers/me/profile:
 *   post:
 *     tags: [Customers]
 *     summary: Create Customer Profile
 *     description: CUSTOMER 계정의 최초 profile을 생성합니다. name, email, phone은 인증 User 값을 사용합니다.
 *     security: [{ accessTokenCookie: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [serviceTypes, region]
 *             properties:
 *               profileImage: { type: string, format: binary, description: "선택, JPEG/PNG/WebP, 최대 5 MiB" }
 *               serviceTypes:
 *                 type: array
 *                 minItems: 1
 *                 uniqueItems: true
 *                 items: { type: string, enum: [SMALL, HOME, OFFICE] }
 *               region:
 *                 type: string
 *                 enum: [서울, 경기, 인천, 강원, 충북, 충남, 세종, 대전, 전북, 전남, 광주, 경북, 경남, 대구, 울산, 부산, 제주]
 *     responses:
 *       201:
 *         description: 일반 유저 프로필 등록 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/CustomerProfileResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *   get:
 *     tags: [Customers]
 *     summary: Get Customer Profile
 *     security: [{ accessTokenCookie: [] }]
 *     responses:
 *       200:
 *         description: 현재 일반 유저 프로필 조회 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/CustomerProfileResponse" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *   patch:
 *     tags: [Customers]
 *     summary: Update Customer Profile
 *     description: 전달한 필드만 수정합니다. phone 생략은 유지, 빈 문자열은 null 초기화입니다. OAuth 전용 계정은 비밀번호를 변경할 수 없습니다.
 *     security: [{ accessTokenCookie: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 50 }
 *               email: { type: string, format: email }
 *               phone: { type: string, nullable: true, description: "빈 문자열이면 null로 초기화" }
 *               currentPassword: { type: string, format: password, description: "newPassword와 함께 전송" }
 *               newPassword: { type: string, format: password, minLength: 8, description: "영문·숫자·특수문자 포함, 8~72바이트" }
 *               profileImage: { type: string, format: binary, description: "JPEG/PNG/WebP, 최대 5 MiB" }
 *               serviceTypes:
 *                 type: array
 *                 minItems: 1
 *                 uniqueItems: true
 *                 items: { type: string, enum: [SMALL, HOME, OFFICE] }
 *               region:
 *                 type: string
 *                 enum: [서울, 경기, 인천, 강원, 충북, 충남, 세종, 대전, 전북, 전남, 광주, 경북, 경남, 대구, 울산, 부산, 제주]
 *     responses:
 *       200:
 *         description: 일반 유저 프로필 수정 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/CustomerProfileResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
customerProfileRouter.post(
  "/me/profile",
  ...requireCustomer,
  uploadCustomerProfileImage,
  createCustomerProfileController,
);
customerProfileRouter.get(
  "/me/profile",
  ...requireProfiledCustomer,
  getCustomerProfileController,
);
customerProfileRouter.patch(
  "/me/profile",
  ...requireProfiledCustomer,
  uploadCustomerProfileImage,
  updateCustomerProfileController,
);
