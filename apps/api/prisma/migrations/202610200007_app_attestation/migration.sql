-- CreateTable
CREATE TABLE "AppAttestationKey" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "keyIdHash" TEXT NOT NULL,
    "publicKeyHash" TEXT NOT NULL,
    "publicKeyPem" TEXT,
    "appId" TEXT NOT NULL,
    "distribution" TEXT NOT NULL,
    "enrolledBundleVersion" TEXT NOT NULL,
    "bundleVersion" TEXT NOT NULL,
    "policyDigest" TEXT NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "receiptCiphertext" TEXT,
    "receiptExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppAttestationKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppAttestationChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "keyId" UUID,
    "attemptId" UUID,
    "provider" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "operation" TEXT,
    "keyIdHash" TEXT,
    "policyDigest" TEXT NOT NULL,
    "contextDigest" TEXT NOT NULL,
    "payloadDigest" TEXT,
    "attemptVersion" INTEGER,
    "attemptDigest" TEXT,
    "challengeHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AppAttestationChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppAttestationGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "keyId" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "policyDigest" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "attemptDigest" TEXT NOT NULL,
    "attemptVersion" INTEGER NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "AppAttestationGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppAttestationKey_keyIdHash_key" ON "AppAttestationKey"("keyIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "AppAttestationKey_publicKeyHash_key" ON "AppAttestationKey"("publicKeyHash");

-- CreateIndex
CREATE INDEX "AppAttestationKey_userId_createdAt_id_idx" ON "AppAttestationKey"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AppAttestationKey_status_receiptExpiresAt_idx" ON "AppAttestationKey"("status", "receiptExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppAttestationChallenge_challengeHash_key" ON "AppAttestationChallenge"("challengeHash");

-- CreateIndex
CREATE INDEX "AppAttestationChallenge_userId_status_expiresAt_idx" ON "AppAttestationChallenge"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AppAttestationChallenge_createdAt_idx" ON "AppAttestationChallenge"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppAttestationGrant_challengeId_key" ON "AppAttestationGrant"("challengeId");

-- CreateIndex
CREATE INDEX "AppAttestationGrant_userId_expiresAt_idx" ON "AppAttestationGrant"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AppAttestationGrant_expiresAt_idx" ON "AppAttestationGrant"("expiresAt");

-- AddForeignKey
ALTER TABLE "AppAttestationKey" ADD CONSTRAINT "AppAttestationKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAttestationChallenge" ADD CONSTRAINT "AppAttestationChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAttestationChallenge" ADD CONSTRAINT "AppAttestationChallenge_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAttestationChallenge" ADD CONSTRAINT "AppAttestationChallenge_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "AppAttestationKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAttestationChallenge" ADD CONSTRAINT "AppAttestationChallenge_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAttestationGrant" ADD CONSTRAINT "AppAttestationGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAttestationGrant" ADD CONSTRAINT "AppAttestationGrant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAttestationGrant" ADD CONSTRAINT "AppAttestationGrant_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "AppAttestationKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAttestationGrant" ADD CONSTRAINT "AppAttestationGrant_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "AppAttestationChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAttestationGrant" ADD CONSTRAINT "AppAttestationGrant_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppAttestationKey" ADD CONSTRAINT "attestation_key_bounds" CHECK (
 "provider"='apple-app-attest' AND "keyIdHash" ~ '^[a-f0-9]{64}$' AND "publicKeyHash" ~ '^[a-f0-9]{64}$'
 AND "policyDigest" ~ '^[a-f0-9]{64}$' AND "counter" BETWEEN 0 AND 4294967295 AND "version">=0
 AND "distribution" IN ('app-store','testflight','development') AND length("appId") BETWEEN 14 AND 211
 AND length("bundleVersion") BETWEEN 1 AND 32 AND length("enrolledBundleVersion") BETWEEN 1 AND 32
 AND "status" IN ('ACTIVE','REVOKED','EXPIRED')
 AND (("status"='ACTIVE' AND "publicKeyPem" IS NOT NULL AND length("publicKeyPem") BETWEEN 64 AND 4096 AND "receiptCiphertext" IS NOT NULL AND length("receiptCiphertext") BETWEEN 80 AND 65536)
   OR ("status"<>'ACTIVE' AND "publicKeyPem" IS NULL AND "receiptCiphertext" IS NULL))
);
CREATE FUNCTION cubers_attestation_key_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN IF NEW."counter"<>0 OR NEW."version"<>0 OR NEW."status"<>'ACTIVE' THEN RAISE EXCEPTION 'New app keys start with zero counter and version'; END IF; RETURN NEW; END IF;
 IF ROW(NEW."id",NEW."userId",NEW."provider",NEW."keyIdHash",NEW."publicKeyHash",NEW."appId",NEW."distribution",NEW."enrolledBundleVersion",NEW."policyDigest",NEW."createdAt")
  IS DISTINCT FROM ROW(OLD."id",OLD."userId",OLD."provider",OLD."keyIdHash",OLD."publicKeyHash",OLD."appId",OLD."distribution",OLD."enrolledBundleVersion",OLD."policyDigest",OLD."createdAt")
  OR NEW."version"<>OLD."version"+1 OR NEW."counter"<OLD."counter"
  OR (OLD."status"<>'ACTIVE' AND NEW."status"<>OLD."status")
  OR (NEW."status"='ACTIVE' AND NEW."publicKeyPem" IS DISTINCT FROM OLD."publicKeyPem")
 THEN RAISE EXCEPTION 'App verification key identity, terminal state and counters are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "AppAttestationKey_guard" BEFORE INSERT OR UPDATE ON "AppAttestationKey" FOR EACH ROW EXECUTE FUNCTION cubers_attestation_key_guard();

