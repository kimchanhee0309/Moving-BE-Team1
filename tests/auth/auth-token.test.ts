/**
 * JWT의 서명, 사용자 payload, Access/Refresh 용도 분리와 만료 오류를 검증합니다.
 */
import { UnauthorizedError } from "../../src/common/errors/app-error";
import {
  createAuthTokens,
  createToken,
  verifyToken,
} from "../../src/common/utils/auth-token";

describe("Auth token", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("Access Token에서 최소 인증 payload를 복원한다", () => {
    const token = createToken("user-id", "CUSTOMER", "access");

    expect(verifyToken(token, "access")).toEqual({
      userId: "user-id",
      role: "CUSTOMER",
      tokenType: "access",
      sessionId: expect.any(String),
      refreshTokenId: null,
    });
  });

  test("한 쌍의 Access와 Refresh는 같은 세션과 Refresh 회전 식별자를 가진다", () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const refreshTokenId = "22222222-2222-4222-8222-222222222222";
    const tokens = createAuthTokens(
      "user-id",
      "CUSTOMER",
      sessionId,
      refreshTokenId,
    );

    expect(verifyToken(tokens.accessToken, "access")).toMatchObject({
      sessionId,
      refreshTokenId: null,
    });
    expect(verifyToken(tokens.refreshToken, "refresh")).toMatchObject({
      sessionId,
      refreshTokenId,
    });
  });

  test("Refresh Token을 Access Token으로 사용할 수 없다", () => {
    const tokens = createAuthTokens("user-id", "MOVER");

    expect(() => verifyToken(tokens.refreshToken, "access")).toThrow(
      UnauthorizedError,
    );
  });

  test("만료된 Access Token은 전용 오류 코드로 거절한다", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = createToken("user-id", "CUSTOMER", "access");
    jest.setSystemTime(new Date("2026-01-01T00:31:00.000Z"));

    expect.assertions(1);

    try {
      verifyToken(token, "access");
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError) {
        expect(error.code).toBe("ACCESS_TOKEN_EXPIRED");
      }
    }
  });
});
