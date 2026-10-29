ALTER TABLE "User" ADD COLUMN "connectionSettings" JSONB NOT NULL DEFAULT '{}';
CREATE TYPE "ConnectionKind" AS ENUM ('FRIEND', 'MENTORSHIP');
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'ENDED', 'EXPIRED');
CREATE TABLE "Connection" (
  "id" UUID NOT NULL,
  "pairKey" TEXT NOT NULL,
  "kind" "ConnectionKind" NOT NULL,
  "requesterId" UUID NOT NULL,
  "recipientId" UUID NOT NULL,
  "clubId" UUID,
  "clubRequired" BOOLEAN NOT NULL DEFAULT false,
  "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "version" INTEGER NOT NULL DEFAULT 0,
  "recipientAccepted" BOOLEAN NOT NULL DEFAULT false,
  "guardianApprovals" JSONB NOT NULL DEFAULT '{}',
  "clubApproval" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "retryAfter" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Connection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Connection_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Connection_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Connection_pairKey_key" ON "Connection"("pairKey");
CREATE INDEX "Connection_requesterId_status_createdAt_idx" ON "Connection"("requesterId", "status", "createdAt");
CREATE INDEX "Connection_recipientId_status_createdAt_idx" ON "Connection"("recipientId", "status", "createdAt");
CREATE INDEX "Connection_clubId_status_idx" ON "Connection"("clubId", "status");
-- Legacy Social records are preserved. They do not grant accepted connections.
