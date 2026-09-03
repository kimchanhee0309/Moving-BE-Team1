import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { csrfOriginGuard } from "./common/middleware/csrf-origin-guard";
import { errorHandler } from "./common/middleware/error-handler";
import { notFoundHandler } from "./common/middleware/not-found-handler";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { corsOptions } from "./config/cors";
import { setupSwagger } from "./config/swagger";

export const app = express();

app.disable("x-powered-by");

app.set("trust proxy", env.TRUST_PROXY);

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
app.use("/", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
