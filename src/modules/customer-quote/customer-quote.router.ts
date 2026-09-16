/**
 * 고객이 받은 대기·과거 견적 목록·상세 endpoint와 guard 순서를 선언합니다.
 * /history를 /:quoteId보다 먼저 등록해야 history가 quoteId로 파싱되지 않습니다.
 */
import { Router } from "express";

import { requireProfiledCustomer } from "../../common/middleware/auth/auth-guards";
import {
  getReceivedQuoteDetailController,
  getReceivedQuoteHistoryDetailController,
  listReceivedQuoteHistoryController,
  listReceivedQuotesController,
} from "./customer-quote.controller";

export const customerQuoteRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     QuoteListMover:
 *       type: object
 *       required: [id, nickname, profileImageUrl, careerYears, shortIntroduction, reviewCount, averageRating, favoriteCount, isFavorite]
 *       properties:
 *         id: { type: string, format: uuid }
 *         nickname: { type: string, example: "김코드" }
 *         profileImageUrl: { type: string, nullable: true, example: "https://cdn.example.com/movers/kim.png" }
 *         careerYears: { type: integer, example: 7 }
 *         shortIntroduction: { type: string, example: "안전하고 빠른 이사" }
 *         reviewCount: { type: integer, example: 128 }
 *         averageRating: { type: number, nullable: true, example: 4.8 }
 *         favoriteCount: { type: integer, example: 56 }
 *         isFavorite: { type: boolean, example: true }
 *     QuoteListMoveRequest:
 *       type: object
 *       required: [id, serviceType, moveDate, fromAddress, toAddress, status]
 *       properties:
 *         id: { type: string, format: uuid }
 *         serviceType: { $ref: "#/components/schemas/ServiceType" }
 *         moveDate: { type: string, format: date-time, example: "2026-09-20T01:00:00.000Z" }
 *         fromAddress: { type: string, example: "서울시 중구" }
 *         toAddress: { type: string, example: "경기도 수원시" }
 *         status: { $ref: "#/components/schemas/MoveRequestStatus" }
 *     QuoteListItem:
 *       type: object
 *       required: [id, price, comment, status, isDesignated, createdAt, mover, moveRequest]
 *       properties:
 *         id: { type: string, format: uuid }
 *         price: { type: integer, nullable: true, example: 150000, description: "견적 금액(원)" }
 *         comment: { type: string, nullable: true, example: "안전하게 이사를 도와드리겠습니다." }
 *         status: { $ref: "#/components/schemas/QuoteStatus" }
 *         isDesignated: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time, example: "2026-09-11T03:00:00.000Z" }
 *         mover: { $ref: "#/components/schemas/QuoteListMover" }
 *         moveRequest: { $ref: "#/components/schemas/QuoteListMoveRequest" }
 *     ReceivedQuotesResponse:
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
 *               items: { $ref: "#/components/schemas/QuoteListItem" }
 *             pagination:
 *               type: object
 *               required: [nextCursor, hasNext]
 *               properties:
 *                 nextCursor: { type: string, nullable: true, description: "다음 페이지 cursor. 없으면 null" }
 *                 hasNext: { type: boolean, example: false }
 *     QuoteDetailMover:
 *       allOf:
 *         - $ref: "#/components/schemas/QuoteListMover"
 *         - type: object
 *           required: [description, serviceTypes, regions]
 *           properties:
 *             description: { type: string, example: "소형·가정이사 전문입니다." }
 *             serviceTypes:
 *               type: array
 *               items: { $ref: "#/components/schemas/ServiceType" }
 *               example: ["SMALL", "HOME"]
 *             regions:
 *               type: array
 *               items: { type: string }
 *               example: ["서울", "경기"]
 *     QuoteDetail:
 *       type: object
 *       required: [id, price, comment, status, isDesignated, createdAt, updatedAt, mover, moveRequest]
 *       properties:
 *         id: { type: string, format: uuid }
 *         price: { type: integer, nullable: true, example: 150000 }
 *         comment: { type: string, nullable: true, example: "안전하게 이사를 도와드리겠습니다." }
 *         status: { $ref: "#/components/schemas/QuoteStatus" }
 *         isDesignated: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time, example: "2026-09-11T03:00:00.000Z" }
 *         updatedAt: { type: string, format: date-time, example: "2026-09-11T03:00:00.000Z" }
 *         mover: { $ref: "#/components/schemas/QuoteDetailMover" }
 *         moveRequest: { $ref: "#/components/schemas/QuoteListMoveRequest" }
 *     ReceivedQuoteDetailResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [quote]
 *           properties:
 *             quote: { $ref: "#/components/schemas/QuoteDetail" }
 */

