/**
 * `/customers/me/move-requests` 이사 견적 요청/지정 요청 endpoint를 선언합니다.
 * URI·Method 선언과 공통 guard(`requireProfiledCustomer`) 연결만 담당합니다.
 */
import { Router } from "express";

import { requireProfiledCustomer } from "../../common/middleware/auth/auth-guards";
import {
  createDesignatedRequestController,
  createMoveRequestController,
  getActiveMoveRequestController,
} from "./move-request.controller";

export const moveRequestRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     CreateMoveRequestRequest:
 *       type: object
 *       required: [serviceType, moveDate, fromAddress, toAddress]
 *       properties:
 *         serviceType: { $ref: "#/components/schemas/ServiceType" }
 *         moveDate:
 *           type: string
 *           format: date
 *           description: ISO 8601 날짜(YYYY-MM-DD), 오늘(UTC 기준)보다 미래여야 함
 *           example: "2026-11-01"
 *         fromAddress:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *           description: "공백 제거 후 1~255자, [{zonecode}] {roadAddress} {detailAddress} ({jibunAddress}) 형식"
 *           example: "[04538] 서울시 강남구 테헤란로 123 101동 202호 (테헤란로1가 25-3)"
 *         toAddress:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *           example: "[13529] 경기도 성남시 분당구 판교역로 456 3층 (백현동 532-2)"
 *     MoveRequest:
 *       type: object
 *       required: [id, serviceType, moveDate, fromAddress, toAddress, status, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, format: uuid }
 *         serviceType: { $ref: "#/components/schemas/ServiceType" }
 *         moveDate: { type: string, format: date-time, example: "2026-11-01T00:00:00.000Z" }
 *         fromAddress: { type: string, example: "[04538] 서울시 강남구 테헤란로 123 101동 202호 (테헤란로1가 25-3)" }
 *         toAddress: { type: string, example: "[13529] 경기도 성남시 분당구 판교역로 456 3층 (백현동 532-2)" }
 *         status: { $ref: "#/components/schemas/MoveRequestStatus" }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     MoveRequestResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [moveRequest]
 *           properties:
 *             moveRequest: { $ref: "#/components/schemas/MoveRequest" }
 *     ActiveMoveRequestResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [moveRequest]
 *           properties:
 *             moveRequest:
 *               nullable: true
 *               allOf:
 *                 - $ref: "#/components/schemas/MoveRequest"
 *     CreateDesignatedRequestRequest:
 *       type: object
 *       required: [moverId]
 *       properties:
 *         moverId: { type: string, format: uuid, description: "지정할 기사님의 Mover.id" }
 *     DesignatedRequest:
 *       type: object
 *       required: [id, moveRequestId, moverId, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, format: uuid }
 *         moveRequestId: { type: string, format: uuid }
 *         moverId: { type: string, format: uuid }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     DesignatedRequestResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [designatedRequest]
 *           properties:
 *             designatedRequest: { $ref: "#/components/schemas/DesignatedRequest" }
 */

/**
 * @openapi
 * /customers/me/move-requests:
 *   post:
 *     tags: [MoveRequests]
 *     summary: Create Move Request
 *     description: 이사 종류·날짜·출발지·도착지를 받아 새 이사 견적 요청을 생성합니다. 이미 활성 요청이 있으면 409를 반환합니다.
 *     security: [{ accessTokenCookie: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/CreateMoveRequestRequest" }
 *     responses:
 *       201:
 *         description: 이사 견적 요청 생성 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/MoveRequestResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
moveRequestRouter.post("/", requireProfiledCustomer, createMoveRequestController);

/**
 * @openapi
 * /customers/me/move-requests/active:
 *   get:
 *     tags: [MoveRequests]
 *     summary: Get Active Move Request
 *     description: 현재 customer의 활성 요청(대기 중이거나 확정 후 이사일 이전)을 조회합니다. 없으면 data.moveRequest가 null입니다.
 *     security: [{ accessTokenCookie: [] }]
 *     responses:
 *       200:
 *         description: 활성 요청 조회 성공(없으면 null)
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ActiveMoveRequestResponse" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
moveRequestRouter.get(
  "/active",
  requireProfiledCustomer,
  getActiveMoveRequestController,
);

/**
 * @openapi
 * /customers/me/move-requests/{moveRequestId}/designated-requests:
 *   post:
 *     tags: [MoveRequests]
 *     summary: Create Designated Request
 *     description: 이미 생성된 일반 견적 요청에 특정 기사님을 지정해서 지정 요청을 추가합니다(지정 견적 최대 3명).
 *     security: [{ accessTokenCookie: [] }]
 *     parameters:
 *       - in: path
 *         name: moveRequestId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/CreateDesignatedRequestRequest" }
 *     responses:
 *       201:
 *         description: 지정 요청 생성 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/DesignatedRequestResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
moveRequestRouter.post(
  "/:moveRequestId/designated-requests",
  requireProfiledCustomer,
  createDesignatedRequestController,
);
