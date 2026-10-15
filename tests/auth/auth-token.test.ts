/**
 * JWT의 서명, 사용자 payload, Access/Refresh 용도 분리와 만료 오류를 검증합니다.
 */
import { UnauthorizedError } from "../../src/common/errors/app-error";
import { env } from "../../src/config/env";
import jwt from "jsonwebtoken";
import {
  createAuthTokens,
  createToken,
  verifyToken,
} from "../../src/common/utils/auth-token";

describe("Auth token", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("이번 배포 이전 형식처럼 세션 식별자가 없는 Access Token을 검증한다", () => {
    const token = jwt.sign(
      { role: "CUSTOMER", tokenType: "access" },
      env.ACCESS_TOKEN_SECRET,
      {
        algorithm: "HS256",
        expiresIn: 60,
        issuer: env.JWT_ISSUER,
        subject: "user-id",
      },
    );

    expect(verifyToken(token, "access")).toEqual({
      userId: "user-id",
      role: "CUSTOMER",
      tokenType: "access",
    });
  });

  test("Access와 Refresh Token은 DB 세션 식별자 없이 stateless payload만 가진다", () => {
    const tokens = createAuthTokens("user-id", "CUSTOMER");

    expect(verifyToken(tokens.accessToken, "access")).toEqual({
      userId: "user-id",
      role: "CUSTOMER",
      tokenType: "access",
    });
    expect(verifyToken(tokens.refreshToken, "refresh")).toEqual({
      userId: "user-id",
      role: "CUSTOMER",
      tokenType: "refresh",
    });
  });

  test("같은 초에 Refresh해도 jti로 Access와 Refresh Token을 실제 회전한다", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-30T00:00:00.000Z"));
    const previous = createAuthTokens("user-id", "CUSTOMER");
    const rotated = createAuthTokens("user-id", "CUSTOMER");

    expect(rotated.accessToken).not.toBe(previous.accessToken);
    expect(rotated.refreshToken).not.toBe(previous.refreshToken);
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
