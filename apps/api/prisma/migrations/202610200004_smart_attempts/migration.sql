-- Unbound attempts and legacy virtual/scanned attempts keep both fields null.
-- Context is owner-private; no addresses, transport secrets or raw packets.
ALTER TABLE "Attempt" ADD COLUMN "smart" JSONB;
ALTER TABLE "Attempt" ADD COLUMN "smartSeenAt" TIMESTAMP(3);
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_smart_pair" CHECK (
 ("smart" IS NULL AND "smartSeenAt" IS NULL) OR
 ("smart" IS NOT NULL AND "smartSeenAt" IS NOT NULL AND jsonb_typeof("smart")='object' AND
 length("smart"::text)<=2048 AND
 "smart" ?& ARRAY['model','platform','reference','epoch','nextSequence','counter','lastTime','independentState','continuity','recoveryRun'] AND
 ("smart" - ARRAY['model','platform','reference','epoch','nextSequence','counter','lastTime','independentState','continuity','recoveryRun'])='{}'::jsonb AND
 "smart"->>'model' IN ('gan-356-i3','gocube-edge','giiker-i3s') AND
 "smart"->>'platform' IN ('ios','android') AND
 "smart"->'reference'='{"up":"U","front":"F"}'::jsonb AND
 "smart"->>'continuity' IN ('counter','net-state') AND
 jsonb_typeof("smart"->'nextSequence')='number' AND
 ("smart"->>'nextSequence')::numeric BETWEEN 0 AND 10000 AND
 jsonb_typeof("smart"->'recoveryRun')='number' AND
 ("smart"->>'recoveryRun')::numeric BETWEEN 0 AND 6)
);
