// Original constructive reduction planner. Pure three-piece cycles and their
// complete setup orbits come from Cubers' geometry, not an external solver.
import {
  solvedCube,
  applyMoves,
  inverse,
  facelets,
  validateScan,
  isSolved,
  FOUR_REFERENCE,
  FOUR_CENTER_SLOTS,
  FOUR_WING_SLOTS,
  FOUR_CENTER_COLORS,
  FOUR_CENTER_FACES,
  FOUR_CENTER_ORDER,
  FOUR_PAIR_SLOTS,
  fourCenters,
  fourWings,
  fourCornerParity,
  reduceFour,
  permutationParity,
  fourSolveGoal,
  type CubeState,
  type FourFirstSolvePlan,
  type FourSolveStep,
} from "@cubers/core";
import { planFirstSolve } from "./first-solve-planner";
type Kind = "centers" | "wings";
type Generator = { moves: string[]; centers: Uint8Array; wings: Uint8Array };
const geometricKey = (sticker: CubeState["stickers"][number]) =>
  sticker.p.join(",") + ":" + sticker.normal.join(",");
const canonical = solvedCube(4),
  positionIndex = new Map(
    canonical.stickers.map((s, i) => [geometricKey(s), i]),
  );
const centerSlot = new Map(
    FOUR_CENTER_SLOTS.map((piece, i) => [piece[0].p.join(","), i]),
  ),
  wingSlot = new Map(
    FOUR_WING_SLOTS.map((piece, i) => [piece[0].p.join(","), i]),
  );
const centerSticker = FOUR_CENTER_SLOTS.map((piece) =>
    positionIndex.get(geometricKey(piece[0]))!,
  ),
  wingSticker = FOUR_WING_SLOTS.map((piece) =>
    positionIndex.get(geometricKey(piece[0]))!,
  );
function geometry(moves: string[]) {
  const moved = applyMoves(canonical, moves),
    all = moved.stickers.map((sticker) =>
      positionIndex.get(geometricKey(sticker))!,
    );
  return {
    all,
    centers: Uint8Array.from(
      centerSticker.map((index) =>
        centerSlot.get(moved.stickers[index].p.join(","))!,
      ),
    ),
    wings: Uint8Array.from(
      wingSticker.map((index) =>
        wingSlot.get(moved.stickers[index].p.join(","))!,
      ),
    ),
  };
}
const generators: Generator[] = ["U", "R", "F", "D", "L", "B"]
  .flatMap((face) =>
    ["", "'", "2"].flatMap((suffix) => [
      [face + suffix],
      [face + "w" + suffix, ...inverse([face + suffix])],
    ]),
  )
  .map((moves) => ({ moves, ...geometry(moves) }));
