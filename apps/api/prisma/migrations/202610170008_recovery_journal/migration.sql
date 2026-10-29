BEGIN;
CREATE TABLE "RecoveryBinding" (
 id TEXT NOT NULL DEFAULT 'installation', region TEXT NOT NULL,
 "installationId" UUID NOT NULL, "journalKeyId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (id)
);
CREATE UNIQUE INDEX "RecoveryBinding_installationId_key" ON "RecoveryBinding"("installationId");
CREATE TABLE "DeletionReceipt" (
 id UUID NOT NULL, digest TEXT NOT NULL,
 "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, PRIMARY KEY (id)
);
CREATE INDEX "DeletionReceipt_expiresAt_idx" ON "DeletionReceipt"("expiresAt");
CREATE TABLE "AccountRemoval" (
 id UUID NOT NULL, cursor TEXT, "requestedAt" TIMESTAMP(3) NOT NULL,
 "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, PRIMARY KEY (id)
);
CREATE INDEX "AccountRemoval_retryAt_idx" ON "AccountRemoval"("retryAt");
COMMIT;
