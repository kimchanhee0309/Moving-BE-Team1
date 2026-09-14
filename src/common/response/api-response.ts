import type { Response } from "express";

import type { ErrorDetails } from "../errors/app-error";

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/** 전역 오류 처리기가 모든 도메인에서 유지하는 공통 실패 응답 계약입니다. */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ErrorDetails;
  };
}

export function sendSuccess<T>(response: Response, status: number, data: T) {
  const responseBody: ApiSuccessResponse<T> = {
    success: true,
    data,
  };

  return response.status(status).json(responseBody);
}

export function sendNoContent(response: Response) {
  return response.status(204).send();
}