const seeds: Record<Kind, string[]> = {
  centers: [
    "U",
    "Rw",
    "R'",
    "U'",
    "Fw",
    "F'",
    "U",
    "R",
    "Rw'",
    "U'",
    "F",
    "Fw'",
  ],
  wings: ["U", "R", "U'", "Rw", "R'", "U", "R'", "U'", "R", "Rw'"],
};
const tripleKey = ([a, b, c]: number[]) => (a * 24 + b) * 24 + c;
type Orbit = {
  root: number;
  parents: Int16Array;
  via: Uint8Array;
  count: number;
  maximum: number;
};
const orbits: Partial<Record<Kind, Orbit>> = {};
function orbit(kind: Kind): Orbit {
  if (orbits[kind]) return orbits[kind]!;
  const permutation = geometry(seeds[kind]),
    supported = new Set(
      kind === "centers"
        ? centerSticker
        : FOUR_WING_SLOTS.flatMap((piece) =>
            piece.map((sticker) => positionIndex.get(geometricKey(sticker))!),
          ),
    );
  if (permutation.all.some((to, from) => to !== from && !supported.has(from)))
    throw new Error("Reduction cycle changed another piece type");
  const moved = Array.from(permutation[kind])
    .map((to, from) => (to === from ? -1 : from))
    .filter((value) => value >= 0);
  if (moved.length !== 3)
    throw new Error("Reduction seed must be a pure three-piece cycle");
  const a = moved[0],
    b = permutation[kind][a],
    c = permutation[kind][b];
  if (new Set([a, b, c]).size !== 3 || permutation[kind][c] !== a)
    throw new Error("Invalid reduction cycle");
  const root = tripleKey([a, b, c]),
    parents = new Int16Array(24 ** 3).fill(-1),
    via = new Uint8Array(24 ** 3),
    depths = new Uint8Array(24 ** 3),
    queue = new Uint16Array(24 ** 3);
  parents[root] = root;
  queue[0] = root;
  let count = 1,
    maximum = 0;
  for (let head = 0; head < count; head++) {
    const current = queue[head],
      a = Math.floor(current / 576),
      b = Math.floor(current / 24) % 24,
      c = current % 24;
    for (let index = 0; index < generators.length; index++) {
      const permutation = generators[index][kind],
        next = (permutation[a] * 24 + permutation[b]) * 24 + permutation[c];
      if (parents[next] !== -1) continue;
      parents[next] = current;
      via[next] = index;
      depths[next] = depths[current] + 1;
      maximum = Math.max(maximum, depths[next]);
      queue[count++] = next;
    }
  }
  if (count !== 24 * 23 * 22)
    throw new Error("Reduction setup orbit is incomplete");
  return (orbits[kind] = { root, parents, via, count, maximum });
}
function simplify(moves: string[]) {
  const result: string[] = [];
  const amount = (move: string) =>
    move.endsWith("2") ? 2 : move.endsWith("'") ? 3 : 1;
  for (const move of moves) {
    const base = move.replace(/(2|')$/, ""),
      last = result.at(-1);
    if (last?.replace(/(2|')$/, "") === base) {
      result.pop();
      const turns = (amount(last) + amount(move)) % 4;
      if (turns)
        result.push(base + (turns === 2 ? "2" : turns === 3 ? "'" : ""));
    } else result.push(move);
  }
  return result;
}
export function fourPieceCycle(kind: Kind, positions: number[]) {
  if (
    positions.length !== 3 ||
    new Set(positions).size !== 3 ||
    positions.some(
      (value) => !Number.isInteger(value) || value < 0 || value >= 24,
    )
  )
    throw new Error("Cycle needs three distinct reduction positions");
  const table = orbit(kind),
    path: string[][] = [];
  for (
    let at = tripleKey(positions);
    at !== table.root;
    at = table.parents[at]
  ) {
    if (at < 0 || table.parents[at] < 0)
      throw new Error("Unreachable reduction setup");
    path.push(generators[table.via[at]].moves);
  }
  const setup = path.reverse().flat();
  return simplify([...inverse(setup), ...seeds[kind], ...setup]);
}
function rotatePermutation(values: number[], [a, b, c]: number[]) {
  const first = values[a];
  values[a] = values[c];
  values[c] = values[b];
  values[b] = first;
}
function nextCycle(values: number[], target: number) {
  const donor = values.indexOf(target),
    buffer = values.findIndex(
      (value, slot) => slot !== target && slot !== donor && value !== slot,
    );
  if (donor === target || donor < 0 || buffer < 0)
    throw new Error(
      "Reduction permutation is not a nontrivial even permutation",
    );
  return [donor, target, buffer];
}
function centerAssignment(state: CubeState) {
  const colors = fourCenters(state),
    complete = new Set(
      FOUR_CENTER_ORDER.filter((face) =>
        colors.every(
          (color, slot) =>
            FOUR_CENTER_FACES[slot] !== face ||
            color === FOUR_CENTER_COLORS[slot],
        ),
      ),
    );
  const values = colors.map((color, slot) =>
      color === FOUR_CENTER_COLORS[slot] ? slot : -1,
    ),
    used = new Set(values.filter((value) => value >= 0));
  for (let slot = 0; slot < 24; slot++)
    if (values[slot] < 0) {
      values[slot] = FOUR_CENTER_COLORS.findIndex(
        (color, target) => color === colors[slot] && !used.has(target),
      );
      if (values[slot] < 0) throw new Error("Invalid center color quota");
      used.add(values[slot]);
    }
  if (permutationParity(values)) {
    let pair: number[] | undefined;
    for (let a = 0; a < 24 && !pair; a++)
      for (let b = a + 1; b < 24; b++)
        if (
          !complete.has(FOUR_CENTER_FACES[a]) &&
          !complete.has(FOUR_CENTER_FACES[b]) &&
          colors[a] === colors[b]
        ) {
          pair = [a, b];
          break;
        }
    if (!pair)
      throw new Error("No indistinguishable center labels can resolve parity");
    [values[pair[0]], values[pair[1]]] = [values[pair[1]], values[pair[0]]];
  }
  return values;
}
export function planFourFirstSolve(input: CubeState): FourFirstSolvePlan {
  if (input.size !== 4 || !validateScan(input).valid)
    throw new Error("A valid complete 4×4 scan is required");
  let state = input;
  const steps: FourSolveStep[] = [],
    startingFaces = facelets(state);
  const save = (
    step: Omit<FourSolveStep, "moves" | "blocks">,
    blocks: string[][],
  ) => {
    const moves = blocks.flat();
    state = applyMoves(state, moves);
    if (!fourSolveGoal(state, { ...step, moves, blocks }))
      throw new Error("Invalid 4×4 teaching checkpoint");
    steps.push({ ...step, moves, blocks });
  };
  save(
    { goal: "four-even-wings" },
    permutationParity(fourWings(state)) ? [["Rw", "R'"]] : [],
  );
  const centers = centerAssignment(state);
  for (let target = 0; target < 6; target++) {
    const blocks: string[][] = [];
    for (let slot = 0; slot < 24; slot++)
      if (FOUR_CENTER_FACES[slot] === FOUR_CENTER_ORDER[target])
        while (centers[slot] !== slot) {
          const cycle = nextCycle(centers, slot);
          blocks.push(fourPieceCycle("centers", cycle));
          rotatePermutation(centers, cycle);
        }
    save({ goal: "four-centers", target }, blocks);
  }
  const cornerParity = fourCornerParity(state);
  let wingTarget: number[];
  try {
    reduceFour(state);
    wingTarget = fourWings(state);
  } catch {
    wingTarget = fourWings(
      cornerParity ? applyMoves(FOUR_REFERENCE, "R") : FOUR_REFERENCE,
    );
  }
  const destination = Array.from({ length: 24 }, (_, id) =>
      wingTarget.indexOf(id),
    ),
    wings = fourWings(state).map((id) => destination[id]);
  if (permutationParity(wings)) throw new Error("Wing parity was not prepared");
  for (let target = 0; target < 12; target++) {
    const blocks: string[][] = [];
    for (const slot of FOUR_PAIR_SLOTS[target])
      while (wings[slot] !== slot) {
        const cycle = nextCycle(wings, slot);
        blocks.push(fourPieceCycle("wings", cycle));
        rotatePermutation(wings, cycle);
      }
    save({ goal: "four-pair", target, wingTarget, cornerParity }, blocks);
  }
  const reducedPlan = planFirstSolve(reduceFour(state));
  if (reducedPlan.orientation.length)
    throw new Error("Reduction changed the teaching frame");
  for (const step of reducedPlan.steps)
    save(
      {
        goal: "four-layer",
        layerGoal: step.goal,
        ...(step.target === undefined ? {} : { target: step.target }),
      },
      step.blocks,
    );
  if (!isSolved(state)) throw new Error("4×4 reconstruction did not finish");
  if (steps.flatMap((step) => step.moves).length > 2500)
    throw new Error("4×4 reduction exceeds its move budget");
  return {
    version: "4-reduction-1",
    puzzle: "4x4",
    orientation: [],
    startingFaces,
    steps,
  };
}
export function fourGuidanceSpaceSummary() {
  const centers = orbit("centers"),
    wings = orbit("wings");
  return {
    centerTriples: centers.count,
    centerMaximumSetup: centers.maximum,
    wingTriples: wings.count,
    wingMaximumSetup: wings.maximum,
  };
}
