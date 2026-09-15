/**
 * OAuth 시작 입력에서 공급자·역할·내부 redirect 허용 목록을 검증합니다.
 * 외부 URL이나 역할 위조가 State에 들어가지 않는 경계를 확인합니다.
 */
import { parseOAuthStartInput } from "../../../src/modules/auth/oauth/oauth.validator";

describe("OAuth validator", () => {
  test("CUSTOMER 역할과 같은 사이트 redirect를 정규화한다", () => {
    expect(
      parseOAuthStartInput("google", {
        role: "CUSTOMER",
        redirect: "/move-request?step=1",
        format: "json",
      }),
    ).toEqual({
      provider: "google",
      role: "CUSTOMER",
      redirect: "/move-request?step=1",
      responseFormat: "json",
    });
  });

  test("허용하지 않는 역할을 거절한다", () => {
    expect(() => parseOAuthStartInput("kakao", { role: "ADMIN" })).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  test("외부 및 인증 순환 redirect를 거절한다", () => {
    for (const redirect of ["https://evil.example", "//evil.example", "/login/customer"]) {
      expect(() =>
        parseOAuthStartInput("naver", { role: "MOVER", redirect }),
      ).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR" }));
    }
  });
});
