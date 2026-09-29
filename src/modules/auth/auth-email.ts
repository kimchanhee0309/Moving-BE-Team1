/**
 * 비밀번호 재설정 코드를 범용 SMTP로 발송합니다.
 * 계정 조회·코드 생성·DB 상태는 다루지 않고 SMTP 자격 증명을 응답이나 로그에 노출하지 않습니다.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import {
  BadGatewayError,
  ServiceUnavailableError,
} from "../../common/errors/app-error";
import { env } from "../../config/env";

let transporter: Transporter | null = null;

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "***";
  return `${localPart.slice(0, 1)}***@${domain}`;
}

function getSmtpConfiguration() {
  if (
    !env.SMTP_HOST ||
    !env.SMTP_USER ||
    !env.SMTP_PASS ||
    !env.SMTP_FROM
  ) {
    throw new ServiceUnavailableError(
      "비밀번호 재설정 메일 설정이 필요합니다.",
      "PASSWORD_RESET_EMAIL_NOT_CONFIGURED",
    );
  }

  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    from: env.SMTP_FROM,
  };
}

/** SMTP 설정이 준비됐는지 코드와 DB 상태를 만들기 전에 검증합니다. */
export function assertPasswordResetEmailConfigured(): void {
  if (env.PASSWORD_RESET_DELIVERY === "console") return;
  getSmtpConfiguration();
}

/**
 * 등록 이메일로 비밀번호 재설정 코드를 발송합니다.
 * @param recipient 수신할 등록 이메일
 * @param code 메일에만 포함할 6자리 코드
 * @returns 발송 완료 Promise
 * @throws SMTP 미설정 시 PASSWORD_RESET_EMAIL_NOT_CONFIGURED, 발송 실패 시 PASSWORD_RESET_EMAIL_FAILED
 * @remarks 외부 SMTP 서버로 수신 주소와 코드가 전송됩니다.
 */
export async function sendPasswordResetCodeEmail(
  recipient: string,
  code: string,
): Promise<void> {
  if (env.PASSWORD_RESET_DELIVERY === "console") {
    console.info(
      `[개발용 비밀번호 재설정 코드] ${maskEmail(recipient)}: ${code}`,
    );
    return;
  }

  const configuration = getSmtpConfiguration();
  transporter ??= nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    auth: configuration.auth,
  });

  try {
    await transporter.sendMail({
      from: configuration.from,
      to: recipient,
      subject: "[Moving] 비밀번호 재설정 인증코드",
      text: `비밀번호 재설정 인증코드는 ${code}입니다. 5분 안에 입력해 주세요. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
      html: `<p>비밀번호 재설정 인증코드는 <strong>${code}</strong>입니다.</p><p>5분 안에 입력해 주세요. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>`,
    });
  } catch {
    throw new BadGatewayError(
      "비밀번호 재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
      "PASSWORD_RESET_EMAIL_FAILED",
    );
  }
}
