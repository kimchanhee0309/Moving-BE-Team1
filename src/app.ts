import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { csrfOriginGuard } from "./common/middleware/security/csrf-origin-guard";
import { errorHandler } from "./common/middleware/http/error-handler";
import { notFoundHandler } from "./common/middleware/http/not-found-handler";
import { requireHttps } from "./common/middleware/security/require-https";
import { env } from "./config/env";
import { CUSTOMER_PROFILE_UPLOAD_DIRECTORY } from "./modules/customer-profile/customer-profile.image";
import { apiRouter } from "./routes";
import { corsOptions } from "./config/cors";
import { setupSwagger } from "./config/swagger";

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
// UUID로 저장된 개발용 이미지 파일만 공개하며 업로드·검증은 Customer Profile module이 담당합니다.
app.use(
  "/uploads/customer-profiles",
  express.static(CUSTOMER_PROFILE_UPLOAD_DIRECTORY, {
    dotfiles: "deny",
    index: false,
  }),
);
app.use("/", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
