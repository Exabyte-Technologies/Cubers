// Original teaching planner. Move transitions and preserving groups are
// derived from Cubers' tetrahedral geometry, rather than an external solver.
import {
  PYRA_VERTICES,
  solvedPyraminx,
  pyraminxApply,
  pyraminxFacelets,
  pyraminxCoordinates,
  prepareGuidedPyraminx,
  pyraminxEdgeCodes,
  pyraminxSolveGoal,
  type PyraminxState,
  type PyraminxFirstSolvePlan,
  type PyraminxSolveStep,
} from "@cubers/core";
type Operation = { moves: string[]; edges: Uint8Array };
let operations: Operation[] | undefined;
function edgeOperations() {
  if (operations) return operations;
  const groups = new Map<string, Operation>();
  for (const a of PYRA_VERTICES)
    for (const b of PYRA_VERTICES) {
      if (a === b) continue;
      for (const moves of [
        [a, b, a + "'", b + "'"],
        [b, a, b + "'", a + "'"],
      ]) {
        const state = pyraminxApply(solvedPyraminx(), moves),
          c = pyraminxCoordinates(state)!;
        if ([...c.axials, ...c.tips].some((value) => value !== 0))
          throw new Error("Edge group changed a tip or axial orientation");
        const codes = pyraminxEdgeCodes(state);
        const edges = Uint8Array.from(
          { length: 12 },
          (_, code) => codes[Math.floor(code / 2)] ^ (code % 2),
        );
        groups.set(Array.from(edges).join(","), { moves, edges });
      }
    }
  operations = [...groups.values()];
  return operations;
}
const key = (codes: number[]) =>
  codes.reduce((sum, code) => sum * 12 + code, 0);
function edgeSearch(initial: number[], goal: (codes: number[]) => boolean) {
  if (goal(initial)) return [] as Operation[];
  const ops = edgeOperations(),
    nodes = [{ codes: initial, parent: -1, operation: -1 }],
    seen = new Set([key(initial)]);
  for (let head = 0; head < nodes.length; head++) {
    if (nodes.length > 11520)
      throw new Error("Pyraminx edge search exceeded its legal state space");
    for (let index = 0; index < ops.length; index++) {
      const codes = nodes[head].codes.map((code) => ops[index].edges[code]),
        signature = key(codes);
      if (seen.has(signature)) continue;
      seen.add(signature);
      nodes.push({ codes, parent: head, operation: index });
      if (goal(codes)) {
        const result: Operation[] = [];
        for (
          let at = nodes.length - 1;
          nodes[at].parent !== -1;
          at = nodes[at].parent
        )
          result.push(ops[nodes[at].operation]);
        return result.reverse();
      }
    }
  }
  throw new Error("No validated Pyraminx edge path");
}
export function planPyraminxFirstSolve(
  input: PyraminxState,
): PyraminxFirstSolvePlan {
  let state = prepareGuidedPyraminx(input);
  const startingFaces = pyraminxFacelets(state),
    steps: PyraminxSolveStep[] = [];
  const save = (
    goal: PyraminxSolveStep["goal"],
    blocks: string[][],
    target?: number,
  ) => {
    const moves = blocks.flat();
    state = pyraminxApply(state, moves);
    if (!pyraminxSolveGoal(state, goal, target))
      throw new Error("Invalid Pyraminx teaching checkpoint");
    steps.push({
      goal,
      ...(target === undefined ? {} : { target }),
      moves,
      blocks,
    });
  };
  for (let target = 0; target < 4; target++) {
    const orientation = pyraminxCoordinates(state)!.axials[target],
      move = PYRA_VERTICES[target] + (orientation === 1 ? "'" : "");
    save("pyra-axial", orientation ? [[move]] : [], target);
  }
  for (let target = 0; target < 4; target++) {
    const orientation = pyraminxCoordinates(state)!.tips[target],
      move =
        PYRA_VERTICES[target].toLowerCase() + (orientation === 1 ? "'" : "");
    save("pyra-tip", orientation ? [[move]] : [], target);
  }
  for (let target = 3; target < 6; target++)
    save(
      "pyra-base-edge",
      edgeSearch(pyraminxEdgeCodes(state), (codes) =>
        [3, 4, 5]
          .filter((id) => id <= target)
          .every((id) => codes[id] === id * 2),
      ).map((op) => op.moves),
      target,
    );
  save(
    "pyra-solved",
    edgeSearch(pyraminxEdgeCodes(state), (codes) =>
      codes.every((code, id) => code === id * 2),
    ).map((op) => op.moves),
  );
  if (steps.flatMap((step) => step.moves).length > 200)
    throw new Error("Pyraminx guidance exceeds its move budget");
  return {
    version: "pyra-layer-1",
    puzzle: "pyraminx",
    orientation: [],
    startingFaces,
    steps,
  };
}
export function pyraminxGuidanceSpaceSummary() {
  const ops = edgeOperations(),
    solved = [0, 2, 4, 6, 8, 10],
    queue = [solved],
    depths = [0],
    seen = new Set([key(solved)]);
  for (let head = 0; head < queue.length; head++)
    for (const op of ops) {
      const next = queue[head].map((code) => op.edges[code]),
        signature = key(next);
      if (!seen.has(signature)) {
        seen.add(signature);
        queue.push(next);
        depths.push(depths[head] + 1);
      }
      if (seen.size > 11520) throw new Error("Unexpected Pyraminx edge group");
    }
  if (seen.size !== 11520)
    throw new Error(
      "Pyraminx groups do not span the complete legal edge space",
    );
  const maximumGroups = Math.max(...depths);
  if (maximumGroups * 16 + 8 > 200)
    throw new Error("Pyraminx edge diameter exceeds the guidance budget");
  return { edgeStates: seen.size, groups: ops.length, maximumGroups };
}
