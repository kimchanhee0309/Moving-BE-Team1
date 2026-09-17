/**
 * Express 공통 middleware, Swagger, 역할별 정적 이미지 경로와 도메인 Router를 조립합니다.
 * 서버 process lifecycle과 도메인 비즈니스 규칙은 담당하지 않습니다.
 */
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { csrfOriginGuard } from "./common/middleware/security/csrf-origin-guard";
import { errorHandler } from "./common/middleware/http/error-handler";
import { notFoundHandler } from "./common/middleware/http/not-found-handler";
import { requireHttps } from "./common/middleware/security/require-https";
import { corsOptions } from "./config/cors";
import { env } from "./config/env";
import { setupSwagger } from "./config/swagger";
import { CUSTOMER_PROFILE_UPLOAD_DIRECTORY } from "./modules/customer-profile/customer-profile.image";
import { MOVER_PROFILE_UPLOAD_DIRECTORY } from "./modules/mover-profile/mover-profile.image";
import { apiRouter } from "./routes";

export const app = express();

app.disable("x-powered-by");

app.set("trust proxy", env.TRUST_PROXY);

app.use(requireHttps);
app.use(cors(corsOptions));
app.use(
  express.json({
    limit: "1mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  }),
);

app.use(cookieParser());
app.use(csrfOriginGuard);
setupSwagger(app);
// UUID로 저장된 개발용 이미지 파일만 공개하며 업로드·검증은 공통 이미지 경계가 담당합니다.
app.use(
  "/uploads/customer-profiles",
  express.static(CUSTOMER_PROFILE_UPLOAD_DIRECTORY, {
    dotfiles: "deny",
    index: false,
  }),
);
app.use(
  "/uploads/mover-profiles",
  express.static(MOVER_PROFILE_UPLOAD_DIRECTORY, {
    dotfiles: "deny",
    index: false,
  }),
);
app.use("/", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
