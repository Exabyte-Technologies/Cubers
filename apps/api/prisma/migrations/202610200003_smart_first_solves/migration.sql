-- Smart first-solve connections use the existing guided plan/history. Legacy
-- virtual/scanned rows keep NULL context and contact fields.
ALTER TABLE "GuidedSolve" ADD COLUMN "smart" JSONB;
ALTER TABLE "GuidedSolve" ADD COLUMN "smartSeenAt" TIMESTAMP(3);
ALTER TABLE "GuidedSolve" ADD CONSTRAINT "GuidedSolve_smart_pair" CHECK (
  ("input" <> 'smart' AND "smart" IS NULL AND "smartSeenAt" IS NULL) OR
  ("input" = 'smart' AND "puzzle" = '3x3' AND "courseId" = '3-first-solve' AND "smart" IS NOT NULL AND
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
   ("smart"->>'nextSequence')::numeric BETWEEN 0 AND 2000 AND
   jsonb_typeof("smart"->'recoveryRun') = 'number' AND
   ("smart"->>'recoveryRun')::numeric BETWEEN 0 AND 6)
);
CREATE INDEX "GuidedSolve_userId_input_status_idx" ON "GuidedSolve"("userId","input","status");
