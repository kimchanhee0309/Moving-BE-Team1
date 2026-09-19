/** `/movers/me`의 마이페이지 조회와 기본정보 수정 경로입니다. */
import { Router } from "express";

import { requireProfiledMover } from "../../common/middleware/auth/auth-guards";
import {
  getMoverMyPageController,
  updateMoverBasicInfoController,
} from "./mover-mypage.controller";

export const moverMyPageRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MoverRatingCount:
 *       type: object
 *       required: [score, count]
 *       properties:
 *         score: { type: integer, minimum: 1, maximum: 5, example: 5 }
 *         count: { type: integer, minimum: 0, example: 170 }
 *     MoverBasicInfo:
 *       type: object
 *       required: [name, email, phone]
 *       properties:
 *         name: { type: string, minLength: 1, maxLength: 50, pattern: "^[가-힣A-Za-z]+(?:[ '·-][가-힣A-Za-z]+)*$", description: "완성형 한글 또는 영문 이름. 단어 사이 공백·하이픈·아포스트로피·가운뎃점 허용", example: "홍길동" }
 *         email: { type: string, format: email, example: "mover@example.com" }
 *         phone: { type: string, nullable: true, example: "01012345678" }
 *     MoverMyPage:
 *       allOf:
 *         - { $ref: "#/components/schemas/MoverBasicInfo" }
 *         - type: object
 *           required: [id, profileImageUrl, nickname, careerYears, shortIntroduction, description, serviceTypes, regions, confirmedCount, favoriteCount, rating, reviewCount, ratingCounts]
 *           properties:
 *             id: { type: string, format: uuid, description: "Mover.id" }
 *             profileImageUrl: { type: string, nullable: true }
 *             nickname: { type: string, example: "김코드" }
 *             careerYears: { type: integer, minimum: 0, maximum: 50 }
 *             shortIntroduction: { type: string }
 *             description: { type: string }
 *             serviceTypes:
 *               type: array
 *               items: { type: string, enum: [SMALL, HOME, OFFICE] }
 *             regions:
 *               type: array
 *               items: { type: string, enum: [서울, 경기, 인천, 강원, 충북, 충남, 세종, 대전, 전북, 전남, 광주, 경북, 경남, 대구, 울산, 부산, 제주] }
 *             confirmedCount: { type: integer, minimum: 0, description: "확정된 견적 수" }
 *             favoriteCount: { type: integer, minimum: 0 }
 *             rating: { type: number, minimum: 0, maximum: 5, description: "리뷰가 없으면 0, 그 외 소수점 첫째 자리" }
 *             reviewCount: { type: integer, minimum: 0 }
 *             ratingCounts:
 *               type: array
 *               items: { $ref: "#/components/schemas/MoverRatingCount" }
 */

/**
 * @openapi
 * /movers/me:
 *   get:
 *     tags: [Movers]
 *     summary: Get Mover My Page
 *     description: 현재 기사님의 기본정보, 프로필, 확정·찜·평점 통계를 조회합니다. 받은 리뷰 본문은 GET /movers/me/reviews에서 페이지 조회합니다.
 *     security: [{ accessTokenCookie: [] }]
 *     responses:
 *       200:
 *         description: 기사님 마이페이지 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   required: [myPage]
 *                   properties:
 *                     myPage: { $ref: "#/components/schemas/MoverMyPage" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *   patch:
 *     tags: [Movers]
 *     summary: Update Mover Basic Info
 *     description: User 기본정보만 수정합니다. 이메일·비밀번호 계정의 이메일 또는 비밀번호 변경에는 currentPassword가 필요합니다. 이름·전화번호는 로그인 세션으로 수정할 수 있습니다. OAuth 계정은 이메일·비밀번호 변경을 지원하지 않습니다. 프로필 필드는 PATCH /movers/me/profile을 사용합니다.
 *     security: [{ accessTokenCookie: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             additionalProperties: false
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 50, pattern: "^[가-힣A-Za-z]+(?:[ '·-][가-힣A-Za-z]+)*$", description: "완성형 한글 또는 영문 이름. 단어 사이 공백·하이픈·아포스트로피·가운뎃점 허용" }
 *               email: { type: string, format: email }
 *               phone: { type: string, nullable: true, description: "빈 문자열이면 null로 초기화" }
 *               currentPassword: { type: string, format: password, description: "이메일·비밀번호 계정의 이메일 또는 비밀번호 변경 시 필수" }
 *               newPassword: { type: string, format: password, minLength: 8, description: "이메일·비밀번호 계정만 지원. currentPassword 필수, 영문·숫자·특수문자 포함, 8~72바이트" }
 *     responses:
 *       200:
 *         description: 기사님 기본정보 수정 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   required: [basicInfo]
 *                   properties:
 *                     basicInfo: { $ref: "#/components/schemas/MoverBasicInfo" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
moverMyPageRouter.get("/", ...requireProfiledMover, getMoverMyPageController);
moverMyPageRouter.patch(
  "/",
  ...requireProfiledMover,
  updateMoverBasicInfoController,
);
