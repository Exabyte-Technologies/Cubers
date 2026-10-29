ALTER TABLE "RecoveryBinding" ADD COLUMN "restoredSnapshotId" UUID, ADD COLUMN "restoredSource" TEXT;
CREATE TABLE "MediaRestoreBatch" (
  "id" UUID PRIMARY KEY, "bundleId" UUID NOT NULL, "snapshotId" UUID NOT NULL,
  "indexDigest" TEXT NOT NULL, "bucket" TEXT NOT NULL UNIQUE, "storage" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'INCOMPLETE', "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "MediaRestoreFile" (
  "batchId" UUID NOT NULL REFERENCES "MediaRestoreBatch"("id") ON DELETE CASCADE,
  "objectId" UUID NOT NULL, "mediaId" UUID NOT NULL, "userId" UUID NOT NULL,
  "key" TEXT NOT NULL, "sha256" TEXT NOT NULL, "type" TEXT NOT NULL, "size" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("batchId","objectId")
);
CREATE INDEX "MediaRestoreFile_expiresAt_idx" ON "MediaRestoreFile"("expiresAt");
