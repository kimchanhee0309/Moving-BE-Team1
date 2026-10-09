/**
 * smtp 모드에서 회원가입 인증코드 메일의 수신자·문구와 설정 누락·발송 실패 오류 코드를 검증합니다.
 * 실제 SMTP 서버에는 접속하지 않고 nodemailer transport 경계를 mock합니다.
 */
const mockEnv = {
  PASSWORD_RESET_DELIVERY: "smtp",
  SMTP_HOST: "smtp.example.test" as string | undefined,
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: "test-user",
  SMTP_PASS: "test-password",
  SMTP_FROM: "Moving <no-reply@example.test>",
};

jest.mock("../../src/config/env", () => ({ env: mockEnv }));

const mockSendMail = jest.fn();

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: mockSendMail })) },
}));

import {
  assertSignupEmailConfigured,
  sendSignupEmailCodeEmail,
} from "../../src/modules/auth/auth-email";

describe("Auth signup email verification mail (smtp)", () => {
  beforeEach(() => {
    mockSendMail.mockReset();
    mockEnv.SMTP_HOST = "smtp.example.test";
  });

  test("가입 예정 이메일로 회원가입 인증코드 메일을 보낸다", async () => {
    mockSendMail.mockResolvedValue(undefined);

    await expect(
      sendSignupEmailCodeEmail("user@example.com", "123456"),
    ).resolves.toBeUndefined();

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Moving <no-reply@example.test>",
        to: "user@example.com",
        subject: "[Moving] 회원가입 이메일 인증코드",
        text: expect.stringContaining("123456"),
      }),
    );
  });

  test("SMTP 발송 실패는 원인을 숨기고 EMAIL_VERIFICATION_EMAIL_FAILED(502)로 변환한다", async () => {
    mockSendMail.mockRejectedValue(new Error("smtp credentials rejected"));

    await expect(
      sendSignupEmailCodeEmail("user@example.com", "123456"),
    ).rejects.toMatchObject({
      code: "EMAIL_VERIFICATION_EMAIL_FAILED",
      status: 502,
      message: expect.not.stringContaining("credentials"),
    });
  });

  test("SMTP 설정이 빠지면 발송 전에 EMAIL_VERIFICATION_EMAIL_NOT_CONFIGURED(503)로 중단한다", async () => {
    mockEnv.SMTP_HOST = undefined;
    const notConfigured = expect.objectContaining({
      code: "EMAIL_VERIFICATION_EMAIL_NOT_CONFIGURED",
      status: 503,
    });

    expect(() => assertSignupEmailConfigured()).toThrow(notConfigured);
    await expect(
      sendSignupEmailCodeEmail("user@example.com", "123456"),
    ).rejects.toEqual(notConfigured);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
