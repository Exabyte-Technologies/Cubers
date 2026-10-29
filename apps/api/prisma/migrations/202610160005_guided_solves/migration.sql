CREATE TABLE "GuidedSolve" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "input" TEXT NOT NULL,
  "courseVersion" INTEGER NOT NULL, "initialFaces" JSONB NOT NULL,
  "currentFaces" JSONB NOT NULL, "checkpointFaces" JSONB NOT NULL, "plan" JSONB NOT NULL,
  "stage" INTEGER NOT NULL DEFAULT 0, "stageMoves" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "moves" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "checkpoints" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "finishedAt" TIMESTAMP(3),
  CONSTRAINT "GuidedSolve_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuidedSolve_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GuidedSolve_userId_createdAt_idx" ON "GuidedSolve"("userId", "createdAt");
CREATE INDEX "GuidedSolve_status_expiresAt_idx" ON "GuidedSolve"("status", "expiresAt");
CREATE UNIQUE INDEX "GuidedSolve_one_active_input" ON "GuidedSolve"("userId", "input") WHERE "status" = 'ACTIVE';
