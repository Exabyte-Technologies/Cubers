CREATE TYPE "NotificationCategory" AS ENUM ('SYSTEM','REVIEW','CONNECTION','CLUB');
ALTER TABLE "User" ADD COLUMN "notificationSettings" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "notificationRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Notification" ADD COLUMN "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM';
UPDATE "Notification" SET "category"='CONNECTION' WHERE "title"='Connection update · 关系申请更新';
UPDATE "Notification" SET "category"='CLUB' WHERE "title"='Club membership updated · 社团成员申请有更新';
UPDATE "Notification" SET "category"='REVIEW' WHERE "title" IN ('Post review updated · 帖子审核有更新','Club review updated · 社团审核有更新','Reply review updated · 回复审核有更新','Profile review updated · 个人页审核有更新');
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId","createdAt" DESC,"id" DESC);
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId","read","createdAt");
