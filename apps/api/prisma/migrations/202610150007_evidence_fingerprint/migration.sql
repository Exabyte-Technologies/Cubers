ALTER TABLE "Media" ADD COLUMN "evidenceFingerprint" TEXT;
UPDATE "Media" SET "evidenceFingerprint" = "sha256" WHERE "purpose" = 'evidence';
DROP INDEX "Media_sha256_key";
CREATE INDEX "Media_sha256_idx" ON "Media"("sha256");
CREATE UNIQUE INDEX "Media_evidenceFingerprint_key" ON "Media"("evidenceFingerprint");
