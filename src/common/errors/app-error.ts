import { HTTP_STATUS } from "../constants/http-status";

/**
 * API 명세가 정한 필드별 검증 오류 한 건입니다.
 * 클라이언트는 field로 입력 항목을 찾고 reason을 사용자에게 표시합니다.
 */
export interface ErrorDetail {
  field: string;
  reason: string;
}

export type ErrorDetails = ErrorDetail[];

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

/** 인증처럼 공격 표면이 큰 API의 호출 한도를 초과했을 때 사용합니다. */
export class TooManyRequestsError extends AppError {
  constructor(
    message = "요청이 너무 많습니다.",
    code = "AUTH_RATE_LIMIT_EXCEEDED",
  ) {
    super({
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
      code,
      message,
    });
  }
}

/** 외부 OAuth 공급자가 정상 응답을 주지 못했을 때 내부 내용을 숨겨 반환합니다. */
export class BadGatewayError extends AppError {
  constructor(
    message = "외부 인증 서비스 응답을 확인할 수 없습니다.",
    code = "OAUTH_PROVIDER_ERROR",
  ) {
    super({
      status: HTTP_STATUS.BAD_GATEWAY,
      code,
      message,
    });
  }
}

/** 필수 외부 서비스 설정이 없어 현재 요청을 처리할 수 없을 때 사용합니다. */
export class ServiceUnavailableError extends AppError {
  constructor(message = "현재 서비스를 이용할 수 없습니다.", code = "SERVICE_UNAVAILABLE") {
    super({
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      code,
      message,
    });
  }
}
