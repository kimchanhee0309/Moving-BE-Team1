-- 회원가입 전 이메일 소유 확인 코드의 hash·만료·시도 횟수·검증 상태를 이메일 기준으로 저장합니다.
-- 가입 전에는 User가 없으므로 FK를 두지 않으며, 기존 테이블과 데이터는 변경하지 않습니다.
CREATE TABLE "SignupEmailVerification" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SignupEmailVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignupEmailVerification_email_key" ON "SignupEmailVerification"("email");

-- 만료된 기록을 발송 요청 때 정리하기 위한 인덱스입니다.
CREATE INDEX "SignupEmailVerification_expiresAt_idx" ON "SignupEmailVerification"("expiresAt");
