CREATE TABLE "LessonSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "lessonId" TEXT NOT NULL,
  "puzzle" TEXT NOT NULL,
  "input" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL,
  "courseVersion" INTEGER NOT NULL,
  "moves" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'PREPARING',
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "LessonSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LessonSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LessonSession_userId_createdAt_idx" ON "LessonSession"("userId", "createdAt");
