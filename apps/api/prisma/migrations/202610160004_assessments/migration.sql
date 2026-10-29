CREATE TABLE "LearningAssessment" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "puzzle" TEXT NOT NULL,
  "definitionVersion" TEXT NOT NULL,
  "tasks" JSONB NOT NULL,
  "answers" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "LearningAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LearningAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LearningAssessment_userId_puzzle_createdAt_idx" ON "LearningAssessment"("userId", "puzzle", "createdAt");
CREATE INDEX "LearningAssessment_status_expiresAt_idx" ON "LearningAssessment"("status", "expiresAt");
CREATE UNIQUE INDEX "LearningAssessment_one_active_puzzle" ON "LearningAssessment"("userId", "puzzle") WHERE "status" = 'ACTIVE';
