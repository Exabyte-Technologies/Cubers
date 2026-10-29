-- Existing profiles start private by section and unreviewed. No existing text
-- becomes publicly readable merely by applying this migration.
ALTER TABLE "User" ADD COLUMN "profileSettings" JSONB NOT NULL DEFAULT '{}',
                   ADD COLUMN "profileRevision" INTEGER NOT NULL DEFAULT 1,
                   ADD COLUMN "profileStatus" TEXT NOT NULL DEFAULT 'DRAFT',
                   ADD COLUMN "profileReason" TEXT;
CREATE INDEX "User_profileStatus_id_idx" ON "User"("profileStatus", "id");
