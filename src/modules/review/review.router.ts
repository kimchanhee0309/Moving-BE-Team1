/**
 * Review endpoint와 적용 미들웨어 순서를 선언합니다.
 * 입력 검증은 Controller에서 수행하고, 인증·역할·프로필은 공통 guard에 위임합니다.
 *
 * 담당하지 않는 범위: cookie 해석, Prisma 호출, 응답 JSON 직접 조립
 *
 * 경로가 `/reviews`, `/customers/me/reviews`, `/movers/...`로 나뉘어
 * 상위 Router에서 prefix만 조립하도록 Router를 세 개로 나눕니다.
 */
import { Router } from "express";

import {
  requireProfiledCustomer,
  requireProfiledMover,
} from "../../common/middleware/auth/auth-guards";
import {
  createReviewController,
  listCustomerReviewsController,
  listMoverReviewsController,
  listMyReceivedReviewsController,
} from "./review.controller";

/** POST `/reviews` */
export const reviewRouter = Router();

/** GET `/customers/me/reviews` — `/customers` prefix에 연결합니다. */
export const customerReviewRouter = Router();

/**
 * GET `/movers/me/reviews`와 GET `/movers/:moverId/reviews`.
 * `/me/reviews`를 `/:moverId/reviews`보다 먼저 등록해야 `me`가 UUID로 파싱되지 않습니다.
 */
export const moverReviewRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     ReviewMoverCard:
 *       type: object
 *       required: [id, nickname, profileImageUrl]
 *       properties:
 *         id: { type: string, format: uuid, description: "Mover.id" }
 *         nickname: { type: string, example: "김코드" }
 *         profileImageUrl: { type: string, nullable: true, example: null }
 *     ReviewCustomerCard:
 *       type: object
 *       required: [id, name, profileImageUrl]
 *       properties:
 *         id: { type: string, format: uuid, description: "Customer.id" }
 *         name: { type: string, example: "홍길동", description: "User.name. 이메일·전화번호는 포함하지 않습니다." }
 *         profileImageUrl: { type: string, nullable: true, example: null }
 *     ReviewMoveRequest:
 *       type: object
 *       required: [id, serviceType, moveDate, fromAddress, toAddress]
 *       properties:
 *         id: { type: string, format: uuid }
 *         serviceType: { $ref: "#/components/schemas/ServiceType" }
 *         moveDate: { type: string, format: date-time }
 *         fromAddress: { type: string, example: "서울 강남구" }
 *         toAddress: { type: string, example: "경기 성남시" }
 *     Review:
 *       type: object
 *       required: [id, moveRequestId, moverId, rating, content, createdAt, mover, moveRequest]
 *       properties:
 *         id: { type: string, format: uuid }
 *         moveRequestId: { type: string, format: uuid }
 *         moverId: { type: string, format: uuid }
 *         rating: { type: integer, minimum: 1, maximum: 5, example: 5 }
 *         content: { type: string, minLength: 10, maxLength: 500, example: "친절하고 꼼꼼하게 이사를 진행해 주셔서 만족했습니다." }
 *         createdAt: { type: string, format: date-time }
 *         mover: { $ref: "#/components/schemas/ReviewMoverCard" }
 *         moveRequest: { $ref: "#/components/schemas/ReviewMoveRequest" }
 *     WritableReview:
 *       type: object
 *       required: [mover, moveRequest]
 *       properties:
 *         mover: { $ref: "#/components/schemas/ReviewMoverCard" }
 *         moveRequest: { $ref: "#/components/schemas/ReviewMoveRequest" }
 *     ReceivedReview:
 *       type: object
 *       required: [id, rating, content, createdAt, serviceType, customer]
 *       properties:
 *         id: { type: string, format: uuid }
 *         rating: { type: integer, minimum: 1, maximum: 5, example: 5 }
 *         content: { type: string, example: "친절하고 꼼꼼하게 이사를 진행해 주셔서 만족했습니다." }
 *         createdAt: { type: string, format: date-time }
 *         serviceType: { $ref: "#/components/schemas/ServiceType" }
 *         customer: { $ref: "#/components/schemas/ReviewCustomerCard" }
 *     ReviewPagination:
 *       type: object
 *       required: [page, pageSize, totalCount, totalPages]
 *       properties:
 *         page: { type: integer, example: 1 }
 *         pageSize: { type: integer, example: 10 }
 *         totalCount: { type: integer, example: 2 }
 *         totalPages: { type: integer, example: 1 }
 *     ReviewSummary:
 *       type: object
 *       required: [reviewCount, averageRating]
 *       properties:
 *         reviewCount: { type: integer, example: 12 }
 *         averageRating: { type: number, nullable: true, example: 4.8, description: "소수점 첫째 자리. 리뷰가 없으면 null" }
 *     ReviewResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [review]
 *           properties:
 *             review: { $ref: "#/components/schemas/Review" }
 *     WrittenReviewListResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [type, items, pagination]
 *           properties:
 *             type: { type: string, enum: [WRITTEN] }
 *             items:
 *               type: array
 *               items: { $ref: "#/components/schemas/Review" }
 *             pagination: { $ref: "#/components/schemas/ReviewPagination" }
 *     WritableReviewListResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [type, items, pagination]
 *           properties:
 *             type: { type: string, enum: [WRITABLE] }
 *             items:
 *               type: array
 *               items: { $ref: "#/components/schemas/WritableReview" }
 *             pagination: { $ref: "#/components/schemas/ReviewPagination" }
 *     ReceivedReviewListResponse:
 *       type: object
 *       required: [success, data]
 *       properties:
 *         success: { type: boolean, example: true }
 *         data:
 *           type: object
 *           required: [items, pagination, summary]
 *           properties:
 *             items:
 *               type: array
 *               items: { $ref: "#/components/schemas/ReceivedReview" }
 *             pagination: { $ref: "#/components/schemas/ReviewPagination" }
 *             summary: { $ref: "#/components/schemas/ReviewSummary" }
 *     CreateReviewRequest:
 *       type: object
 *       required: [moveRequestId, rating, content]
 *       additionalProperties: false
 *       properties:
 *         moveRequestId: { type: string, format: uuid }
 *         rating: { type: integer, minimum: 1, maximum: 5, example: 5 }
 *         content: { type: string, minLength: 10, maxLength: 500 }
 */

