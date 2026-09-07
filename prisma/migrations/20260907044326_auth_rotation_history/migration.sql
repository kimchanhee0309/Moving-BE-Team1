-- CreateTable
CREATE TABLE "SessionToken" (
    "hash" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "SessionToken_pkey" PRIMARY KEY ("hash")
);

-- CreateIndex
CREATE INDEX "SessionToken_sessionId_idx" ON "SessionToken"("sessionId");

-- AddForeignKey
ALTER TABLE "SessionToken" ADD CONSTRAINT "SessionToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
