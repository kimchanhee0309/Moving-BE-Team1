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

/**
 * sendSuccess/sendNoContent가 실제로 호출하는 응답 메서드입니다.
 * Express Response와 테스트 mock이 같은 계약으로 연결되게 합니다.
 */
export interface SendableHttpResponse {
  status: (code: number) => {
    json: (body: unknown) => unknown;
    send: (body?: unknown) => unknown;
  };
}

export function sendSuccess<T>(
  response: SendableHttpResponse,
  status: number,
  data: T,
) {
  const responseBody: ApiSuccessResponse<T> = {
    success: true,
    data,
  };

  return response.status(status).json(responseBody);
}

export function sendNoContent(response: SendableHttpResponse) {
  return response.status(204).send();
}
