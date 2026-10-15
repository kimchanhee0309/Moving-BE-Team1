/**
 * `/movers/me` 아래 기사님의 받은 요청 조회·견적 전송·반려 endpoint를 선언합니다.
 */
import { Router } from "express";

import { requireProfiledMover } from "../../common/middleware/auth/auth-guards";
import {
  getReceivedRequestsController,
  rejectReceivedRequestController,
  sendQuoteController,
} from "./mover-request.controller";

export const moverRequestRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     CursorPagination:
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
 *     ReceivedRequestItem:
 *       type: object
 *       required:
 *         - requestId
 *         - customerName
 *         - serviceType
 *         - isDesignated
 *         - moveDate
 *         - fromAddress
 *         - toAddress
 *         - requestedAt
 *       properties:
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
 *         moveDate:
 *           type: string
 *           format: date-time
 *         fromAddress:
 *           type: string
 *           example: "서울특별시 중구 세종대로 110"
 *         toAddress:
 *           type: string
 *           example: "경기도 수원시 팔달구 효원로 241"
 *         requestedAt:
 *           type: string
 *           format: date-time
 *
 *     ReceivedRequestListResponse:
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
 *                 $ref: "#/components/schemas/ReceivedRequestItem"
 *             pagination:
 *               $ref: "#/components/schemas/CursorPagination"
 *
 *     SendQuoteRequest:
 *       type: object
 *       required:
 *         - price
 *         - comment
 *       properties:
 *         price:
 *           type: integer
 *           minimum: 1
 *           maximum: 2147483647
 *           example: 180000
 *         comment:
 *           type: string
 *           minLength: 10
 *           example: "안전하고 신속하게 이사를 진행해 드리겠습니다."
 *
 *     CreatedQuote:
 *       type: object
 *       required:
 *         - quoteId
 *         - requestId
 *         - price
 *         - comment
 *         - status
 *         - createdAt
 *       properties:
 *         quoteId:
 *           type: string
 *           format: uuid
 *         requestId:
 *           type: string
 *           format: uuid
 *         price:
 *           type: integer
 *           example: 180000
 *         comment:
 *           type: string
 *         status:
 *           type: string
 *           enum:
 *             - PROPOSED
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     CreatedQuoteResponse:
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
 *               $ref: "#/components/schemas/CreatedQuote"
 *
 *     RejectReceivedRequestBody:
 *       type: object
 *       required:
 *         - reason
 *       properties:
 *         reason:
 *           type: string
 *           minLength: 10
 *           example: "해당 날짜에는 기존 일정이 있어 진행하기 어렵습니다."
 *
 *     CreatedRequestRejection:
 *       type: object
 *       required:
 *         - rejectionId
 *         - requestId
 *         - reason
 *         - rejectedAt
 *       properties:
 *         rejectionId:
 *           type: string
 *           format: uuid
 *         requestId:
 *           type: string
 *           format: uuid
 *         reason:
 *           type: string
 *         rejectedAt:
 *           type: string
 *           format: date-time
 *
 *     CreatedRequestRejectionResponse:
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
 *             - rejection
 *           properties:
 *             rejection:
 *               $ref: "#/components/schemas/CreatedRequestRejection"
 */

/**
 * @openapi
 * /movers/me/received-requests:
 *   get:
 *     tags:
 *       - Movers
 *     summary: 받은 요청 목록 조회
 *     security:
 *       - accessTokenCookie: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *           maxLength: 50
 *       - in: query
 *         name: serviceType
 *         schema:
 *           $ref: "#/components/schemas/ServiceType"
 *       - in: query
 *         name: isDesignated
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum:
 *             - REQUESTED_AT_DESC
 *             - MOVE_DATE_ASC
 *           default: REQUESTED_AT_DESC
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
 *         description: 받은 요청 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ReceivedRequestListResponse"
 *       400:
 *         $ref: "#/components/responses/BadRequest"
 *       401:
 *         $ref: "#/components/responses/Unauthorized"
 *       403:
 *         $ref: "#/components/responses/Forbidden"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
moverRequestRouter.get(
  "/received-requests",
  ...requireProfiledMover,
  getReceivedRequestsController,
);

/**
 * @openapi
 * /movers/me/received-requests/{requestId}/quotes:
 *   post:
 *     tags:
 *       - Quotes
 *     summary: 받은 요청에 견적 보내기
 *     security:
 *       - accessTokenCookie: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/SendQuoteRequest"
 *     responses:
 *       201:
 *         description: 견적 전송 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CreatedQuoteResponse"
 *       400:
 *         $ref: "#/components/responses/BadRequest"
 *       401:
 *         $ref: "#/components/responses/Unauthorized"
 *       403:
 *         $ref: "#/components/responses/Forbidden"
 *       404:
 *         $ref: "#/components/responses/NotFound"
 *       409:
 *         $ref: "#/components/responses/Conflict"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
moverRequestRouter.post(
  "/received-requests/:requestId/quotes",
  ...requireProfiledMover,
  sendQuoteController,
);

/**
 * @openapi
 * /movers/me/received-requests/{requestId}/reject:
 *   post:
 *     tags:
 *       - Movers
 *     summary: 받은 요청 반려하기
 *     security:
 *       - accessTokenCookie: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/RejectReceivedRequestBody"
 *     responses:
 *       201:
 *         description: 요청 반려 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CreatedRequestRejectionResponse"
 *       400:
 *         $ref: "#/components/responses/BadRequest"
 *       401:
 *         $ref: "#/components/responses/Unauthorized"
 *       403:
 *         $ref: "#/components/responses/Forbidden"
 *       404:
 *         $ref: "#/components/responses/NotFound"
 *       409:
 *         $ref: "#/components/responses/Conflict"
 *       500:
 *         $ref: "#/components/responses/InternalServerError"
 */
moverRequestRouter.post(
  "/received-requests/:requestId/reject",
  ...requireProfiledMover,
  rejectReceivedRequestController,
);
