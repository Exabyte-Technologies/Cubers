import {
  type GuidedPuzzle,
  type GuidedSolveStep,
  guidedSize,
  firstSolveGoal,
  prepareGuidedCube,
  type FirstSolveGoal,
} from "./first-solve";
import { fromFacelets, facelets, inverse, type Face } from "./puzzle";
import {
  pyraminxFromFacelets,
  pyraminxFacelets,
  pyraminxInverse,
  type PyraFace,
  type PyraColor,
} from "./pyraminx";
import {
  prepareGuidedPyraminx,
  pyraminxSolveGoal,
  type PyraminxSolveGoal,
} from "./pyraminx-first-solve";
import { isPyraminx, type PracticeState } from "./practice";
import {
  prepareGuidedFour,
  fourSolveGoal,
  type FourSolveStep,
} from "./four-first-solve";
export function guidedState(
  puzzle: GuidedPuzzle,
  faces: Record<string, string[]>,
): PracticeState {
  return puzzle === "pyraminx"
    ? pyraminxFromFacelets(faces as Record<PyraFace, PyraColor[]>)
    : fromFacelets(guidedSize(puzzle), faces as Record<Face, Face[]>);
}
export function guidedFacelets(state: PracticeState): Record<string, string[]> {
  return isPyraminx(state) ? pyraminxFacelets(state) : facelets(state);
}
export function prepareGuidedState(state: PracticeState) {
  return isPyraminx(state)
    ? prepareGuidedPyraminx(state)
    : state.size === 4
      ? prepareGuidedFour(state)
      : prepareGuidedCube(state);
}
export function guidedInverse(puzzle: GuidedPuzzle, moves: string[]) {
  return puzzle === "pyraminx" ? pyraminxInverse(moves) : inverse(moves);
}
export function guidedGoal(state: PracticeState, step: GuidedSolveStep) {
  if (!isPyraminx(state) && state.size === 4)
    return (
      step.goal.startsWith("four-") &&
      fourSolveGoal(state, step as FourSolveStep)
    );
  if (isPyraminx(state))
    return (
      step.goal.startsWith("pyra-") &&
      pyraminxSolveGoal(state, step.goal as PyraminxSolveGoal, step.target)
    );
  return (
    !step.goal.startsWith("pyra-") &&
    !step.goal.startsWith("four-") &&
    firstSolveGoal(state, step.goal as FirstSolveGoal, step.target)
  );
}
