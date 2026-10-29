ALTER TABLE "Post" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DISCUSSION';
ALTER TABLE "Club" ADD COLUMN "inviteCode" TEXT;
ALTER TABLE "Club" ADD COLUMN "reason" TEXT;
ALTER TABLE "Club" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
UPDATE "Club" SET "inviteCode" = gen_random_uuid()::text;
ALTER TABLE "Club" ALTER COLUMN "inviteCode" SET NOT NULL;
CREATE UNIQUE INDEX "Club_inviteCode_key" ON "Club"("inviteCode");
