import { HTTP_STATUS } from "../constants/http-status";

export interface ErrorDetails {
  [field: string]: string | string[];
}

interface AppErrorOptions {
  status: number;
  code: string;
  message: string;
  details?: ErrorDetails;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: ErrorDetails;

  constructor({ status, code, message, details }: AppErrorOptions) {
    super(message);

    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, AppError);
  }
}

export class BadRequestError extends AppError {
  constructor(
    message = "잘못된 요청입니다.",
    code = "BAD_REQUEST",
    details?: ErrorDetails,
  ) {
    super({
      status: HTTP_STATUS.BAD_REQUEST,
      code,
      message,
      details,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "로그인이 필요합니다.", code = "UNAUTHORIZED") {
    super({
      status: HTTP_STATUS.UNAUTHORIZED,
      code,
      message,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "접근 권한이 없습니다.", code = "FORBIDDEN") {
    super({
      status: HTTP_STATUS.FORBIDDEN,
      code,
      message,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = "요청한 데이터를 찾을 수 없습니다.",
    code = "NOT_FOUND",
  ) {
    super({
      status: HTTP_STATUS.NOT_FOUND,
      code,
      message,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = "요청이 현재 상태와 충돌합니다.", code = "CONFLICT") {
    super({
      status: HTTP_STATUS.CONFLICT,
      code,
      message,
    });
  }
}
