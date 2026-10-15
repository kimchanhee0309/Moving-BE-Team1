-- CreateEnum
CREATE TYPE "PasswordRecoveryQuestion" AS ENUM ('CHILDHOOD_NICKNAME', 'MEMORABLE_PLACE', 'PERSONAL_PHRASE');

-- CreateTable
CREATE TABLE "PasswordRecoveryChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "question" "PasswordRecoveryQuestion" NOT NULL,
    "answerHash" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PasswordRecoveryChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordRecoveryChallenge_userId_key" ON "PasswordRecoveryChallenge"("userId");

-- AddForeignKey
ALTER TABLE "PasswordRecoveryChallenge" ADD CONSTRAINT "PasswordRecoveryChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
