BEGIN;
-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "competitionAttempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "competitionEntryId" UUID,
ADD COLUMN     "competitionIndex" INTEGER,
ADD COLUMN     "competitionRoundId" UUID;

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "penaltyMs" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Competition" (
    "id" UUID NOT NULL,
    "creatorId" UUID,
    "title" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "puzzle" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "ranked" BOOLEAN NOT NULL,
    "capacity" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "registrationOpensAt" TIMESTAMP(3) NOT NULL,
    "registrationClosesAt" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionRound" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "title" JSONB NOT NULL,
    "format" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "scrambles" JSONB NOT NULL,

    CONSTRAINT "CompetitionRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionEntry" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionPublication" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "guardianId" UUID,
    "consentDigest" TEXT,
    "status" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB NOT NULL,
    "resultDigest" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competition_status_startsAt_id_idx" ON "Competition"("status", "startsAt", "id");

-- CreateIndex
CREATE INDEX "Competition_expiresAt_idx" ON "Competition"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionRound_competitionId_ordinal_key" ON "CompetitionRound"("competitionId", "ordinal");

-- CreateIndex
CREATE INDEX "CompetitionEntry_userId_createdAt_idx" ON "CompetitionEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionEntry_competitionId_userId_key" ON "CompetitionEntry"("competitionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionEntry_competitionId_number_key" ON "CompetitionEntry"("competitionId", "number");

-- CreateIndex
CREATE INDEX "CompetitionPublication_guardianId_status_createdAt_id_idx" ON "CompetitionPublication"("guardianId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CompetitionPublication_status_createdAt_id_idx" ON "CompetitionPublication"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionPublication_entryId_scope_key" ON "CompetitionPublication"("entryId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "Room_competitionEntryId_competitionRoundId_competitionIndex_key" ON "Room"("competitionEntryId", "competitionRoundId", "competitionIndex");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_competitionEntryId_fkey" FOREIGN KEY ("competitionEntryId") REFERENCES "CompetitionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_competitionRoundId_fkey" FOREIGN KEY ("competitionRoundId") REFERENCES "CompetitionRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionRound" ADD CONSTRAINT "CompetitionRound_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionPublication" ADD CONSTRAINT "CompetitionPublication_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionPublication" ADD CONSTRAINT "CompetitionPublication_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
