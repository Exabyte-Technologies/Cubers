-- Deletion credentials cannot be reused to read account/community data.
ALTER TABLE "Session" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'FULL';
