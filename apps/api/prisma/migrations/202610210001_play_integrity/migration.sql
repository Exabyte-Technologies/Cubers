-- Standard Play Integrity proofs are action-bound, without an Apple enrollment key.
ALTER TABLE "AppAttestationGrant" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'apple-app-attest';
ALTER TABLE "AppAttestationGrant" ALTER COLUMN "keyId" DROP NOT NULL;
ALTER TABLE "AppAttestationGrant" ALTER COLUMN "keyVersion" DROP NOT NULL;
ALTER TABLE "AppAttestationChallenge" DROP CONSTRAINT "attestation_challenge_bounds";
ALTER TABLE "AppAttestationChallenge" ADD CONSTRAINT "attestation_challenge_bounds" CHECK (
 "provider" IN ('apple-app-attest','google-play') AND "region" IN ('CN','INTL')
 AND "policyDigest" ~ '^[a-f0-9]{64}$' AND "contextDigest" ~ '^[a-f0-9]{64}$' AND "challengeHash" ~ '^[a-f0-9]{64}$'
 AND "expiresAt">"createdAt" AND "expiresAt"<="createdAt"+interval '2 minutes'
 AND (("purpose"='ENROLL' AND "provider"='apple-app-attest' AND "keyIdHash" IS NOT NULL AND "keyIdHash" ~ '^[a-f0-9]{64}$' AND "keyId" IS NULL AND "attemptId" IS NULL AND "operation" IS NULL AND "payloadDigest" IS NULL AND "attemptVersion" IS NULL AND "attemptDigest" IS NULL)
 OR ("purpose"='ACTION' AND "keyIdHash" IS NULL AND (("provider"='apple-app-attest' AND "keyId" IS NOT NULL) OR ("provider"='google-play' AND "keyId" IS NULL)) AND "attemptId" IS NOT NULL AND "operation" IS NOT NULL AND "operation" IN ('record','inspect','start','finish','evidence') AND "payloadDigest" IS NOT NULL AND "attemptVersion" IS NOT NULL AND "attemptDigest" IS NOT NULL AND "payloadDigest" ~ '^[a-f0-9]{64}$' AND "attemptVersion">=0 AND "attemptDigest" ~ '^[a-f0-9]{64}$'))
 AND (("status"='PENDING' AND "claimedAt" IS NULL AND "finishedAt" IS NULL)
 OR ("status"='VERIFYING' AND "claimedAt" IS NOT NULL AND "finishedAt" IS NULL)
 OR ("status"='USED' AND "claimedAt" IS NOT NULL AND "finishedAt" IS NOT NULL)
 OR ("status"='FAILED' AND "finishedAt" IS NOT NULL))
);
ALTER TABLE "AppAttestationGrant" DROP CONSTRAINT "attestation_grant_bounds";
ALTER TABLE "AppAttestationGrant" ADD CONSTRAINT "attestation_grant_bounds" CHECK (
 "operation" IN ('record','inspect','start','finish','evidence') AND "policyDigest" ~ '^[a-f0-9]{64}$'
 AND "payloadDigest" ~ '^[a-f0-9]{64}$' AND "attemptDigest" ~ '^[a-f0-9]{64}$' AND "attemptVersion">=0 AND (("provider"='apple-app-attest' AND "keyId" IS NOT NULL AND "keyVersion" IS NOT NULL AND "keyVersion">=1) OR ("provider"='google-play' AND "keyId" IS NULL AND "keyVersion" IS NULL))
 AND "expiresAt">"createdAt" AND "expiresAt"<="createdAt"+interval '30 seconds'
 AND ("consumedAt" IS NULL OR ("consumedAt">="createdAt" AND "consumedAt"<"expiresAt"))
);
