-- A user may keep a separate guided practice for each lesson. The former
-- puzzle-wide index rejected a scanned lesson when any other unit was active.
-- Retain the single active smart-cube connection across all 3x3 units.
DROP INDEX "GuidedSolve_one_active_input";
CREATE UNIQUE INDEX "GuidedSolve_one_active_input"
  ON "GuidedSolve"("userId", "puzzle", "courseId", "input")
  WHERE "status" = 'ACTIVE' AND "input" <> 'smart';
CREATE UNIQUE INDEX "GuidedSolve_one_active_smart"
  ON "GuidedSolve"("userId")
  WHERE "status" = 'ACTIVE' AND "input" = 'smart';
