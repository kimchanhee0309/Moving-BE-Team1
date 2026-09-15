/**
 * `/movers/me` 아래 기사님의 보낸 견적·견적 상세·반려 요청 조회 endpoint를 선언합니다.
 * 인증·MOVER 역할·기사 프로필 검사는 공통 requireProfiledMover에 위임합니다.
 */
import { Router } from "express";

import { requireProfiledMover } from "../../common/middleware/auth/auth-guards";
import {
  getMoverQuoteDetailController,
  getMoverQuotesController,
  getRejectedRequestsController,
} from "./mover-quote.controller";

export const moverQuoteRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MoverQuotePagination:
 *       type: object
 *       required:
 *         - nextCursor
 *         - hasNext
 *       properties:
 *         nextCursor:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         hasNext:
 *           type: boolean
 *           example: false
 *
 *     MoverQuoteItem:
 *       type: object
 *       required:
 *         - quoteId
 *         - customerName
 *         - serviceType
 *         - isDesignated
 *         - fromAddress
 *         - toAddress
 *         - moveDate
 *         - price
 *         - quoteStatus
 *         - moveRequestStatus
 *       properties:
 *         quoteId:
 *           type: string
 *           format: uuid
 *         customerName:
 *           type: string
 *           example: "김인서"
 *         serviceType:
 *           $ref: "#/components/schemas/ServiceType"
 *         isDesignated:
 *           type: boolean
 *           example: true
 *         fromAddress:
 *           type: string
 *           example: "서울특별시 중구 세종대로 110"
 *         toAddress:
 *           type: string
 *           example: "경기도 수원시 팔달구 효원로 241"
 *         moveDate:
 *           type: string
 *           format: date-time
 *         price:
 *           type: integer
 *           minimum: 1
 *           example: 180000
 *         quoteStatus:
 *           $ref: "#/components/schemas/QuoteStatus"
 *         moveRequestStatus:
 *           $ref: "#/components/schemas/MoveRequestStatus"
 *
 *     MoverQuoteListResponse:
 *       type: object
 *       required:
 *         - success
 *         - data
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           required:
 *             - items
 *             - pagination
 *           properties:
 *             items:
 *               type: array
 *               items:
 *                 $ref: "#/components/schemas/MoverQuoteItem"
 *             pagination:
 *               $ref: "#/components/schemas/MoverQuotePagination"
 *
 *     MoverQuoteDetail:
 *       allOf:
 *         - $ref: "#/components/schemas/MoverQuoteItem"
 *         - type: object
 *           required:
 *             - requestId
 *             - requestedAt
 *             - comment
 *           properties:
 *             requestId:
 *               type: string
 *               format: uuid
 *             requestedAt:
 *               type: string
 *               format: date-time
 *             comment:
 *               type: string
 *               example: "안전하고 신속하게 이사를 진행해 드리겠습니다."
 *
 *     MoverQuoteDetailResponse:
 *       type: object
 *       required:
 *         - success
 *         - data
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           required:
 *             - quote
 *           properties:
 *             quote:
 *               $ref: "#/components/schemas/MoverQuoteDetail"
 *
 *     RejectedRequestItem:
 *       type: object
 *       required:
 *         - rejectionId
 *         - requestId
 *         - customerName
 *         - serviceType
 *         - isDesignated
 *         - fromAddress
 *         - toAddress
 *         - moveDate
 *         - reason
 *         - rejectedAt
 *       properties:
 *         rejectionId:
 *           type: string
 *           format: uuid
 *         requestId:
 *           type: string
 *           format: uuid
 *         customerName:
 *           type: string
 *           example: "김인서"
 *         serviceType:
 *           $ref: "#/components/schemas/ServiceType"
 *         isDesignated:
 *           type: boolean
 *           example: true
 *         fromAddress:
 *           type: string
 *           example: "서울특별시 중구 세종대로 110"
 *         toAddress:
 *           type: string
 *           example: "경기도 수원시 팔달구 효원로 241"
 *         moveDate:
 *           type: string
 *           format: date-time
 *         reason:
 *           type: string
 *           example: "해당 날짜에는 기존 일정이 있어 진행하기 어렵습니다."
 *         rejectedAt:
 *           type: string
 *           format: date-time
 *
 *     RejectedRequestListResponse:
 *       type: object
 *       required:
 *         - success
 *         - data
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           required:
 *             - items
 *             - pagination
 *           properties:
 *             items:
 *               type: array
 *               items:
 *                 $ref: "#/components/schemas/RejectedRequestItem"
 *             pagination:
 *               $ref: "#/components/schemas/MoverQuotePagination"
 */

/**
 * @openapi
 * /movers/me/quotes:
 *   get:
 *     tags:
 *       - Quotes
 *     summary: 기사님이 보낸 견적 목록 조회
 *     security:
 *       - accessTokenCookie: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: "#/components/schemas/QuoteStatus"
 *         description: 생략하면 모든 상태의 보낸 견적을 조회합니다.
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *     responses:
 *       200:
 *         description: 보낸 견적 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/MoverQuoteListResponse"
 *       400:
 *         $ref: "#/components/responses/BadRequest"
 *       401:
 *         $ref: "#/components/responses/Unauthorized"
 *       403:
 *         $ref: "#/components/responses/Forbidden"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
moverQuoteRouter.get(
  "/quotes",
  ...requireProfiledMover,
  getMoverQuotesController,
);

/**
 * @openapi
 * /movers/me/quotes/{quoteId}:
 *   get:
 *     tags:
 *       - Quotes
 *     summary: 기사님이 보낸 견적 상세 조회
 *     security:
 *       - accessTokenCookie: []
 *     parameters:
 *       - in: path
 *         name: quoteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 견적 상세 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/MoverQuoteDetailResponse"
 *       400:
 *         $ref: "#/components/responses/BadRequest"
 *       401:
 *         $ref: "#/components/responses/Unauthorized"
 *       403:
 *         $ref: "#/components/responses/Forbidden"
 *       404:
 *         $ref: "#/components/responses/NotFound"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
moverQuoteRouter.get(
  "/quotes/:quoteId",
  ...requireProfiledMover,
  getMoverQuoteDetailController,
);

/**
 * @openapi
 * /movers/me/rejected-requests:
 *   get:
 *     tags:
 *       - Movers
 *     summary: 기사님이 반려한 견적 요청 목록 조회
 *     security:
 *       - accessTokenCookie: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *     responses:
 *       200:
 *         description: 반려 요청 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/RejectedRequestListResponse"
 *       400:
 *         $ref: "#/components/responses/BadRequest"
 *       401:
 *         $ref: "#/components/responses/Unauthorized"
 *       403:
 *         $ref: "#/components/responses/Forbidden"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
moverQuoteRouter.get(
  "/rejected-requests",
  ...requireProfiledMover,
  getRejectedRequestsController,
);
