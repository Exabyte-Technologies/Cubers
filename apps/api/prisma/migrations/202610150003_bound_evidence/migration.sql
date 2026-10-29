ALTER TABLE "Attempt" ADD COLUMN "recordingAt" TIMESTAMP(3);
ALTER TABLE "Attempt" ADD COLUMN "scrambleVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Attempt" ADD COLUMN "finalScanVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Media" ADD COLUMN "attemptId" UUID;
ALTER TABLE "Media" ADD COLUMN "durationMs" INTEGER;
CREATE INDEX "Media_attemptId_idx" ON "Media"("attemptId");
