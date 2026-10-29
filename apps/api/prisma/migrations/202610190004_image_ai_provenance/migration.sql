ALTER TABLE "Media" ADD COLUMN "aiLabel" TEXT, ADD COLUMN "aiMetadata" JSONB;
ALTER TABLE "Media" ADD CONSTRAINT "Media_aiLabel_check" CHECK ("aiLabel" IS NULL OR ("aiLabel" IN ('1','2','3') AND "purpose"='post'));
ALTER TABLE "Media" ADD CONSTRAINT "Media_aiMetadata_check" CHECK ((("aiLabel" IS NULL AND "aiMetadata" IS NULL) OR ("aiLabel" IS NOT NULL AND "aiMetadata" IS NOT NULL AND jsonb_typeof("aiMetadata")='object' AND "aiMetadata"->>'Label'="aiLabel")) IS TRUE);
ALTER TABLE "Post" ADD COLUMN "aiSourceLabel" TEXT;
ALTER TABLE "Post" ADD CONSTRAINT "Post_aiSourceLabel_check" CHECK ("aiSourceLabel" IS NULL OR ("aiSourceLabel" IN ('1','2','3') AND "aiGenerated"=true));
