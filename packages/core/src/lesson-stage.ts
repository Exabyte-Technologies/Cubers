import { z } from "zod";
import {
  firstSolveGoal,
  guidedCourseId,
  type GuidedPuzzle,
  type GuidedSolvePlan,
  type FirstSolveGoal,
} from "./first-solve";
import { guidedGoal, prepareGuidedState, guidedInverse } from "./guided";
import {
  isPyraminx,
  practiceApply,
  practiceSolved,
  solvedPuzzle,
  type PracticeState,
} from "./practice";
import { pyraminxSolveGoal } from "./pyraminx-first-solve";
import { reduceFour } from "./four-first-solve";
type Definition = {
  id: string;
  puzzle: GuidedPuzzle;
  goals: string[];
  previous?: string;
  setup: string;
};
export const LESSON_STAGES: readonly Definition[] = [
  { id: "3-cross", puzzle: "3x3", goals: ["cross"], setup: "F2" },
  {
    id: "3-corners",
    puzzle: "3x3",
    goals: ["corner"],
    previous: "3-cross",
    setup: "R U R' U'",
  },
  {
    id: "3-middle",
    puzzle: "3x3",
    goals: ["middle"],
    previous: "3-corners",
    setup: "U R U' R' U' F' U F",
  },
  {
    id: "3-yellow-cross",
    puzzle: "3x3",
    goals: ["yellow-cross"],
    previous: "3-middle",
    setup: "F R U R' U' F'",
  },
  {
    id: "3-sune",
    puzzle: "3x3",
    goals: ["yellow-face"],
    previous: "3-yellow-cross",
    setup: "R U R' U R U2 R'",
  },
  {
    id: "3-pll",
    puzzle: "3x3",
    goals: ["corner-positions", "solved"],
    previous: "3-sune",
    setup: "R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  { id: "2-beginner", puzzle: "2x2", goals: ["corner"], setup: "R U R' U'" },
  {
    id: "4-reduction",
    puzzle: "4x4",
    goals: ["four-even-wings", "four-centers", "four-pair"],
    setup: "Rw U Rw'",
  },
  {
    id: "pyr-beginner",
    puzzle: "pyraminx",
    goals: ["pyra-axial", "pyra-tip"],
    setup: "u l r b",
  },
  {
    id: "pyr-intuitive",
    puzzle: "pyraminx",
    goals: ["pyra-base-edge"],
    previous: "pyr-beginner",
    setup: "R U R' U'",
  },
  {
    id: "pyr-last-layer",
    puzzle: "pyraminx",
    goals: ["pyra-solved"],
    previous: "pyr-intuitive",
    setup: "R U R' U R U R'",
  },
];
export const lessonStage = (id?: string) =>
  LESSON_STAGES.find((row) => row.id === id);
export function lessonStageComplete(state: PracticeState, id: string): boolean {
  const def = lessonStage(id);
  if (!def) return false;
  if (
    isPyraminx(state)
      ? def.puzzle !== "pyraminx"
      : def.puzzle !== `${state.size}x${state.size}`
  )
    return false;
  if (isPyraminx(state))
    return id === "pyr-beginner"
      ? pyraminxSolveGoal(state, "pyra-tip", 3)
      : id === "pyr-intuitive"
        ? pyraminxSolveGoal(state, "pyra-base-edge", 5)
        : id === "pyr-last-layer" && practiceSolved(state);
  if (id === "4-reduction") {
    try {
      reduceFour(state);
      return true;
    } catch {
      return false;
    }
  }
  const goal = def.goals.at(-1)!;
  return firstSolveGoal(
    state,
    goal as FirstSolveGoal,
    goal === "corner" ? 7 : goal === "middle" ? 11 : undefined,
  );
}
export const LessonStageAdvice = z
  .object({
    requestedLessonId: z.string().min(1).max(80),
    actualLessonId: z.string().min(1).max(80).nullable(),
    reason: z.enum(["prerequisite", "already-complete"]),
  })
  .strict();
export type LessonStageAdvice = z.infer<typeof LessonStageAdvice>;
export function lessonStageAdvice(
  state: PracticeState,
  id: string,
): LessonStageAdvice | null {
  const def = lessonStage(id);
  if (!def) return null;
  if (
    !lessonStageComplete(state, id) &&
    (!def.previous || lessonStageComplete(state, def.previous))
  )
    return null;
  const actual = LESSON_STAGES.find(
    (row) => row.puzzle === def.puzzle && !lessonStageComplete(state, row.id),
  );
  return {
    requestedLessonId: id,
    actualLessonId: practiceSolved(state)
      ? null
      : actual?.id || guidedCourseId(def.puzzle),
    reason: lessonStageComplete(state, id)
      ? "already-complete"
      : "prerequisite",
  };
}
export function scopedLessonPlan(
  plan: GuidedSolvePlan,
  id: string,
): GuidedSolvePlan {
  const def = lessonStage(id);
  if (!def) return plan;
  if (plan.puzzle !== def.puzzle)
    throw Error("Guidance belongs to another puzzle");
  const steps = plan.steps.filter((step) => def.goals.includes(step.goal));
  if (!steps.length) throw Error("No guidance for this lesson target");
  return { ...plan, steps, lessonId: id } as GuidedSolvePlan;
}
export function scopedLessonStart(
  state: PracticeState,
  plan: GuidedSolvePlan,
  id: string,
) {
  if (!lessonStage(id)) return 0;
  const index = plan.steps.findIndex((step) => !guidedGoal(state, step));
  return index < 0 ? plan.steps.length : index;
}
export function lessonStageSetup(id: string) {
  const def = lessonStage(id);
  if (!def) throw Error("Unsupported step lesson");
  const setup = guidedInverse(def.puzzle, def.setup.split(" "));
  const state = prepareGuidedState(
    practiceApply(prepareGuidedState(solvedPuzzle(def.puzzle)), setup),
  );
  if (lessonStageAdvice(state, id))
    throw Error("The authored setup is not ready for this lesson");
  return { state, setup };
}
export function scopedLessonOrder<T extends { goal: string }>(
  steps: T[],
  id?: string,
) {
  const def = lessonStage(id);
  return def ? steps.filter((step) => def.goals.includes(step.goal)) : steps;
}
