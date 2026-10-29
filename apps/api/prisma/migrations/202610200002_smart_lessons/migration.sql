-- Private smart learning keeps its fixed frame/connection epoch separate from
-- the baseline algorithm and received teaching turns. Old history stays NULL.
ALTER TABLE "LessonSession" ADD COLUMN "smart" JSONB;
ALTER TABLE "LessonSession" ADD COLUMN "smartSeenAt" TIMESTAMP(3);
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_smart_pair" CHECK (
  ("input" <> 'smart' AND "smart" IS NULL AND "smartSeenAt" IS NULL) OR
  ("input" = 'smart' AND "puzzle" = '3x3' AND "smart" IS NOT NULL AND
   jsonb_typeof("smart") = 'object' AND "smartSeenAt" IS NOT NULL AND
   length("smart"::text) <= 2048 AND
   "smart" ?& ARRAY['model','platform','reference','epoch','nextSequence','counter','lastTime','independentState','continuity','recoveryRun'] AND
   ("smart" - ARRAY['model','platform','reference','epoch','nextSequence','counter','lastTime','independentState','continuity','recoveryRun']) = '{}'::jsonb AND
   "smart"->>'model' IN ('gan-356-i3','gocube-edge','giiker-i3s') AND
   "smart"->>'platform' IN ('ios','android') AND
   jsonb_typeof("smart"->'reference') = 'object' AND
   ("smart"->'reference') ?& ARRAY['up','front'] AND
   (("smart"->'reference') - ARRAY['up','front']) = '{}'::jsonb AND
   "smart"->>'continuity' IN ('counter','net-state') AND
   jsonb_typeof("smart"->'nextSequence') = 'number' AND
   ("smart"->>'nextSequence')::numeric BETWEEN 0 AND 500 AND
   jsonb_typeof("smart"->'recoveryRun') = 'number' AND
   ("smart"->>'recoveryRun')::numeric BETWEEN 0 AND 6)
);
CREATE INDEX "LessonSession_userId_input_status_idx" ON "LessonSession"("userId","input","status");
