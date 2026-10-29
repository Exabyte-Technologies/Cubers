-- Keep the already-applied table migration immutable. PostgreSQL CHECK permits
-- unknown (NULL), so require an explicit reviewed version in decided records.
ALTER TABLE "DeviceTestReport" DROP CONSTRAINT "DeviceTestReport_review_check";
ALTER TABLE "DeviceTestReport" ADD CONSTRAINT "DeviceTestReport_review_check" CHECK (
 ("status" IN ('APPROVED','REJECTED') AND "reviewedAt" IS NOT NULL AND "reviewedVersion" IS NOT NULL AND "reviewedVersion" > 0 AND "reviewedVersion" < "version")
 OR ("status" NOT IN ('APPROVED','REJECTED') AND "reviewedAt" IS NULL AND "reviewedVersion" IS NULL AND "reviewerId" IS NULL)
);
