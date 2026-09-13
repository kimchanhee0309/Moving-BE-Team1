/**
 * profile 검사 미들웨어가 역할별 relation을 확인하고 미등록 사용자를 차단하는지 검증합니다.
 */
jest.mock("../../src/common/utils/user-profile", () => ({
  findUserProfileState: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";

import { requireProfile } from "../../src/common/middleware/require-profile";
import { findUserProfileState } from "../../src/common/utils/user-profile";

describe("Require profile middleware", () => {
  test("CUSTOMER profile이 없으면 PROFILE_REQUIRED로 거절한다", async () => {
    jest.mocked(findUserProfileState).mockResolvedValue({
      role: "CUSTOMER",
      customer: null,
      mover: null,
    });
    const request = {
      auth: { userId: "user-id", role: "CUSTOMER" },
    } as Request;
    const response = {} as Response;
    const next: NextFunction = jest.fn();

    await requireProfile(request, response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PROFILE_REQUIRED" }),
    );
  });

  test("MOVER profile이 있으면 다음 단계로 진행한다", async () => {
    jest.mocked(findUserProfileState).mockResolvedValue({
      role: "MOVER",
      customer: null,
      mover: { id: "mover-profile-id" },
    });
    const request = {
      auth: { userId: "user-id", role: "MOVER" },
    } as Request;
    const response = {} as Response;
    const next: NextFunction = jest.fn();

    await requireProfile(request, response, next);

    expect(next).toHaveBeenCalledWith();
    expect(request.auth?.profileId).toBe("mover-profile-id");
  });

  test("Token 역할과 DB 역할이 다르면 오래된 인증 정보로 거절한다", async () => {
    jest.mocked(findUserProfileState).mockResolvedValue({
      role: "MOVER",
      customer: null,
      mover: { id: "mover-profile-id" },
    });
    const request = {
      auth: { userId: "user-id", role: "CUSTOMER" },
    } as Request;
    const response = {} as Response;
    const next: NextFunction = jest.fn();

    await requireProfile(request, response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ACCESS_TOKEN_INVALID" }),
    );
  });
});
