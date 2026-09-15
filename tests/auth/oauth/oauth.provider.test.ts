/**
 * 공급자별 응답을 공통 OAuth profile로 최소 매핑하고 이메일 누락을 차단하는지 검증합니다.
 */
import {
  createOAuthAuthorizationUrl,
  fetchOAuthProfile,
} from "../../../src/modules/auth/oauth/oauth.provider";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OAuth provider", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("공급자 인증 URL에는 State와 Client ID만 있고 Secret은 포함하지 않는다", () => {
    const url = new URL(createOAuthAuthorizationUrl("google", "oauth-state"));

    expect(url.searchParams.get("state")).toBe("oauth-state");
    expect(url.searchParams.has("client_id")).toBe(true);
    expect(url.searchParams.has("client_secret")).toBe(false);
  });

  test("Google의 검증된 이메일과 subject만 정규화한다", async () => {
    jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "provider-token" }))
      .mockResolvedValueOnce(jsonResponse({
        sub: "google-id",
        email: "User@Example.com",
        email_verified: true,
        name: "구글 사용자",
      }));

    await expect(fetchOAuthProfile("google", "code", "state")).resolves.toEqual({
      provider: "GOOGLE",
      socialId: "google-id",
      email: "user@example.com",
      name: "구글 사용자",
    });
  });

  test("Kakao 이메일이 누락되면 profile에 이메일을 만들지 않는다", async () => {
    jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "provider-token" }))
      .mockResolvedValueOnce(jsonResponse({
        id: 1234,
        kakao_account: { profile: { nickname: "카카오 사용자" } },
      }));

    await expect(fetchOAuthProfile("kakao", "code", "state")).resolves.toEqual({
      provider: "KAKAO",
      socialId: "1234",
      name: "카카오 사용자",
    });
  });

  test("Naver 응답의 response 객체만 정규화한다", async () => {
    jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "provider-token" }))
      .mockResolvedValueOnce(jsonResponse({
        resultcode: "00",
        response: {
          id: "naver-id",
          email: "naver@example.com",
          nickname: "네이버 사용자",
        },
      }));

    await expect(fetchOAuthProfile("naver", "code", "state")).resolves.toEqual({
      provider: "NAVER",
      socialId: "naver-id",
      email: "naver@example.com",
      name: "네이버 사용자",
    });
  });
});
