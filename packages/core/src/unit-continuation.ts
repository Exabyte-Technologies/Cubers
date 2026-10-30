import type { GuidedSolveStep } from "./first-solve";
import { guidedGoal } from "./guided";
import type { PracticeState } from "./practice";

const unit = (step: GuidedSolveStep, lessonId?: string) =>
  lessonId ||
  (step.goal === "four-layer" ? `${step.goal}:${step.layerGoal}` : step.goal);

export function canContinueUnit(
  steps: readonly GuidedSolveStep[],
  stage: number,
  lessonId?: string,
) {
  return (
    Number.isInteger(stage) &&
    stage >= 0 &&
    stage + 1 < steps.length &&
    unit(steps[stage], lessonId) === unit(steps[stage + 1], lessonId)
  );
}

/** Continue the model within one unit. This never verifies a physical state
 * or completes a unit. Empty already-satisfied parts can be omitted, stopping
 * at the last part so the unit's final check cannot be bypassed. */
export function nextUnitStage(
  steps: readonly GuidedSolveStep[],
  stage: number,
  state: PracticeState,
  lessonId?: string,
) {
  if (
    !canContinueUnit(steps, stage, lessonId) ||
    !guidedGoal(state, steps[stage])
  )
    throw Error("Finish this part; the final unit check cannot be skipped");
  let next = stage + 1;
  while (
    canContinueUnit(steps, next, lessonId) &&
    steps[next].moves.length === 0 &&
    guidedGoal(state, steps[next])
  )
    next++;
  return next;
}
