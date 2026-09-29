-- 기존 복구 질문 원문 hash는 이메일 코드 방식에서 재사용하지 않으므로 승인된 정책에 따라 제거합니다.
DROP TABLE "PasswordRecoveryChallenge";
DROP TYPE "PasswordRecoveryQuestion";

-- 비밀번호 재설정 이메일 코드의 hash·만료·시도·일회성 상태를 저장합니다.
CREATE TABLE "PasswordResetChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PasswordResetChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetChallenge_userId_key" ON "PasswordResetChallenge"("userId");

ALTER TABLE "PasswordResetChallenge" ADD CONSTRAINT "PasswordResetChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
