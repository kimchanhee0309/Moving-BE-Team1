-- 기존 계정은 이메일 인증코드만으로 복구할 수 있도록 질문과 답변을 nullable로 둡니다.
CREATE TYPE "PasswordRecoveryQuestion" AS ENUM ('CHILDHOOD_NICKNAME', 'MEMORABLE_PLACE', 'PERSONAL_PHRASE');

ALTER TABLE "User"
  ADD COLUMN "recoveryQuestion" "PasswordRecoveryQuestion",
  ADD COLUMN "recoveryAnswerHash" VARCHAR(255);

-- 질문 답변은 코드 검증 이후에도 한 challenge에서 최대 5회만 시도합니다.
ALTER TABLE "PasswordResetChallenge"
  ADD COLUMN "recoveryAnswerAttempts" INTEGER NOT NULL DEFAULT 0;
