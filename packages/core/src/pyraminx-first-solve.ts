import {
  pyraminxCoordinates,
  validatePyraminx,
  type PyraminxState,
  type PyraFace,
  type PyraColor,
} from "./pyraminx";
export type PyraminxSolveGoal =
  "pyra-axial" | "pyra-tip" | "pyra-base-edge" | "pyra-solved";
export type PyraminxSolveStep = {
  goal: PyraminxSolveGoal;
  target?: number;
  moves: string[];
  blocks: string[][];
};
export type PyraminxFirstSolvePlan = {
  version: "pyra-layer-1";
  puzzle: "pyraminx";
  orientation: string[];
  startingFaces: Record<PyraFace, PyraColor[]>;
  steps: PyraminxSolveStep[];
};
export function prepareGuidedPyraminx(state: PyraminxState): PyraminxState {
  const result = validatePyraminx(state);
  if (!result.valid || !result.normalized)
    throw new Error(result.reason || "Invalid Pyraminx state");
  return result.normalized;
}
export function pyraminxEdgeCodes(state: PyraminxState) {
  const c = pyraminxCoordinates(state);
  if (!c) throw new Error("Pyraminx must use the displayed reference frame");
  const codes: number[] = [];
  c.edges.forEach((id, slot) => {
    codes[id] = slot * 2 + c.flips[slot];
  });
  return codes;
}
export function pyraminxSolveGoal(
  state: PyraminxState,
  goal: PyraminxSolveGoal,
  target?: number,
) {
  const c = pyraminxCoordinates(state);
  if (!c) return false;
  const axial = c.axials.every((value) => value === 0),
    tips = c.tips.every((value) => value === 0);
  if (goal === "pyra-axial")
    return (
      Number.isInteger(target) &&
      target! >= 0 &&
      target! < 4 &&
      c.axials.slice(0, target! + 1).every((value) => value === 0)
    );
  if (goal === "pyra-tip")
    return (
      axial &&
      Number.isInteger(target) &&
      target! >= 0 &&
      target! < 4 &&
      c.tips.slice(0, target! + 1).every((value) => value === 0)
    );
  const codes = pyraminxEdgeCodes(state);
  if (goal === "pyra-base-edge")
    return (
      axial &&
      tips &&
      [3, 4, 5].includes(target!) &&
      [3, 4, 5]
        .filter((id) => id <= target!)
        .every((id) => codes[id] === id * 2)
    );
  return (
    goal === "pyra-solved" &&
    axial &&
    tips &&
    codes.every((code, id) => code === id * 2)
  );
}