/**
 * @openapi
 * /reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Create Review
 *     description: 완료된 본인 이사 요청에 리뷰를 작성합니다. moveRequestId당 한 건만 허용합니다.
 *     security: [{ accessTokenCookie: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/CreateReviewRequest" }
 *     responses:
 *       201:
 *         description: 리뷰 작성 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ReviewResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 */
reviewRouter.post("/", ...requireProfiledCustomer, createReviewController);

/**
 * @openapi
 * /customers/me/reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: Get Customer Reviews
 *     description: 로그인한 CUSTOMER의 작성 가능(WRITABLE) 또는 작성 완료(WRITTEN) 리뷰 목록입니다. page 기본값 1·최대 2147483647, pageSize 기본값 10·최대 50입니다. (page - 1) * pageSize가 2147483647을 넘으면 400입니다.
 *     security: [{ accessTokenCookie: [] }]
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [WRITABLE, WRITTEN] }
 *         description: WRITABLE은 완료됐지만 리뷰가 없는 요청, WRITTEN은 이미 작성한 리뷰
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
 *         description: 고객 리뷰 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - { $ref: "#/components/schemas/WrittenReviewListResponse" }
 *                 - { $ref: "#/components/schemas/WritableReviewListResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
customerReviewRouter.get(
  "/me/reviews",
  ...requireProfiledCustomer,
  listCustomerReviewsController,
);

/**
 * @openapi
 * /movers/me/reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: Get My Received Reviews
 *     description: 로그인한 MOVER가 받은 리뷰를 최신순으로 조회합니다. page 기본값 1·최대 2147483647, pageSize 기본값 10·최대 50입니다. (page - 1) * pageSize가 2147483647을 넘으면 400입니다.
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
 *         description: 받은 리뷰 목록 조회 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ReceivedReviewListResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 */
moverReviewRouter.get(
  "/me/reviews",
  ...requireProfiledMover,
  listMyReceivedReviewsController,
);

/**
 * @openapi
 * /movers/{moverId}/reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: Get Mover Reviews
 *     description: 특정 기사님이 받은 리뷰를 공개 조회합니다. 고객 주소·이메일은 포함하지 않습니다. page 기본값 1·최대 2147483647, pageSize 기본값 10·최대 50입니다. (page - 1) * pageSize가 2147483647을 넘으면 400입니다.
 *     parameters:
 *       - in: path
 *         name: moverId
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Prisma Mover.id. User.id가 아닙니다.
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
 *         description: 기사님 받은 리뷰 목록 조회 성공
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ReceivedReviewListResponse" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
moverReviewRouter.get("/:moverId/reviews", listMoverReviewsController);
