/**
 * 도메인 Controller가 인증 컨텍스트를 안전하게 읽고 profile 미등록 상태를 놓치지 않는지 검증합니다.
 */
import type { Request } from "express";

import {
  getAuthContext,
  getProfileAuthContext,
} from "../../src/common/utils/auth-context";

describe("Auth context", () => {
  test("authenticate가 없으면 ACCESS_TOKEN_MISSING으로 거절한다", () => {
    expect(() => getAuthContext({} as Request)).toThrow(
      expect.objectContaining({ code: "ACCESS_TOKEN_MISSING" }),
    );
  });

  test("검증된 userId와 role을 그대로 반환한다", () => {
    const request = {
      auth: { userId: "user-id", role: "CUSTOMER" },
    } as Request;

    expect(getAuthContext(request)).toEqual(request.auth);
  });

  test("requireProfile이 설정한 profileId가 없으면 PROFILE_REQUIRED로 거절한다", () => {
    const request = {
      auth: { userId: "user-id", role: "MOVER" },
    } as Request;

    expect(() => getProfileAuthContext(request)).toThrow(
      expect.objectContaining({ code: "PROFILE_REQUIRED" }),
    );
  });

  test("profileId까지 있는 인증 주체를 Service 입력으로 반환한다", () => {
    const request = {
      auth: {
        userId: "user-id",
        role: "MOVER",
        profileId: "mover-profile-id",
      },
    } as Request;

    expect(getProfileAuthContext(request)).toEqual(request.auth);
  });
});
