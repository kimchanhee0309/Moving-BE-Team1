/**
 * `/movers/me` 아래 기사님 받은 요청 조회 endpoint를 선언합니다.
 * 모든 endpoint는 Access Token, MOVER 역할, 기사님 프로필 검사를 통과해야 합니다.
 */
import { Router } from "express";

import { requireProfiledMover } from "../../common/middleware/auth-guards";
import {
  getReceivedRequestDetailController,
  getReceivedRequestsController,
} from "./mover-request.controller";

export const moverRequestRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
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
 *           example: "2026-09-20T01:00:00.000Z"
 *         fromAddress:
 *           type: string
 *           example: "서울시 중구"
 *         toAddress:
 *           type: string
 *           example: "경기도 수원시"
 *         requestedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-14T03:00:00.000Z"
 *
 *     ReceivedRequestDetail:
 *       allOf:
 *         - $ref: "#/components/schemas/ReceivedRequestItem"
 *         - type: object
 *           required:
 *             - status
 *           properties:
 *             status:
 *               $ref: "#/components/schemas/MoveRequestStatus"
 *
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
 *     ReceivedRequestDetailResponse:
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
 *             - moveRequest
 *           properties:
 *             moveRequest:
 *               $ref: "#/components/schemas/ReceivedRequestDetail"
 */

/**
 * @openapi
 * /movers/me/received-requests:
 *   get:
 *     tags:
 *       - Movers
 *     summary: Get Received Requests
 *     description: 현재 기사님이 아직 견적을 보내거나 반려하지 않은 요청 목록을 조회합니다.
 *     security:
 *       - accessTokenCookie: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: 고객 이름 검색어
 *       - in: query
 *         name: serviceType
 *         schema:
 *           $ref: "#/components/schemas/ServiceType"
 *       - in: query
 *         name: isDesignated
 *         schema:
 *           type: boolean
 *         description: 현재 기사님에 대한 지정 요청 여부
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
 *         description: 이전 응답의 nextCursor
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
 * /movers/me/received-requests/{requestId}:
 *   get:
 *     tags:
 *       - Movers
 *     summary: Get Received Request
 *     description: 현재 기사님이 아직 처리할 수 있는 받은 요청 상세를 조회합니다.
 *     security:
 *       - accessTokenCookie: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 받은 요청 상세 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ReceivedRequestDetailResponse"
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
moverRequestRouter.get(
  "/received-requests/:requestId",
  ...requireProfiledMover,
  getReceivedRequestDetailController,
);
