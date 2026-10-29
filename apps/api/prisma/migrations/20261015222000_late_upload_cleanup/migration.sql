CREATE TABLE "ObjectRemoval" (
  "id" UUID NOT NULL,
  "keys" TEXT[],
  "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ObjectRemoval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ObjectRemoval_retryAt_idx" ON "ObjectRemoval"("retryAt");