/**
 * @openapi
 * /customers/me/quotes:
 *   get:
 *     tags: [Quotes]
 *     summary: Get Received Quotes
 *     description: 로그인한 고객의 활성(WAITING) 이사 요청에 달린 PROPOSED 견적만 조회합니다. REJECTED·CONFIRMED 견적과 과거 요청 견적은 포함하지 않습니다.
 *     security: [{ accessTokenCookie: [] }]
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema: { type: string, maxLength: 50 }
 *         description: 기사님 닉네임 검색
 *       - in: query
 *         name: serviceType
 *         schema: { $ref: "#/components/schemas/ServiceType" }
 *         description: 이사 서비스 유형 필터
 *       - in: query
 *         name: isDesignated
 *         schema: { type: boolean }
 *         description: 지정 견적만 또는 일반 견적만
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [CREATED_AT_DESC, MOVE_DATE_ASC, PRICE_ASC], default: CREATED_AT_DESC }
 *         description: 목록 정렬. 기본값은 견적 최신순입니다.
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *         description: 다음 목록 조회용 opaque cursor
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *         description: 한 번에 가져올 개수. 기본 10, 최대 50
 *     responses:
 *       200:
 *         description: 대기 견적 카드 목록
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ReceivedQuotesResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
customerQuoteRouter.get(
  "/",
  ...requireProfiledCustomer,
  listReceivedQuotesController,
);

/**
 * @openapi
 * /customers/me/quotes/history:
 *   get:
 *     tags: [Quotes]
 *     summary: Get Received Quotes History
 *     description: 내가 확정한 견적 목록을 조회합니다. Quote status는 CONFIRMED이며 요청 상태는 CONFIRMED 또는 COMPLETED입니다.
 *     security: [{ accessTokenCookie: [] }]
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema: { type: string, maxLength: 50 }
 *         description: 기사님 닉네임 검색
 *       - in: query
 *         name: serviceType
 *         schema: { $ref: "#/components/schemas/ServiceType" }
 *       - in: query
 *         name: moveRequestStatus
 *         schema: { type: string, enum: [CONFIRMED, COMPLETED] }
 *         description: 진행 중 확정 또는 이사 완료만 조회
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [UPDATED_AT_DESC, MOVE_DATE_DESC], default: UPDATED_AT_DESC }
 *         description: 기본값은 확정 시각 최신순입니다.
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *     responses:
 *       200:
 *         description: 과거 확정 견적 카드 목록
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ReceivedQuotesResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
customerQuoteRouter.get(
  "/history",
  ...requireProfiledCustomer,
  listReceivedQuoteHistoryController,
);

/**
 * @openapi
 * /customers/me/quotes/history/{quoteId}:
 *   get:
 *     tags: [Quotes]
 *     summary: Get Received Quotes History Details
 *     description: 내가 확정한 과거 견적 상세를 조회합니다. 대기 견적 ID를 이 URI로 조회하면 QUOTE_NOT_FOUND입니다.
 *     security: [{ accessTokenCookie: [] }]
 *     parameters:
 *       - in: path
 *         name: quoteId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 확정 견적 상세
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ReceivedQuoteDetailResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
customerQuoteRouter.get(
  "/history/:quoteId",
  ...requireProfiledCustomer,
  getReceivedQuoteHistoryDetailController,
);

/**
 * @openapi
 * /customers/me/quotes/{quoteId}:
 *   get:
 *     tags: [Quotes]
 *     summary: Get Received Quote Details
 *     description: 로그인한 고객 소유 요청의 대기(PROPOSED) 견적 상세를 조회합니다. 다른 고객 견적과 과거 견적은 QUOTE_NOT_FOUND로 응답합니다.
 *     security: [{ accessTokenCookie: [] }]
 *     parameters:
 *       - in: path
 *         name: quoteId
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: 조회할 견적 ID
 *     responses:
 *       200:
 *         description: 대기 견적 상세
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ReceivedQuoteDetailResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
customerQuoteRouter.get(
  "/:quoteId",
  ...requireProfiledCustomer,
  getReceivedQuoteDetailController,
);
