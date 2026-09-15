/**
 * `/favorites` 찜 등록·목록·해제 endpoint와 적용 미들웨어 순서를 선언합니다.
 * 입력 검증은 Controller에서 수행하고, 인증·역할·프로필은 공통 guard에 위임합니다.
 *
 * 담당하지 않는 범위: cookie 해석, Prisma 호출, 응답 JSON 직접 조립
 */

import { Router } from "express";

import { requireProfiledCustomer } from "../../common/middleware/auth/auth-guards";
import {
  addFavoriteController,
  listFavoritesController,
  removeFavoriteController,
} from "./favorite.controller";

export const favoriteRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     FavoriteMover:
 *       type: object
 *       required: [id, nickname, profileImageUrl, careerYears, shortIntroduction, serviceTypes, regions, reviewCount, averageRating, favoriteCount]
 *       properties:
 *         id: { type: string, format: uuid }
 *         nickname: { type: string, example: "김코드" }
 *         profileImageUrl: { type: string, nullable: true, example: null }
 *         careerYears: { type: integer, example: 5, description: "경력 연수" }
 *         shortIntroduction: { type: string, example: "안전하고 빠른 이사" }
 *         serviceTypes:
 *           type: array
 *           items: { $ref: "#/components/schemas/ServiceType" }
 *         regions:
 *           type: array
 *           items: { type: string, example: "SEOUL" }
 *         reviewCount: { type: integer, example: 12 }
 *         averageRating: { type: number, nullable: true, example: 4.8, description: "리뷰가 없으면 null" }
 *         favoriteCount: { type: integer, example: 30 }
 *     Favorite:
 *       type: object
 *       required: [id, moverId, createdAt, mover]
 *       properties:
 *         id: { type: string, format: uuid, description: "Favorite 식별자" }
 *         moverId: { type: string, format: uuid }
 *         createdAt: { type: string, format: date-time }
 *         mover: { $ref: "#/components/schemas/FavoriteMover" }
 *     FavoriteResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [favorite]
 *           properties:
 *             favorite: { $ref: "#/components/schemas/Favorite" }
 *     FavoriteListResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [items, pagination]
 *           properties:
 *             items:
 *               type: array
 *               items: { $ref: "#/components/schemas/Favorite" }
 *             pagination:
 *               type: object
 *               required: [page, pageSize, totalCount, totalPages]
 *               properties:
 *                 page: { type: integer, example: 1 }
 *                 pageSize: { type: integer, example: 10 }
 *                 totalCount: { type: integer, example: 2 }
 *                 totalPages: { type: integer, example: 1 }
 */

/**
 * @openapi
 * /favorites:
 *   get:
 *     tags: [Favorites]
 *     summary: Get Favorite Movers
 *     description: 로그인한 CUSTOMER의 찜 목록을 최신순으로 페이지 조회합니다. page 기본값 1·최대 2147483647, pageSize 기본값 10·최대 50입니다. (page - 1) * pageSize가 2147483647을 넘으면 400입니다.
 *     security: [{ accessTokenCookie: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         description: 1부터 시작하는 페이지 번호입니다. pageSize와 곱한 skip이 2147483647을 넘으면 VALIDATION_ERROR입니다.
 *         schema: { type: integer, minimum: 1, maximum: 2147483647, default: 1 }
 *       - in: query
 *         name: pageSize
 *         description: 한 페이지 건수입니다.
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *     responses:
 *       200:
 *         description: 찜 목록 조회 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/FavoriteListResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
favoriteRouter.get("/", ...requireProfiledCustomer, listFavoritesController);

/**
 * @openapi
 * /favorites/{moverId}:
 *   post:
 *     tags: [Favorites]
 *     summary: Add Favorite Mover
 *     description: 특정 기사님을 찜합니다. 같은 고객·기사님 조합은 한 번만 허용합니다.
 *     security: [{ accessTokenCookie: [] }]
 *     parameters:
 *       - in: path
 *         name: moverId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: 찜 등록 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/FavoriteResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *   delete:
 *     tags: [Favorites]
 *     summary: Remove Favorite Mover
 *     description: 특정 기사님 찜을 해제합니다. 성공 시 Body 없이 204를 반환합니다.
 *     security: [{ accessTokenCookie: [] }]
 *     parameters:
 *       - in: path
 *         name: moverId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: 찜 해제 성공
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
favoriteRouter.post("/:moverId", ...requireProfiledCustomer, addFavoriteController);
favoriteRouter.delete("/:moverId", ...requireProfiledCustomer, removeFavoriteController);
