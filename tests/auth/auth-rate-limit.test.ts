/**
 * Auth IP limiter를 실제 Express 응답 완료 흐름으로 검증합니다.
 * 각 테스트 전 모든 사용 IP 키를 초기화해 singleton MemoryStore 상태가 시나리오 사이에 남지 않게 합니다.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import express from "express";

import { errorHandler } from "../../src/common/middleware/http/error-handler";
import {
  accountRecoveryRateLimiter,
  loginRateLimiter,
  markOptionalSessionRefreshFailure,
  passwordResetCodeSendRateLimiter,
  passwordResetCodeVerifyRateLimiter,
  refreshRateLimiter,
  sessionRefreshRateLimiter,
} from "../../src/modules/auth/auth-rate-limit";

const TEST_IPS = [
  "192.0.2.10",
  "192.0.2.11",
  "192.0.2.12",
  "192.0.2.13",
  "192.0.2.14",
  "192.0.2.15",
  "192.0.2.16",
] as const;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

interface TestHttpResponse {
  body: unknown;
  rateLimitPolicy: string | null;
  status: number;
}

const app = express();
app.set("trust proxy", 1);

app.post("/auth/refresh/session", sessionRefreshRateLimiter, (request, response) => {
  const outcome = request.get("x-test-session-outcome");

  if (outcome === "invalid-refresh") {
    markOptionalSessionRefreshFailure(request);
  }

  return response.status(200).json({
    success: true,
    data: { user: outcome === "guest" || outcome === "invalid-refresh" ? null : { id: "user-id" } },
  });
});

app.post("/auth/refresh", refreshRateLimiter, (request, response) => {
  if (request.get("x-test-refresh-outcome") === "valid") {
    return response.status(200).json({ success: true });
  }

  return response.status(401).json({ success: false });
});

app.post("/auth/login", loginRateLimiter, (_request, response) => {
  return response.status(401).json({ success: false });
});

app.post("/auth/recovery/password/confirm", accountRecoveryRateLimiter, (_request, response) => {
  return response.status(200).json({ success: true });
});

app.post("/auth/recovery/password/code", passwordResetCodeSendRateLimiter, (_request, response) => {
  return response.status(200).json({ success: true });
});

app.post("/auth/recovery/password/code/verify", passwordResetCodeVerifyRateLimiter, (_request, response) => {
  return response.status(401).json({ success: false });
});

app.use(errorHandler);

let server: Server | null = null;
let baseUrl = "";

async function post(
  path: string,
  ip: string,
  headers: Readonly<Record<string, string>> = {},
): Promise<TestHttpResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      ...headers,
    },
  });
  const body: unknown = await response.json();

  // finish listener가 정상 요청을 store에서 차감할 microtask까지 완료시킵니다.
  await new Promise<void>((resolve) => setImmediate(resolve));

  return {
    body,
    rateLimitPolicy: response.headers.get("ratelimit-policy"),
    status: response.status,
  };
}

async function repeatRequest(
  count: number,
  operation: () => Promise<TestHttpResponse>,
): Promise<TestHttpResponse[]> {
  const responses: TestHttpResponse[] = [];

  for (let index = 0; index < count; index += 1) {
    responses.push(await operation());
  }

  return responses;
}

describe("Auth rate limit", () => {
  beforeAll(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", resolve));

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Auth limiter 테스트 서버 포트를 확인할 수 없습니다.");
    }

    baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  });

  beforeEach(() => {
    // MemoryStore는 middleware singleton에 속하므로 모든 테스트 키를 명시적으로 격리합니다.
    for (const ip of TEST_IPS) {
      sessionRefreshRateLimiter.resetKey(ip);
      refreshRateLimiter.resetKey(ip);
      loginRateLimiter.resetKey(ip);
      accountRecoveryRateLimiter.resetKey(ip);
      passwordResetCodeSendRateLimiter.resetKey(ip);
      passwordResetCodeVerifyRateLimiter.resetKey(ip);
    }
  });

  afterAll(async () => {
    const activeServer = server;
    if (!activeServer) return;

    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  test("쿠키 없는 비회원 세션 확인을 반복해도 200 user null을 유지한다", async () => {
    const responses = await repeatRequest(35, () =>
      post("/auth/refresh/session", TEST_IPS[0], {
        "x-test-session-outcome": "guest",
      }),
    );

    expect(responses.every(({ status }) => status === 200)).toBe(true);
    expect(responses.at(-1)?.body).toEqual({
      success: true,
      data: { user: null },
    });
    expect(responses[0]?.rateLimitPolicy).toBe("30;w=900");
  });

  test("유효한 Access 세션 확인과 유효한 Refresh 회전을 반복해도 제한하지 않는다", async () => {
    const sessionResponses = await repeatRequest(35, () =>
      post("/auth/refresh/session", TEST_IPS[1], {
        "x-test-session-outcome": "access",
      }),
    );
    const refreshResponses = await repeatRequest(35, () =>
      post("/auth/refresh", TEST_IPS[1], {
        "x-test-refresh-outcome": "valid",
      }),
    );

    expect(sessionResponses.every(({ status }) => status === 200)).toBe(true);
    expect(refreshResponses.every(({ status }) => status === 200)).toBe(true);
  });

  test("잘못된 Refresh Token의 선택 세션 요청은 30회 이후 제한한다", async () => {
    const allowedResponses = await repeatRequest(30, () =>
      post("/auth/refresh/session", TEST_IPS[2], {
        "x-test-session-outcome": "invalid-refresh",
      }),
    );
    const limitedResponse = await post("/auth/refresh/session", TEST_IPS[2], {
      "x-test-session-outcome": "invalid-refresh",
    });

    expect(allowedResponses.every(({ status }) => status === 200)).toBe(true);
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body).toMatchObject({
      error: { code: "AUTH_RATE_LIMIT_EXCEEDED" },
    });
  });

  test("선택 세션 요청 횟수는 강제 Refresh 제한 횟수를 소비하지 않는다", async () => {
    await repeatRequest(30, () =>
      post("/auth/refresh/session", TEST_IPS[3], {
        "x-test-session-outcome": "invalid-refresh",
      }),
    );

    const refreshResponse = await post("/auth/refresh", TEST_IPS[3]);

    expect(refreshResponse.status).toBe(401);
  });

  test("강제 Refresh 요청 횟수는 선택 세션 제한 횟수를 소비하지 않는다", async () => {
    await repeatRequest(30, () => post("/auth/refresh", TEST_IPS[4]));

    const sessionResponse = await post("/auth/refresh/session", TEST_IPS[4], {
      "x-test-session-outcome": "invalid-refresh",
    });

    expect(sessionResponse.status).toBe(200);
  });

  test("로그인 실패와 계정 복구 limiter의 기존 한도를 유지한다", async () => {
    const loginResponses = await repeatRequest(6, () =>
      post("/auth/login", TEST_IPS[5]),
    );
    const recoveryResponses = await repeatRequest(11, () =>
      post("/auth/recovery/password/confirm", TEST_IPS[5]),
    );

    expect(loginResponses.slice(0, 5).every(({ status }) => status === 401)).toBe(true);
    expect(loginResponses[5]?.status).toBe(429);
    expect(recoveryResponses.slice(0, 10).every(({ status }) => status === 200)).toBe(true);
    expect(recoveryResponses[10]?.status).toBe(429);
  });

  test("코드 발송과 검증은 각각 5회로 제한하며 서로 횟수를 공유하지 않는다", async () => {
    const sendResponses = await repeatRequest(6, () =>
      post("/auth/recovery/password/code", TEST_IPS[6]),
    );
    const verifyResponses = await repeatRequest(6, () =>
      post("/auth/recovery/password/code/verify", TEST_IPS[6]),
    );

    expect(sendResponses.slice(0, 5).every(({ status }) => status === 200)).toBe(true);
    expect(sendResponses[5]?.status).toBe(429);
    expect(verifyResponses.slice(0, 5).every(({ status }) => status === 401)).toBe(true);
    expect(verifyResponses[5]?.status).toBe(429);
  });

  test("15분 제한 시간이 지나면 잘못된 Refresh 요청을 다시 처리한다", async () => {
    const now = 1_000_000;
    const dateNow = jest.spyOn(Date, "now").mockReturnValue(now);

    try {
      await repeatRequest(30, () => post("/auth/refresh", TEST_IPS[6]));
      expect((await post("/auth/refresh", TEST_IPS[6])).status).toBe(429);

      dateNow.mockReturnValue(now + FIFTEEN_MINUTES_MS + 1);

      expect((await post("/auth/refresh", TEST_IPS[6])).status).toBe(401);
    } finally {
      dateNow.mockRestore();
    }
  });
});
