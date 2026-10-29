CREATE TABLE "PracticeGoal" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "puzzle" TEXT NOT NULL,
  "input" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "target" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PracticeGoal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PracticeGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PracticeGoal_userId_createdAt_idx" ON "PracticeGoal"("userId", "createdAt");
