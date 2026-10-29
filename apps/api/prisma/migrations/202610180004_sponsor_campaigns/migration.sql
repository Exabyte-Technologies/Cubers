ALTER TABLE "Campaign"
  ADD COLUMN "content" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "archiveReference" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "CampaignRevision" (
  "id" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "retainUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CampaignRevision_campaignId_version_key" ON "CampaignRevision"("campaignId","version");
CREATE INDEX "CampaignRevision_retainUntil_id_idx" ON "CampaignRevision"("retainUntil","id");
ALTER TABLE "CampaignRevision" ADD CONSTRAINT "CampaignRevision_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Preserve legacy metadata before suspending publication for exact bilingual review.
INSERT INTO "CampaignRevision"("id","campaignId","version","snapshot","reason","retainUntil")
SELECT "id","id",1,to_jsonb("Campaign") || jsonb_build_object('legacyRegionalSetting',COALESCE((SELECT "value" FROM "Setting" WHERE "key"='sponsors-enabled'),'false'::jsonb)),'Legacy metadata archived; bilingual review required',GREATEST("endsAt",CURRENT_TIMESTAMP)+INTERVAL '3 years' FROM "Campaign";
UPDATE "Campaign" SET "enabled"=false,"reviewed"=false,"version"=2;
INSERT INTO "CampaignRevision"("id","campaignId","version","snapshot","reason","retainUntil")
SELECT gen_random_uuid(),"id",2,to_jsonb("Campaign"),'Legacy publication suspended; exact bilingual review required',GREATEST("endsAt",CURRENT_TIMESTAMP)+INTERVAL '3 years' FROM "Campaign";
INSERT INTO "Setting"("key","value") VALUES ('sponsors-enabled','{"enabled":false,"version":1}'::jsonb)
ON CONFLICT ("key") DO UPDATE SET "value"='{"enabled":false,"version":1}'::jsonb;
