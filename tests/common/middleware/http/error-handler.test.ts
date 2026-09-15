/**
 * 전역 오류 처리기가 팀 공통 응답과 배열형 field details를 보존하는지 단위 검증합니다.
 */
import type { NextFunction, Request, Response } from "express";

import { BadRequestError } from "../../../../src/common/errors/app-error";
import { errorHandler } from "../../../../src/common/middleware/http/error-handler";

describe("Error handler", () => {
  test("AppError를 공통 오류 응답으로 직렬화한다", () => {
    const request = {
      method: "POST",
      originalUrl: "/auth/signup",
    } as Request;
    const response = {
      headersSent: false,
      status: jest.fn(),
      json: jest.fn(),
    } as unknown as Response;
    const next: NextFunction = jest.fn();

    jest.mocked(response.status).mockReturnValue(response);

    errorHandler(
      new BadRequestError(
        "요청값이 올바르지 않습니다.",
        "VALIDATION_ERROR",
        [{ field: "email", reason: "올바른 이메일 형식이 아닙니다." }],
      ),
      request,
      response,
      next,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "요청값이 올바르지 않습니다.",
        details: [
          { field: "email", reason: "올바른 이메일 형식이 아닙니다." },
        ],
      },
    });
  });
});
