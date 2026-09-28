/**
 * 알림 목록·읽음 처리·SSE 스트림 endpoint와 guard 순서를 선언합니다.
 * 세 endpoint 모두 CUSTOMER/MOVER가 함께 쓰는 API이므로 requireProfiledUser를 사용합니다.
 */
import { Router } from "express";

import { requireProfiledUser } from "../../common/middleware/auth/auth-guards";
import {
  listNotificationsController,
  markNotificationReadController,
  streamNotificationsController,
} from "./notification.controller";

export const notificationRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     NotificationItem:
 *       type: object
 *       required: [id, type, title, content, moveRequestId, quoteId, readAt, createdAt]
 *       properties:
 *         id: { type: string, format: uuid }
 *         type: { type: string, enum: [NEW_QUOTE, QUOTE_CONFIRMED, NEW_MOVE_REQUEST, MOVE_DAY] }
 *         title: { type: string, example: "새로운 견적이 도착했습니다." }
 *         content: { type: string, example: "기사님이 새로운 이사 견적을 보냈습니다." }
 *         moveRequestId: { type: string, format: uuid, nullable: true }
 *         quoteId: { type: string, format: uuid, nullable: true }
 *         readAt: { type: string, format: date-time, nullable: true, description: "읽지 않았으면 null" }
 *         createdAt: { type: string, format: date-time }
 *     NotificationListResponse:
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
 *               items: { $ref: "#/components/schemas/NotificationItem" }
 *             pagination:
 *               type: object
 *               required: [nextCursor, hasNext]
 *               properties:
 *                 nextCursor: { type: string, nullable: true, description: "다음 페이지 cursor. 없으면 null" }
 *                 hasNext: { type: boolean, example: false }
 *     NotificationReadResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [notification]
 *           properties:
 *             notification: { $ref: "#/components/schemas/NotificationItem" }
 */

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get Notifications
 *     description: >
 *       로그인한 사용자(CUSTOMER/MOVER)의 알림을 생성 최신순(createdAt desc)으로 조회합니다.
 *       팀이 승인한 Swagger에 이 endpoint의 query 계약(cursor/limit 기본값·최대값, unreadOnly
 *       필요 여부)이 아직 확정되지 않아 customer-quote 모듈의 cursor pagination 관례를 따른
 *       잠정 구현입니다. 팀 결정 후 값이 달라질 수 있습니다.
 *     security: [{ accessTokenCookie: [] }]
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean }
 *         description: true면 읽지 않은 알림만 반환합니다.
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *         description: 다음 목록 조회용 opaque cursor
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *         description: 한 번에 가져올 개수. 기본 10, 최대 50(잠정값)
 *     responses:
 *       200:
 *         description: 알림 목록
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/NotificationListResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
notificationRouter.get(
  "/",
  ...requireProfiledUser,
  listNotificationsController,
);

/**
 * @openapi
 * /notifications/{notificationId}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark Notification As Read
 *     description: >
 *       내 알림 1건을 읽음 처리합니다. 이미 읽은 알림을 다시 호출해도 상태를 바꾸지 않고
 *       현재 값을 그대로 반환합니다(idempotent). 전체 읽음(bulk) API 필요 여부와 정확한 URI는
 *       팀 결정 대상이라 이번에는 단건 읽음 처리만 잠정 구현했습니다.
 *     security: [{ accessTokenCookie: [] }]
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: 읽음 처리할 알림 ID
 *     responses:
 *       200:
 *         description: 읽음 처리된(또는 이미 읽은) 알림
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/NotificationReadResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
notificationRouter.patch(
  "/:notificationId/read",
  ...requireProfiledUser,
  markNotificationReadController,
);

/**
 * @openapi
 * /notifications/stream:
 *   get:
 *     tags: [Notifications]
 *     summary: Stream Notifications (SSE)
 *     description: >
 *       Server-Sent Events로 새 견적(NEW_QUOTE)·견적 확정(QUOTE_CONFIRMED) 알림을 실시간
 *       push합니다. EventSource는 커스텀 헤더를 보낼 수 없으므로 HttpOnly accessToken 쿠키만
 *       으로 인증하며, 클라이언트는 반드시 `new EventSource(url, { withCredentials: true })`로
 *       연결해야 합니다(옵션이 없으면 쿠키가 전송되지 않아 401). event: notification 이름으로
 *       도착하는 data는 화면 캐시 무효화 트리거용 최소 정보이며 Notification row 전체(id,
 *       readAt 포함)가 아닙니다. 최신 상태는 GET /notifications로 다시 조회해야 합니다.
 *       현재 단일 Node 프로세스 메모리 허브로 동작하며, 다중 인스턴스 배포 전에는 이 endpoint가
 *       모든 서버 인스턴스에 연결된 클라이언트에 push된다고 보장하지 않습니다.
 *       NEW_MOVE_REQUEST(기사님의 새 요청 알림)와 MOVE_DAY(이사 당일 알림)는 아직 생성 트리거가
 *       없어 이 스트림으로도 push되지 않습니다.
 *     security: [{ accessTokenCookie: [] }]
 *     responses:
 *       200:
 *         description: text/event-stream 연결. Swagger UI 형식으로는 실시간 스트림을 표현하지 못합니다.
 *         content:
 *           text/event-stream:
 *             schema: { type: string }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
notificationRouter.get(
  "/stream",
  ...requireProfiledUser,
  streamNotificationsController,
);
