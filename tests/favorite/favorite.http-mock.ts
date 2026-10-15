/**
 * Favorite Controller 단위 테스트용 HTTP mock입니다.
 * Express Request/Response 전체를 재구성하지 않고, Controller가 실제로 읽는 필드만 타입으로 고정합니다.
 *
 * 담당하지 않는 범위: 실제 HTTP 서버, cookie 파싱, 전역 error handler
 */
import type { Request } from "express";

import type { SendableHttpResponse } from "../../src/common/response/api-response";
import type { ProfileAuthContext } from "../../src/common/utils/auth-context";

/** Favorite Controller가 읽는 요청 필드입니다. auth.profileId는 profiled guard 통과를 가정합니다. */
export interface FavoriteHttpRequest {
  auth: ProfileAuthContext;
  params: Request["params"];
  query: Request["query"];
}

/**
 * sendSuccess/sendNoContent 체이닝을 검증하는 응답 mock입니다.
 * status/json/send는 같은 mock 객체를 반환합니다.
 */
export interface FavoriteHttpResponse extends SendableHttpResponse {
  status: jest.Mock<FavoriteHttpResponse, [number]>;
  json: jest.Mock<FavoriteHttpResponse, [unknown]>;
  send: jest.Mock<FavoriteHttpResponse, [unknown?]>;
}

/** 프로필이 있는 CUSTOMER 요청 mock을 만듭니다. */
export function createFavoriteRequest(
  overrides: Partial<FavoriteHttpRequest> = {},
): FavoriteHttpRequest {
  return {
    auth: {
      userId: "user-id",
      role: "CUSTOMER",
      profileId: "customer-id",
    },
    params: {},
    query: {},
    ...overrides,
  };
}

/** status/json/send 호출을 검증할 수 있는 응답 mock을 만듭니다. */
export function createFavoriteResponse(): FavoriteHttpResponse {
  const response: FavoriteHttpResponse = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
  };

  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  response.send.mockReturnValue(response);

  return response;
}
