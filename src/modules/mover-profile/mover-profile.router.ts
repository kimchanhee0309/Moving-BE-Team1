/**
 * `/movers/me/profile`의 Method, Auth guard, 이미지 업로드와 Controller 순서를 선언합니다.
 * Cookie·JWT 해석과 비즈니스 규칙은 공통 middleware와 Service에 위임합니다.
 */
import { Router } from "express";

import {
  requireMover,
  requireProfiledMover,
} from "../../common/middleware/auth/auth-guards";
import {
  createMoverProfileController,
  getMoverProfileController,
  updateMoverProfileController,
} from "./mover-profile.controller";
import { uploadMoverProfileImage } from "./mover-profile.image";

/** Mover Profile endpoint를 상위 `/movers` 경로에 연결할 Router입니다. */
export const moverProfileRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MoverProfile:
 *       type: object
 *       required: [id, profileImageUrl, nickname, careerYears, shortIntroduction, description, serviceTypes, regions, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, format: uuid }
 *         profileImageUrl: { type: string, nullable: true, example: "/uploads/mover-profiles/example.jpg" }
 *         nickname: { type: string, minLength: 1, maxLength: 50, example: "김코드" }
 *         careerYears: { type: integer, minimum: 0, maximum: 50, example: 8 }
 *         shortIntroduction: { type: string, minLength: 1, maxLength: 255, example: "꼼꼼하고 안전한 이사를 도와드립니다." }
 *         description: { type: string, minLength: 1, maxLength: 1000 }
 *         serviceTypes:
 *           type: array
 *           minItems: 1
 *           uniqueItems: true
 *           items: { type: string, enum: [SMALL, HOME, OFFICE] }
 *         regions:
 *           type: array
 *           minItems: 1
 *           uniqueItems: true
 *           items:
 *             type: string
 *             enum: [서울, 경기, 인천, 강원, 충북, 충남, 세종, 대전, 전북, 전남, 광주, 경북, 경남, 대구, 울산, 부산, 제주]
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     MoverProfileResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [profile]
 *           properties:
 *             profile: { $ref: "#/components/schemas/MoverProfile" }
 */

/**
 * @openapi
 * /movers/me/profile:
 *   post:
 *     tags: [Movers]
 *     summary: Create Mover Profile
 *     description: MOVER 계정의 최초 profile을 생성합니다. User 기본정보는 인증 계정 값을 유지합니다.
 *     security: [{ accessTokenCookie: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [nickname, careerYears, shortIntroduction, description, serviceTypes, regions]
 *             properties:
 *               profileImage: { type: string, format: binary, description: "선택, JPEG/PNG/WebP, 최대 5 MiB" }
 *               nickname: { type: string, minLength: 1, maxLength: 50 }
 *               careerYears: { type: integer, minimum: 0, maximum: 50 }
 *               shortIntroduction: { type: string, minLength: 1, maxLength: 255 }
 *               description: { type: string, minLength: 1, maxLength: 1000 }
 *               serviceTypes:
 *                 type: array
 *                 minItems: 1
 *                 uniqueItems: true
 *                 items: { type: string, enum: [SMALL, HOME, OFFICE] }
 *               regions:
 *                 type: array
 *                 minItems: 1
 *                 uniqueItems: true
 *                 items:
 *                   type: string
 *                   enum: [서울, 경기, 인천, 강원, 충북, 충남, 세종, 대전, 전북, 전남, 광주, 경북, 경남, 대구, 울산, 부산, 제주]
 *     responses:
 *       201:
 *         description: 기사님 프로필 등록 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/MoverProfileResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *   get:
 *     tags: [Movers]
 *     summary: Get Mover Profile
 *     security: [{ accessTokenCookie: [] }]
 *     responses:
 *       200:
 *         description: 현재 기사님 프로필 조회 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/MoverProfileResponse" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *   patch:
 *     tags: [Movers]
 *     summary: Update Mover Profile
 *     description: 전달한 Mover profile 필드만 수정하며 User 기본정보는 변경하지 않습니다.
 *     security: [{ accessTokenCookie: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               profileImage: { type: string, format: binary, description: "JPEG/PNG/WebP, 최대 5 MiB" }
 *               nickname: { type: string, minLength: 1, maxLength: 50 }
 *               careerYears: { type: integer, minimum: 0, maximum: 50 }
 *               shortIntroduction: { type: string, minLength: 1, maxLength: 255 }
 *               description: { type: string, minLength: 1, maxLength: 1000 }
 *               serviceTypes:
 *                 type: array
 *                 minItems: 1
 *                 uniqueItems: true
 *                 items: { type: string, enum: [SMALL, HOME, OFFICE] }
 *               regions:
 *                 type: array
 *                 minItems: 1
 *                 uniqueItems: true
 *                 items:
 *                   type: string
 *                   enum: [서울, 경기, 인천, 강원, 충북, 충남, 세종, 대전, 전북, 전남, 광주, 경북, 경남, 대구, 울산, 부산, 제주]
 *     responses:
 *       200:
 *         description: 기사님 프로필 수정 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/MoverProfileResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
moverProfileRouter.post(
  "/me/profile",
  ...requireMover,
  uploadMoverProfileImage,
  createMoverProfileController,
);
moverProfileRouter.get(
  "/me/profile",
  ...requireProfiledMover,
  getMoverProfileController,
);
moverProfileRouter.patch(
  "/me/profile",
  ...requireProfiledMover,
  uploadMoverProfileImage,
  updateMoverProfileController,
);
