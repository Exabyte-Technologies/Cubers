ALTER TABLE "GuidedSolve" ADD COLUMN "puzzle" TEXT NOT NULL DEFAULT '3x3', ADD COLUMN "courseId" TEXT NOT NULL DEFAULT '3-first-solve';
DROP INDEX "GuidedSolve_one_active_input";
CREATE UNIQUE INDEX "GuidedSolve_one_active_input" ON "GuidedSolve"("userId", "puzzle", "input") WHERE "status" = 'ACTIVE';
CREATE INDEX "GuidedSolve_userId_puzzle_createdAt_idx" ON "GuidedSolve"("userId", "puzzle", "createdAt");
