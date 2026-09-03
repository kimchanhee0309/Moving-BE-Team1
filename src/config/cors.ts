import type { CorsOptions } from "cors";

import { ForbiddenError } from "../common/errors/app-error";
import { env } from "./env";

const allowedOrigins = new Set(env.CORS_ORIGINS);

export function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins.has(origin);
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (origin === undefined || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(
      new ForbiddenError("허용되지 않은 출처입니다.", "CORS_ORIGIN_DENIED"),
    );
  },

  credentials: true,

  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],

  allowedHeaders: ["Content-Type", "X-CSRF-Token"],

  optionsSuccessStatus: 204,
};
