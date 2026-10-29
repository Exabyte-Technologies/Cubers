CREATE TYPE "AchievementCardStatus" AS ENUM ('PENDING_GUARDIAN','PENDING_REVIEW','READY','REJECTED','CANCELLED');
CREATE TABLE "AchievementCard" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "guardianId" UUID,
  "achievementId" TEXT NOT NULL, "locale" TEXT NOT NULL, "namedLabel" TEXT, "namedRevision" INTEGER,
  "templateVersion" INTEGER NOT NULL DEFAULT 1, "imageDigest" TEXT NOT NULL,
  "status" "AchievementCardStatus" NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT, "reviewerId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AchievementCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AchievementCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AchievementCard_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AchievementCard_userId_createdAt_id_idx" ON "AchievementCard"("userId","createdAt" DESC,"id" DESC);
CREATE INDEX "AchievementCard_guardianId_status_createdAt_id_idx" ON "AchievementCard"("guardianId","status","createdAt" DESC,"id" DESC);
CREATE INDEX "AchievementCard_status_createdAt_id_idx" ON "AchievementCard"("status","createdAt" DESC,"id" DESC);
