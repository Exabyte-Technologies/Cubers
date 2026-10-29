import type { GuidedSolve } from "@prisma/client";
import {
  guidedState,
  GuidedPuzzle,
  practiceKey,
  practiceApply,
  type GuidedSolvePlan,
  type GuidedSolveView,
} from "@cubers/core";
const planOf = (row: GuidedSolve) => row.plan as unknown as GuidedSolvePlan;
const currentOf = (row: GuidedSolve) =>
  guidedState(
    GuidedPuzzle.parse(row.puzzle),
    row.currentFaces as Record<string, string[]>,
  );
export function guidedView(row: GuidedSolve): GuidedSolveView {
  const plan = planOf(row),
    step = plan.steps[row.stage] || null;
  const status =
    row.status === "ACTIVE" && row.expiresAt <= new Date()
      ? "EXPIRED"
      : row.input === "smart" &&
          row.status === "ACTIVE" &&
          (!row.smartSeenAt || Date.now() - row.smartSeenAt.getTime() > 30000)
        ? "INTERRUPTED"
        : row.status;
  let guideIndex = -1;
  if (step && status === "ACTIVE") {
    let prefix = guidedState(
      GuidedPuzzle.parse(row.puzzle),
      row.checkpointFaces as Record<string, string[]>,
    );
    const currentKey = practiceKey(currentOf(row));
    if (practiceKey(prefix) === currentKey) guideIndex = 0;
    for (let index = 0; index < step.moves.length; index++) {
      prefix = practiceApply(prefix, [step.moves[index]]);
      if (practiceKey(prefix) === currentKey) guideIndex = index + 1;
    }
  }
  return {
    id: row.id,
    ...(plan.lessonId ? { lessonId: plan.lessonId } : {}),
    ...(plan.setupMoves ? { setupMoves: plan.setupMoves } : {}),
    puzzle: GuidedPuzzle.parse(row.puzzle),
    input: row.input as "virtual" | "scan" | "smart",
    status,
    version: row.version,
    stage: row.stage,
    total: plan.steps.length,
    currentFaces: row.currentFaces as Record<string, string[]>,
    step: status === "ACTIVE" ? step : null,
    stageMoves: row.stageMoves,
    moveCount: row.moves.length,
    matchedGuide: guideIndex >= 0,
    guideIndex,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() || null,
    checkpoints: (row.checkpoints as any[]).map(
      ({ kind, goal, layerGoal, target, at }) => ({
        kind,
        ...(goal ? { goal } : {}),
        ...(layerGoal ? { layerGoal } : {}),
        ...(target === undefined ? {} : { target }),
        at,
      }),
    ),
  };
}
