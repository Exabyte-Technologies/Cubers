-- Keep the original setup/algorithm and actual recorded moves. A selected guide
-- is separate, version-bound teaching; NULL preserves all historical sessions.
ALTER TABLE "LessonSession" ADD COLUMN "guideId" TEXT;
ALTER TABLE "LessonSession" ADD COLUMN "guideAlgorithm" TEXT;
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_guide_pair" CHECK (
  ("guideId" IS NULL AND "guideAlgorithm" IS NULL) OR
  ("guideId" IS NOT NULL AND "guideAlgorithm" IS NOT NULL AND
   length("guideId") BETWEEN 1 AND 40 AND "guideId" !~ '[^a-z0-9-]' AND length("guideAlgorithm") BETWEEN 1 AND 4000)
);
