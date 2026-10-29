-- Bound owner statistics scans without copying moves, footage or new personal data.
CREATE INDEX "Attempt_userId_status_createdAt_id_idx" ON "Attempt"("userId", "status", "createdAt" DESC, "id" DESC);
