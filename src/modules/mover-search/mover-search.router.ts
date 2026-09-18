import { Router } from "express";

import {
  getMoverByIdController,
  listMoversController,
  listRecommendedMoversController,
} from "./mover-search.controller";

export const moverSearchRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MoverSearchItem:
 *       type: object
 *       required: [id, serviceType, serviceTypes, region, moverName, introduction, description, profileImageUrl, rating, reviewCount, careerYears, confirmedCount, favoriteCount]
 *       properties:
 *         id: { type: string, format: uuid }
 *         serviceType: { $ref: "#/components/schemas/ServiceType", description: "대표 1개. SMALL → HOME → OFFICE 중 첫 보유값입니다." }
 *         serviceTypes:
 *           type: array
 *           items: { $ref: "#/components/schemas/ServiceType" }
 *           example: [SMALL, HOME]
 *           description: 보유 서비스 전체. 대표 serviceType과 같은 우선순위이며 빈 배열로 내려가지 않습니다.
 *         region: { type: string, example: "서울", description: "카드 대표 지역. 필터는 보유 지역 전체 기준입니다." }
 *         moverName: { type: string, example: "김코드" }
 *         introduction: { type: string, example: "꼼꼼하고 안전한 이사를 도와드립니다." }
 *         description: { type: string, example: "서울과 경기 지역을 중심으로 이사를 진행합니다." }
 *         profileImageUrl: { type: string, nullable: true, example: null }
 *         rating: { type: number, example: 4.5, description: "리뷰가 없으면 0, 소수 1자리" }
 *         reviewCount: { type: integer, example: 2 }
 *         careerYears: { type: integer, example: 8 }
 *         confirmedCount: { type: integer, example: 1, description: "CONFIRMED 견적 수" }
 *         favoriteCount: { type: integer, example: 4 }
 *     MoverSearchDetail:
 *       allOf:
 *         - $ref: "#/components/schemas/MoverSearchItem"
 *         - type: object
 *           required: [serviceTypes, regions]
 *           properties:
 *             serviceTypes:
 *               type: array
 *               items: { $ref: "#/components/schemas/ServiceType" }
 *               example: [SMALL, HOME]
 *             regions:
 *               type: array
 *               items: { type: string, example: "서울" }
 *               description: 보유 지역 전체. 한글 시·도이며 목록 필터와 같은 값입니다.
 *     MoverSearchListResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [items, nextPage, totalCount]
 *           properties:
 *             items:
 *               type: array
 *               items: { $ref: "#/components/schemas/MoverSearchItem" }
 *             nextPage: { type: integer, nullable: true, example: 2, description: "다음 page. 없으면 null" }
 *             totalCount: { type: integer, example: 10 }
 *     MoverSearchDetailResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [mover]
 *           properties:
 *             mover: { $ref: "#/components/schemas/MoverSearchDetail" }
 *     MoverSearchRecommendedResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [items]
 *           properties:
 *             items:
 *               type: array
 *               maxItems: 3
 *               items: { $ref: "#/components/schemas/MoverSearchItem" }
 */

/**
 * @openapi
 * /movers:
 *   get:
 *     tags: [Movers]
 *     summary: List Movers
 *     description: 비회원도 기사님 목록을 조회합니다. 인식 가능한 서비스 유형과 가능 지역이 있는 기사님만 포함하며, 찜 여부·리뷰 본문은 포함하지 않습니다.
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string, maxLength: 50 }
 *         description: 기사님 별명 부분 일치. 빈 값이면 조건 없음
 *       - in: query
 *         name: regions
 *         schema: { type: string, example: "서울,경기" }
 *         description: 쉼표 구분 한글 지역. 없거나 빈 값이면 필터 없음
 *       - in: query
 *         name: services
 *         schema: { type: string, example: "SMALL,HOME" }
 *         description: 쉼표 구분 서비스 유형. SMALL, HOME, OFFICE
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [reviewCount, rating, careerYears, confirmedCount], default: reviewCount }
 *         description: 내림차순 정렬. 동점이면 id 오름차순
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, maximum: 1000, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, minimum: 1, maximum: 20, default: 5 }
 *     responses:
 *       200:
 *         description: 기사님 찾기 카드 목록
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/MoverSearchListResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 */
moverSearchRouter.get("/", listMoversController);

/**
 * @openapi
 * /movers/recommended:
 *   get:
 *     tags: [Movers]
 *     summary: List Recommended Movers
 *     description: 비회원도 사이드바용 추천 기사님 3명을 조회합니다. 찜 수·평점 내림차순이며 동점이면 id 오름차순입니다. GET /movers/:id보다 먼저 연결합니다.
 *     responses:
 *       200:
 *         description: 추천 기사님 카드 목록
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/MoverSearchRecommendedResponse" }
 */
moverSearchRouter.get("/recommended", listRecommendedMoversController);

/**
 * @openapi
 * /movers/{id}:
 *   get:
 *     tags: [Movers]
 *     summary: Get Mover
 *     description: 비회원도 기사님 상세를 조회합니다. 인식 가능한 서비스 유형과 가능 지역이 있는 기사님만 반환하며, 찜 여부·리뷰 본문은 포함하지 않습니다.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Prisma Mover.id. User.id가 아닙니다.
 *     responses:
 *       200:
 *         description: 기사님 찾기 상세
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/MoverSearchDetailResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
moverSearchRouter.get("/:id", getMoverByIdController);
