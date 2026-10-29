CREATE TABLE "MediaRecoveryState" (
  "id" UUID PRIMARY KEY, "userId" UUID NOT NULL, "sequence" INTEGER NOT NULL,
  "erasedAt" TIMESTAMP(3), "deadline" TIMESTAMP(3), "attemptId" UUID
);
CREATE INDEX "MediaRecoveryState_userId_idx" ON "MediaRecoveryState"("userId");
CREATE TABLE "ConsentWithdrawalRecovery" (
  "id" UUID PRIMARY KEY, "cutoff" TIMESTAMP(3) NOT NULL, "sequence" INTEGER NOT NULL
);
