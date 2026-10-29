-- Permit the six state-based 3×3 stage lessons. Existing rows and every
-- smart-context, model, platform and continuity check are preserved.
ALTER TABLE "GuidedSolve" DROP CONSTRAINT "GuidedSolve_smart_pair";
ALTER TABLE "GuidedSolve" ADD CONSTRAINT "GuidedSolve_smart_pair" CHECK (
  ("input" <> 'smart' AND "smart" IS NULL AND "smartSeenAt" IS NULL) OR
  ("input" = 'smart' AND "puzzle" = '3x3' AND "courseId" IN ('3-first-solve', '3-cross', '3-corners', '3-middle', '3-yellow-cross', '3-sune', '3-pll') AND "smart" IS NOT NULL AND
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
