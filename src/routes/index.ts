/**
 * 모든 도메인 Router를 최상위 URL에 연결합니다.
 * 각 endpoint의 입력 검증·권한·DB 처리는 담당 module에 위임합니다.
 */
import { Router } from "express";

import { HTTP_STATUS } from "../common/constants/http-status";
import { sendSuccess } from "../common/response/api-response";
import { authRouter } from "../modules/auth/auth.router";
import { customerProfileRouter } from "../modules/customer-profile/customer-profile.router";
import { customerQuoteRouter } from "../modules/customer-quote/customer-quote.router";
import { favoriteRouter } from "../modules/favorite/favorite.router";
import { moveRequestRouter } from "../modules/move-request/move-request.router";
import { moverMyPageRouter } from "../modules/mover-mypage/mover-mypage.router";
import { moverProfileRouter } from "../modules/mover-profile/mover-profile.router";
import { moverQuoteRouter } from "../modules/mover-quote/mover-quote.router";
import { moverRequestRouter } from "../modules/mover-request/mover-request.router";
import { moverSearchRouter } from "../modules/mover-search/mover-search.router";
import {
  customerReviewRouter,
  moverReviewRouter,
  reviewRouter,
} from "../modules/review/review.router";

/** 앱이 `/`에 연결하는 최상위 API Router입니다. */
export const apiRouter = Router();

// 도메인 Router는 최상위 경로만 이 파일에서 조립합니다.
apiRouter.use("/auth", authRouter);
apiRouter.use("/customers/me/quotes", customerQuoteRouter);
apiRouter.use("/customers", customerProfileRouter);
apiRouter.use("/customers", customerReviewRouter);
apiRouter.use("/movers/me", moverMyPageRouter);
apiRouter.use("/movers", moverSearchRouter);
apiRouter.use("/movers", moverReviewRouter);
apiRouter.use("/reviews", reviewRouter);
apiRouter.use("/customers/me/move-requests", moveRequestRouter);
apiRouter.use("/favorites", favoriteRouter);
apiRouter.use("/movers", moverProfileRouter);
apiRouter.use("/movers/me", moverQuoteRouter);
apiRouter.use("/movers/me", moverRequestRouter);

apiRouter.get("/health", (_request, response) => {
  return sendSuccess(response, HTTP_STATUS.OK, {
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});
