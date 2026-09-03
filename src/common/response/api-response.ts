import type { Response } from "express";

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
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
