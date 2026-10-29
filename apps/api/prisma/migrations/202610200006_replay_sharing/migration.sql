CREATE TABLE "ReplayShare" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "attemptId" UUID NOT NULL, "guardianId" UUID,
 "guardianRequired" BOOLEAN NOT NULL, "reviewRequired" BOOLEAN NOT NULL,
 "packet" JSONB NOT NULL, "packetDigest" TEXT NOT NULL, "sourceDigest" TEXT NOT NULL,
 "status" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1, "tokenHash" TEXT,
 "guardianApprovedAt" TIMESTAMP(3), "reviewerId" UUID, "reason" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ReplayShare_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ReplayShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ReplayShare_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ReplayShare_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "ReplayShare_bounds" CHECK ("revision">0 AND "expiresAt">"createdAt" AND "expiresAt"<="createdAt"+INTERVAL '7 days' AND
 "status" IN ('PENDING_GUARDIAN','PENDING_REVIEW','READY','REJECTED','CANCELLED','EXPIRED') AND
 "packetDigest"~'^[a-f0-9]{64}$' AND "sourceDigest"~'^[a-f0-9]{64}$' AND
 ("tokenHash" IS NULL OR ("status"='READY' AND "tokenHash"~'^[a-f0-9]{64}$')) AND
 octet_length("packet"::text)<=220000 AND jsonb_typeof("packet")='object' AND "packet" ?& ARRAY['attemptId','puzzle','input','mode','durationMs','createdAt','scramble','moves'] AND "packet"->>'attemptId'="id"::text AND
 ("packet" - ARRAY['attemptId','puzzle','input','mode','durationMs','createdAt','scramble','moves','telemetry'])='{}'::jsonb AND
 (NOT "guardianRequired" OR "reviewRequired") AND
 ("status"<>'READY' OR ((NOT "guardianRequired" OR "guardianApprovedAt" IS NOT NULL) AND (NOT "reviewRequired" OR "reviewerId" IS NOT NULL))))
);
CREATE UNIQUE INDEX "ReplayShare_tokenHash_key" ON "ReplayShare"("tokenHash");
CREATE INDEX "ReplayShare_userId_createdAt_id_idx" ON "ReplayShare"("userId","createdAt" DESC,"id" DESC);
CREATE INDEX "ReplayShare_guardianId_status_createdAt_id_idx" ON "ReplayShare"("guardianId","status","createdAt" DESC,"id" DESC);
CREATE INDEX "ReplayShare_status_createdAt_id_idx" ON "ReplayShare"("status","createdAt" DESC,"id" DESC);
CREATE INDEX "ReplayShare_expiresAt_idx" ON "ReplayShare"("expiresAt");
CREATE FUNCTION guard_replay_share_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."attemptId" IS DISTINCT FROM OLD."attemptId" OR
 NEW."packet" IS DISTINCT FROM OLD."packet" OR NEW."packetDigest" IS DISTINCT FROM OLD."packetDigest" OR NEW."sourceDigest" IS DISTINCT FROM OLD."sourceDigest" OR
 NEW."guardianRequired" IS DISTINCT FROM OLD."guardianRequired" OR NEW."reviewRequired" IS DISTINCT FROM OLD."reviewRequired" OR
 NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" OR
 (NEW."guardianId" IS DISTINCT FROM OLD."guardianId" AND NEW."guardianId" IS NOT NULL) THEN RAISE EXCEPTION 'Replay share snapshot is immutable'; END IF;
 IF OLD."status" IN ('CANCELLED','REJECTED','EXPIRED') AND NEW."status" IS DISTINCT FROM OLD."status" THEN RAISE EXCEPTION 'Closed replay shares cannot revive'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ReplayShare_snapshot_guard" BEFORE UPDATE ON "ReplayShare" FOR EACH ROW EXECUTE FUNCTION guard_replay_share_snapshot();
