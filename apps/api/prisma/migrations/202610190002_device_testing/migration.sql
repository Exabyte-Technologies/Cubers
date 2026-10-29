CREATE TABLE "DeviceTestReport" (
 "id" UUID NOT NULL, "model" TEXT NOT NULL, "content" JSONB NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'DRAFT',
 "reviewerId" UUID, "reviewedAt" TIMESTAMP(3), "reviewedVersion" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DeviceTestReport_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DeviceTestReport_model_check" CHECK ("model" IN ('gan-356-i3','gocube-edge','giiker-i3s')),
 CONSTRAINT "DeviceTestReport_status_check" CHECK ("status" IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','WITHDRAWN')),
 CONSTRAINT "DeviceTestReport_version_check" CHECK ("version" > 0),
 CONSTRAINT "DeviceTestReport_review_check" CHECK (
  ("status" IN ('APPROVED','REJECTED') AND "reviewedAt" IS NOT NULL AND "reviewedVersion" > 0 AND "reviewedVersion" < "version")
  OR ("status" NOT IN ('APPROVED','REJECTED') AND "reviewedAt" IS NULL AND "reviewedVersion" IS NULL AND "reviewerId" IS NULL)
 ),
 CONSTRAINT "DeviceTestReport_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "DeviceTestContributor" (
 "id" UUID NOT NULL, "reportId" UUID NOT NULL, "userId" UUID,
 CONSTRAINT "DeviceTestContributor_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DeviceTestContributor_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DeviceTestReport"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "DeviceTestContributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "DeviceTestRevision" (
 "id" UUID NOT NULL, "reportId" UUID NOT NULL, "version" INTEGER NOT NULL,
 "snapshot" JSONB NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DeviceTestRevision_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DeviceTestRevision_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DeviceTestReport"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DeviceTestReport_model_status_id_idx" ON "DeviceTestReport"("model","status","id");
CREATE INDEX "DeviceTestReport_expiresAt_id_idx" ON "DeviceTestReport"("expiresAt","id");
CREATE UNIQUE INDEX "DeviceTestContributor_reportId_userId_key" ON "DeviceTestContributor"("reportId","userId");
CREATE INDEX "DeviceTestContributor_userId_idx" ON "DeviceTestContributor"("userId");
CREATE UNIQUE INDEX "DeviceTestRevision_reportId_version_key" ON "DeviceTestRevision"("reportId","version");
