import type { ErrorRequestHandler } from "express";

import { HTTP_STATUS } from "../constants/http-status";
import { AppError } from "../errors/app-error";
import { env } from "../../config/env";

interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string | string[]>;
  };
}

interface PrismaError {
  code: string;
}

function isPrismaError(error: unknown): error is PrismaError {
  if (typeof error !== "object" || error == null) {
    return false;
  }

  return (
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("P")
  );
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    const responseBody: ApiErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    };

    response.status(error.status).json(responseBody);

    return;
  }

  if (isPrismaError(error)) {
    if (error.code === "P2002") {
      const responseBody: ApiErrorResponse = {
        success: false,
        error: {
          code: "RESOURCE_ALREADY_EXISTS",
          message: "이미 존재하는 데이터입니다.",
        },
      };

      response.status(HTTP_STATUS.CONFLICT).json(responseBody);

      return;
    }

    if (error.code == "P2025") {
      const responseBody: ApiErrorResponse = {
        success: false,
        error: {
          code: "RESOURCE_NOT_FOUND",
          message: "요청한 데이터를 찾을 수 없습니다.",
        },
      };

      response.status(HTTP_STATUS.NOT_FOUND).json(responseBody);

      return;
    }
  }

  if (env.NODE_ENV !== "production") {
    // 인증 요청의 query/code, 계정 입력값이 예외 객체에 포함될 수 있어 원문을 남기지 않습니다.
    if (request.path.startsWith("/auth")) console.error(`[${request.method}] ${request.path}: 인증 처리 오류`);
    else console.error(`[${request.method}] ${request.path}`, error);
  }

  const responseBody: ApiErrorResponse = {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "서버 내부 오류가 발생했습니다.",
    },
  };

  response.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(responseBody);
};
