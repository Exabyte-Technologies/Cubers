-- Existing keys remain opted out. Leases carry no receipt or user content.
ALTER TABLE "AppAttestationKey"
 ADD COLUMN "receiptAutoRefresh" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "receiptRefreshAt" TIMESTAMP(3),
 ADD COLUMN "receiptRefreshLease" UUID,
 ADD COLUMN "receiptRefreshLeaseUntil" TIMESTAMP(3),
 ADD COLUMN "receiptRefreshFailures" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppAttestationKey" ADD CONSTRAINT "AppAttestationKey_receipt_schedule" CHECK (
 "receiptRefreshFailures" BETWEEN 0 AND 10 AND
 (("receiptRefreshLease" IS NULL AND "receiptRefreshLeaseUntil" IS NULL) OR
  ("receiptRefreshLease" IS NOT NULL AND "receiptRefreshLeaseUntil" IS NOT NULL)) AND
 ((NOT "receiptAutoRefresh" AND "receiptRefreshAt" IS NULL AND
   "receiptRefreshLease" IS NULL AND "receiptRefreshFailures"=0) OR
  ("receiptAutoRefresh" AND "provider"='apple-app-attest' AND "status"='ACTIVE' AND
   "receiptCiphertext" IS NOT NULL AND "publicKeyPem" IS NOT NULL AND
   "receiptRefreshAt" IS NOT NULL AND "receiptRefreshAt" <= "receiptExpiresAt"))
);
CREATE INDEX "AppAttestationKey_receiptAutoRefresh_status_receiptRefreshAt_id_idx"
 ON "AppAttestationKey"("receiptAutoRefresh","status","receiptRefreshAt","id");
