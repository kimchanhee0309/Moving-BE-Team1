/** 개발용 메일 경계가 외부 SMTP 없이 마스킹된 수신자와 인증코드를 출력하는지 검증합니다. */
jest.mock("../../src/config/env", () => ({
  env: { PASSWORD_RESET_DELIVERY: "console" },
}));

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

import nodemailer from "nodemailer";

import {
  assertPasswordResetEmailConfigured,
  sendPasswordResetCodeEmail,
} from "../../src/modules/auth/auth-email";

describe("Auth password reset email", () => {
  test("console 모드는 SMTP를 만들지 않고 이메일을 마스킹해 코드를 출력한다", async () => {
    const consoleInfo = jest.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      expect(() => assertPasswordResetEmailConfigured()).not.toThrow();
      await expect(
        sendPasswordResetCodeEmail("user@example.com", "123456"),
      ).resolves.toBeUndefined();

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(consoleInfo).toHaveBeenCalledWith(
        "[개발용 비밀번호 재설정 코드] u***@example.com: 123456",
      );
    } finally {
      consoleInfo.mockRestore();
    }
  });
});
