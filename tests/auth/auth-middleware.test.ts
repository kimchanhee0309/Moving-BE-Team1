/**
 * 인증·역할 미들웨어가 누락 토큰을 거절하고 검증된 역할만 다음 단계로 전달하는지 확인합니다.
 */
import type { NextFunction, Request, Response } from "express";

import { UnauthorizedError } from "../../src/common/errors/app-error";
import { authenticate } from "../../src/common/middleware/authenticate";
import { authorize } from "../../src/common/middleware/authorize";

const response = {} as Response;

describe("Auth middleware", () => {
  test("Access Token이 없으면 인증을 거절한다", () => {
    const request = { cookies: {} } as Request;
    const next: NextFunction = jest.fn();

    authenticate(request, response, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  test("허용된 역할은 다음 미들웨어로 진행한다", () => {
    const request = {
      auth: { userId: "user-id", role: "CUSTOMER" },
    } as Request;
    const next: NextFunction = jest.fn();

    authorize("CUSTOMER")(request, response, next);

    expect(next).toHaveBeenCalledWith();
  });

  test("허용되지 않은 역할은 ROLE_MISMATCH로 거절한다", () => {
    const request = {
      auth: { userId: "user-id", role: "MOVER" },
    } as Request;
    const next: NextFunction = jest.fn();

    authorize("CUSTOMER")(request, response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ROLE_MISMATCH" }),
    );
  });
});
