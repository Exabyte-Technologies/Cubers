-- Preserve all historic/issued sequences. NULL means no generator provenance;
-- it must never be retroactively described as an official-program scramble.
ALTER TABLE "Attempt" ADD COLUMN "scrambleSource" JSONB;
ALTER TABLE "CompetitionRound" ADD COLUMN "scrambleSource" JSONB;
ALTER TABLE "GuidedSolve" ADD COLUMN "scrambleSource" JSONB;

ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_scrambleSource_shape" CHECK (
  "scrambleSource" IS NULL OR (
    jsonb_typeof("scrambleSource")='object' AND
    "scrambleSource"->>'program'='TNoodle-WCA' AND
    "scrambleSource"->>'version' ~ '^[0-9]+\.[0-9]+\.[0-9]+$' AND
    "scrambleSource"->>'artifactSha256' ~ '^[0-9a-f]{64}$' AND
    "scrambleSource"->>'event' IN ('222','333','444','pyram') AND
    "scrambleSource" - ARRAY['program','version','artifactSha256','event'] = '{}'::jsonb
  ) IS TRUE
);
ALTER TABLE "CompetitionRound" ADD CONSTRAINT "CompetitionRound_scrambleSource_shape" CHECK (
  "scrambleSource" IS NULL OR (
    jsonb_typeof("scrambleSource")='object' AND
    "scrambleSource"->>'program'='TNoodle-WCA' AND
    "scrambleSource"->>'version' ~ '^[0-9]+\.[0-9]+\.[0-9]+$' AND
    "scrambleSource"->>'artifactSha256' ~ '^[0-9a-f]{64}$' AND
    "scrambleSource"->>'event' IN ('222','333','444','pyram') AND
    "scrambleSource" - ARRAY['program','version','artifactSha256','event'] = '{}'::jsonb
  ) IS TRUE
);
ALTER TABLE "GuidedSolve" ADD CONSTRAINT "GuidedSolve_scrambleSource_shape" CHECK (
  "scrambleSource" IS NULL OR (
    jsonb_typeof("scrambleSource")='object' AND
    "scrambleSource"->>'program'='TNoodle-WCA' AND
    "scrambleSource"->>'version' ~ '^[0-9]+\.[0-9]+\.[0-9]+$' AND
    "scrambleSource"->>'artifactSha256' ~ '^[0-9a-f]{64}$' AND
    "scrambleSource"->>'event'=CASE puzzle WHEN '2x2' THEN '222' WHEN '3x3' THEN '333' WHEN '4x4' THEN '444' WHEN 'pyraminx' THEN 'pyram' END AND
    "scrambleSource" - ARRAY['program','version','artifactSha256','event'] = '{}'::jsonb
  ) IS TRUE
);
