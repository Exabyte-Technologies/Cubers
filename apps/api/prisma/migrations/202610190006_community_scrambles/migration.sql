-- Preserve existing TNoodle and unknown historic rows; new generation uses cubing.js.

ALTER TABLE "Attempt" DROP CONSTRAINT "Attempt_scrambleSource_shape";
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_scrambleSource_shape" CHECK (
  "scrambleSource" IS NULL OR (
    jsonb_typeof("scrambleSource")='object' AND
    "scrambleSource"->>'version' ~ '^[0-9]+\.[0-9]+\.[0-9]+$' AND
    "scrambleSource"->>'artifactSha256' ~ '^[0-9a-f]{64}$' AND
    "scrambleSource"->>'event' IN ('222','333','444','pyram') AND (
      ("scrambleSource"->>'program'='TNoodle-WCA' AND
       "scrambleSource" - ARRAY['program','version','artifactSha256','event'] = '{}'::jsonb)
      OR
      ("scrambleSource"->>'program'='cubing.js' AND
       "scrambleSource"->>'filter'='cubers-min-distance-v1' AND
       "scrambleSource" - ARRAY['program','version','artifactSha256','event','filter'] = '{}'::jsonb)
    )
  ) IS TRUE
);

ALTER TABLE "CompetitionRound" DROP CONSTRAINT "CompetitionRound_scrambleSource_shape";
ALTER TABLE "CompetitionRound" ADD CONSTRAINT "CompetitionRound_scrambleSource_shape" CHECK (
  "scrambleSource" IS NULL OR (
    jsonb_typeof("scrambleSource")='object' AND
    "scrambleSource"->>'version' ~ '^[0-9]+\.[0-9]+\.[0-9]+$' AND
    "scrambleSource"->>'artifactSha256' ~ '^[0-9a-f]{64}$' AND
    "scrambleSource"->>'event' IN ('222','333','444','pyram') AND (
      ("scrambleSource"->>'program'='TNoodle-WCA' AND
       "scrambleSource" - ARRAY['program','version','artifactSha256','event'] = '{}'::jsonb)
      OR
      ("scrambleSource"->>'program'='cubing.js' AND
       "scrambleSource"->>'filter'='cubers-min-distance-v1' AND
       "scrambleSource" - ARRAY['program','version','artifactSha256','event','filter'] = '{}'::jsonb)
    )
  ) IS TRUE
);

ALTER TABLE "GuidedSolve" DROP CONSTRAINT "GuidedSolve_scrambleSource_shape";
ALTER TABLE "GuidedSolve" ADD CONSTRAINT "GuidedSolve_scrambleSource_shape" CHECK (
  "scrambleSource" IS NULL OR (
    jsonb_typeof("scrambleSource")='object' AND
    "scrambleSource"->>'version' ~ '^[0-9]+\.[0-9]+\.[0-9]+$' AND
    "scrambleSource"->>'artifactSha256' ~ '^[0-9a-f]{64}$' AND
    "scrambleSource"->>'event'=CASE puzzle WHEN '2x2' THEN '222' WHEN '3x3' THEN '333' WHEN '4x4' THEN '444' WHEN 'pyraminx' THEN 'pyram' END AND (
      ("scrambleSource"->>'program'='TNoodle-WCA' AND
       "scrambleSource" - ARRAY['program','version','artifactSha256','event'] = '{}'::jsonb)
      OR
      ("scrambleSource"->>'program'='cubing.js' AND
       "scrambleSource"->>'filter'='cubers-min-distance-v1' AND
       "scrambleSource" - ARRAY['program','version','artifactSha256','event','filter'] = '{}'::jsonb)
    )
  ) IS TRUE
);