ALTER TABLE "AppAttestationChallenge" ADD CONSTRAINT "attestation_challenge_bounds" CHECK (
 "provider"='apple-app-attest' AND "region" IN ('CN','INTL')
 AND "policyDigest" ~ '^[a-f0-9]{64}$' AND "contextDigest" ~ '^[a-f0-9]{64}$' AND "challengeHash" ~ '^[a-f0-9]{64}$'
 AND "expiresAt">"createdAt" AND "expiresAt"<="createdAt"+interval '2 minutes'
 AND (("purpose"='ENROLL' AND "keyIdHash" IS NOT NULL AND "keyIdHash" ~ '^[a-f0-9]{64}$' AND "keyId" IS NULL AND "attemptId" IS NULL AND "operation" IS NULL AND "payloadDigest" IS NULL AND "attemptVersion" IS NULL AND "attemptDigest" IS NULL)
 OR ("purpose"='ACTION' AND "keyIdHash" IS NULL AND "keyId" IS NOT NULL AND "attemptId" IS NOT NULL AND "operation" IS NOT NULL AND "operation" IN ('record','inspect','start','finish','evidence') AND "payloadDigest" IS NOT NULL AND "attemptVersion" IS NOT NULL AND "attemptDigest" IS NOT NULL AND "payloadDigest" ~ '^[a-f0-9]{64}$' AND "attemptVersion">=0 AND "attemptDigest" ~ '^[a-f0-9]{64}$'))
 AND (("status"='PENDING' AND "claimedAt" IS NULL AND "finishedAt" IS NULL)
 OR ("status"='VERIFYING' AND "claimedAt" IS NOT NULL AND "finishedAt" IS NULL)
 OR ("status"='USED' AND "claimedAt" IS NOT NULL AND "finishedAt" IS NOT NULL)
 OR ("status"='FAILED' AND "finishedAt" IS NOT NULL))
);
CREATE FUNCTION cubers_attestation_challenge_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN IF NEW."status"<>'PENDING' THEN RAISE EXCEPTION 'New challenges must be pending'; END IF; RETURN NEW; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','claimedAt','finishedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','claimedAt','finishedAt'])
  OR NOT ((OLD."status"='PENDING' AND NEW."status" IN ('VERIFYING','FAILED')) OR (OLD."status"='VERIFYING' AND NEW."status" IN ('USED','FAILED')))
  OR (OLD."claimedAt" IS NOT NULL AND NEW."claimedAt" IS DISTINCT FROM OLD."claimedAt")
 THEN RAISE EXCEPTION 'App verification challenges are single use'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "AppAttestationChallenge_guard" BEFORE INSERT OR UPDATE ON "AppAttestationChallenge" FOR EACH ROW EXECUTE FUNCTION cubers_attestation_challenge_guard();

ALTER TABLE "AppAttestationGrant" ADD CONSTRAINT "attestation_grant_bounds" CHECK (
 "operation" IN ('record','inspect','start','finish','evidence') AND "policyDigest" ~ '^[a-f0-9]{64}$'
 AND "payloadDigest" ~ '^[a-f0-9]{64}$' AND "attemptDigest" ~ '^[a-f0-9]{64}$' AND "attemptVersion">=0 AND "keyVersion">=1
 AND "expiresAt">"createdAt" AND "expiresAt"<="createdAt"+interval '30 seconds'
 AND ("consumedAt" IS NULL OR ("consumedAt">="createdAt" AND "consumedAt"<"expiresAt"))
);
CREATE FUNCTION cubers_attestation_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN IF NEW."consumedAt" IS NOT NULL THEN RAISE EXCEPTION 'New grants must be unused'; END IF; RETURN NEW; END IF;
 IF (to_jsonb(NEW)-'consumedAt') IS DISTINCT FROM (to_jsonb(OLD)-'consumedAt') OR OLD."consumedAt" IS NOT NULL OR NEW."consumedAt" IS NULL
 THEN RAISE EXCEPTION 'App verification grants are immutable and single use'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "AppAttestationGrant_guard" BEFORE INSERT OR UPDATE ON "AppAttestationGrant" FOR EACH ROW EXECUTE FUNCTION cubers_attestation_grant_guard();
