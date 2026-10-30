// Original bounded layer-by-layer planner. Geometry supplies all move tables;
// no AI, external solution API or Kociemba sequence is involved.
import {
  applyMoves,
  solvedCube,
  turn,
  stateKey,
  facelets,
  inverse,
  validateScan,
  EDGE_LOCATIONS,
  CORNER_LOCATIONS,
  pieceCoordinates,
  centerRelativeCube,
  whiteDownFrame,
  firstSolveGoal,
  twoByTwoCoordinates,
  type CubeState,
  type FirstSolveStep,
  type FirstSolvePlan,
} from "@cubers/core";
const turns = ["U", "R", "F", "D", "L", "B"].flatMap((face) => [
  face,
  face + "'",
  face + "2",
]);
type Operation = { moves: string[]; edges: Uint8Array; corners: Uint8Array };
function geometryTable(
  locations: typeof EDGE_LOCATIONS,
  count: number,
  move: string,
) {
  return Uint8Array.from({ length: 24 }, (_, code) => {
    const location = locations[Math.floor(code / count)];
    const sticker = turn(
      {
        size: 3,
        stickers: [
          {
            p: location.position,
            normal: location.normals[code % count],
            color: "U",
          },
        ],
      },
      move,
    ).stickers[0];
    const position = locations.findIndex((slot) =>
      slot.position.every((value, axis) => value === sticker.p[axis]),
    );
    const orientation = locations[position].normals.findIndex((normal) =>
      normal.every((value, axis) => value === sticker.normal[axis]),
    );
    return position * count + orientation;
  });
}
const outer = turns.map((move) => ({
  moves: [move],
  edges: geometryTable(EDGE_LOCATIONS, 2, move),
  corners: geometryTable(CORNER_LOCATIONS, 3, move),
}));
function operation(moves: string[]): Operation {
  const sequence = moves.map((move) => {
    const result = outer.find((op) => op.moves[0] === move);
    if (!result) throw new Error("Planner supports outer face turns only");
    return result;
  });
  return {
    moves,
    edges: Uint8Array.from({ length: 24 }, (_, code) =>
      sequence.reduce((code, op) => op.edges[code], code),
    ),
    corners: Uint8Array.from({ length: 24 }, (_, code) =>
      sequence.reduce((code, op) => op.corners[code], code),
    ),
  };
}
function conjugates(algorithms: string[]) {
  const result = new Map<string, Operation>();
  for (const rotation of [[], ["y"], ["y2"], ["y'"]]) {
    const mapping = new Map(
      turns.map((move) => {
        const expected = stateKey(
          applyMoves(solvedCube(), [...rotation, move, ...inverse(rotation)]),
        );
        const translated = turns.find(
          (candidate) => stateKey(turn(solvedCube(), candidate)) === expected,
        );
        if (!translated) throw new Error("Invalid frame conjugation");
        return [move, translated];
      }),
    );
    for (const algorithm of algorithms) {
      const translated = algorithm.split(" ").map((move) => mapping.get(move)!);
      for (const moves of [translated, inverse(translated)])
        result.set(moves.join(" "), operation(moves));
    }
  }
  return [...result.values()];
}
const top = outer.filter((op) => op.moves[0][0] === "U");
// Teach a repeatable trigger rather than the shortest three-turn insertion.
// These are the four y-frame equivalents of R U R' U'. No inverse trigger:
// a beginner learns one muscle-memory pattern and repeats it when necessary.
const cornerTriggers = conjugates(["R U R' U'"]).filter(
  (op) => op.moves[0][0] !== "U",
);
const cornerInsert = [...top, ...cornerTriggers];
function beginnerCorner(coordinate: number, target: number): Operation[] {
  if (coordinate === target * 3) return [];
  const result: Operation[] = [];
  const use = (op: Operation) => {
    result.push(op);
    coordinate = op.corners[coordinate];
  };
  const triggerAt = (slot: number) => {
    const op = cornerTriggers.find((op) => op.corners[slot * 3] !== slot * 3);
    if (!op) throw Error("Missing beginner corner trigger");
    return op;
  };
  // A corner trapped in the bottom layer must first be lifted. Each complete
  // trigger restores the cross and every other bottom corner.
  if (Math.floor(coordinate / 3) >= 4)
    use(triggerAt(Math.floor(coordinate / 3)));
  const above = target - 4;
  if (Math.floor(coordinate / 3) !== above) {
    const align = top.find(
      (op) => Math.floor(op.corners[coordinate] / 3) === above,
    );
    if (!align) throw Error("Corner was not lifted to the top layer");
    use(align);
  }
  const trigger = triggerAt(target);
  for (let repeat = 0; coordinate !== target * 3 && repeat < 6; repeat++)
    use(trigger);
  if (coordinate !== target * 3)
    throw Error("Beginner corner insertion failed");
  return result;
}
const middleInsert = [
  ...top,
  ...conjugates(["U R U' R' U' F' U F", "U' L' U L U F U' F'"]),
];
const yellowEdges = [...top, ...conjugates(["F R U R' U' F'"])];
const yellowCorners = [...top, ...conjugates(["R U R' U R U2 R'"])];
const permuteCorners = [
  ...top,
  ...conjugates(["R U R' U' R' F R2 U' R' U' R U R' F'"]),
];
const permuteEdges = conjugates(["R2 U R U R' U' R' U' R' U R'"]);
const key = (codes: number[]) =>
  codes.reduceRight((sum, code) => sum * 24 + code, 0);
let crossDistances: Uint8Array | undefined;
function crossTable() {
  if (crossDistances) return crossDistances;
  const distances = new Uint8Array(24 ** 4).fill(255),
    queue = new Uint32Array(24 ** 4);
  const target = key([8, 10, 12, 14]);
  distances[target] = 0;
  queue[0] = target;
  let end = 1;
  for (let head = 0; head < end; head++) {
    const current = queue[head],
      a = current % 24,
      b = Math.floor(current / 24) % 24,
      c = Math.floor(current / 576) % 24,
      d = Math.floor(current / 13824);
    for (const op of outer) {
      // The same base-24 key, without millions of temporary arrays/reductions.
      const next =
        op.edges[a] +
        24 * op.edges[b] +
        576 * op.edges[c] +
        13824 * op.edges[d];
      if (distances[next] !== 255) continue;
      distances[next] = distances[current] + 1;
      queue[end++] = next;
    }
  }
  if (end !== 190080)
    throw new Error("Cross table does not cover the complete piece space");
  crossDistances = distances;
  return distances;
}
const preserves = (op: Operation, edges: number[], corners: number[]) =>
  edges.every((id) => op.edges[id * 2] === id * 2) &&
  corners.every((id) => op.corners[id * 3] === id * 3);
function search(
  codes: number[],
  type: "edges" | "corners",
  operations: Operation[],
  goal: (codes: number[]) => boolean,
  maximum: number,
): Operation[] {
  if (goal(codes)) return [];
  const nodes = [{ codes, parent: -1, operation: -1 }],
    seen = new Set([key(codes)]);
  for (let head = 0; head < nodes.length; head++) {
    if (nodes.length > maximum)
      throw new Error("Stage search exceeded its verified state space");
    for (let index = 0; index < operations.length; index++) {
      const op = operations[index],
        next = nodes[head].codes.map((code) => op[type][code]),
        nextKey = key(next);
      if (seen.has(nextKey)) continue;
      seen.add(nextKey);
      nodes.push({ codes: next, parent: head, operation: index });
      if (goal(next)) {
        const path: Operation[] = [];
        for (
          let at = nodes.length - 1;
          nodes[at].parent !== -1;
          at = nodes[at].parent
        )
          path.push(operations[nodes[at].operation]);
        return path.reverse();
      }
    }
  }
  throw new Error("Valid cube has an unreachable teaching stage");
}
export function planFirstSolve(input: CubeState): FirstSolvePlan {
  if (input.size === 2) return planTwoByTwo(input);
  if (input.size !== 3 || !validateScan(input).valid)
    throw new Error("A complete valid 3×3 scan is required");
  const framed = whiteDownFrame(input);
  let cube = centerRelativeCube(framed.cube);
  const steps: FirstSolveStep[] = [];
  const save = (
    goal: FirstSolveStep["goal"],
    operations: Operation[],
    target?: number,
  ) => {
    const moves = operations.flatMap((op) => op.moves);
    cube = applyMoves(cube, moves);
    if (!firstSolveGoal(cube, goal, target))
      throw new Error("Planned checkpoint does not satisfy its goal");
    steps.push({
      goal,
      ...(target === undefined ? {} : { target }),
      moves,
      blocks: operations.map((op) => op.moves),
    });
  };
  const table = crossTable(),
    cross: Operation[] = [];
  let codes = pieceCoordinates(cube).edges.slice(4, 8);
  while (table[key(codes)] !== 0) {
    const distance = table[key(codes)];
    const op = outer.find(
      (op) => table[key(codes.map((code) => op.edges[code]))] === distance - 1,
    );
    if (!op || distance === 255) throw new Error("Invalid cross state");
    cross.push(op);
    codes = codes.map((code) => op.edges[code]);
  }
  save("cross", cross);
  for (let target = 4; target < 8; target++) {
    const coordinate = pieceCoordinates(cube).corners[target];
    save("corner", beginnerCorner(coordinate, target), target);
  }
  for (let target = 8; target < 12; target++) {
    const allowed = middleInsert.filter((op) =>
      preserves(
        op,
        [4, 5, 6, 7, ...[8, 9, 10, 11].filter((id) => id < target)],
        [4, 5, 6, 7],
      ),
    );
    const coordinate = pieceCoordinates(cube).edges[target];
    save(
      "middle",
      search(
        [coordinate],
        "edges",
        allowed,
        ([code]) => code === target * 2,
        24,
      ),
      target,
    );
  }
  const fixedEdges = [4, 5, 6, 7, 8, 9, 10, 11],
    fixedCorners = [4, 5, 6, 7];
  save(
    "yellow-cross",
    search(
      pieceCoordinates(cube).edges.slice(0, 4),
      "edges",
      yellowEdges.filter((op) => preserves(op, fixedEdges, fixedCorners)),
      (codes) => codes.every((code) => code < 8 && code % 2 === 0),
      192,
    ),
  );
  save(
    "yellow-face",
    search(
      pieceCoordinates(cube).corners.slice(0, 4),
      "corners",
      yellowCorners.filter((op) => preserves(op, fixedEdges, fixedCorners)),
      (codes) => codes.every((code) => code < 12 && code % 3 === 0),
      648,
    ),
  );
  save(
    "corner-positions",
    search(
      pieceCoordinates(cube).corners.slice(0, 4),
      "corners",
      permuteCorners.filter((op) => preserves(op, fixedEdges, fixedCorners)),
      (codes) => codes.every((code, id) => code === id * 3),
      24,
    ),
  );
  save(
    "solved",
    search(
      pieceCoordinates(cube).edges.slice(0, 4),
      "edges",
      permuteEdges.filter((op) =>
        preserves(op, fixedEdges, [0, 1, 2, 3, ...fixedCorners]),
      ),
      (codes) => codes.every((code, id) => code === id * 2),
      12,
    ),
  );
  if (steps.flatMap((step) => step.moves).length > 500)
    throw new Error("Guided solution exceeds its move budget");
  return {
    version: "3-layer-1",
    puzzle: "3x3",
    orientation: framed.orientation,
    startingFaces: facelets(framed.cube),
    steps,
  };
}
function planTwoByTwo(input: CubeState): FirstSolvePlan {
  if (!validateScan(input).valid)
    throw new Error("A valid complete 2×2 scan is required");
  let cube = input;
  const steps: FirstSolveStep[] = [];
  const save = (
    goal: FirstSolveStep["goal"],
    operations: Operation[],
    target?: number,
  ) => {
    const moves = operations.flatMap((op) => op.moves);
    cube = applyMoves(cube, moves);
    if (!firstSolveGoal(cube, goal, target))
      throw new Error("Invalid 2×2 teaching checkpoint");
    steps.push({
      goal,
      ...(target === undefined ? {} : { target }),
      moves,
      blocks: operations.map((op) => op.moves),
    });
  };
  for (let target = 4; target < 8; target++) {
    save(
      "corner",
      beginnerCorner(twoByTwoCoordinates(cube)[target], target),
      target,
    );
  }
  const bottom = [4, 5, 6, 7];
  save(
    "yellow-face",
    search(
      twoByTwoCoordinates(cube).slice(0, 4),
      "corners",
      yellowCorners.filter((op) => preserves(op, [], bottom)),
      (codes) => codes.every((code) => code < 12 && code % 3 === 0),
      648,
    ),
  );
  save(
    "solved",
    search(
      twoByTwoCoordinates(cube).slice(0, 4),
      "corners",
      permuteCorners.filter((op) => preserves(op, [], bottom)),
      (codes) => codes.every((code, id) => code === id * 3),
      24,
    ),
  );
  if (steps.flatMap((step) => step.moves).length > 500)
    throw new Error("2×2 plan exceeds move budget");
  return {
    version: "2-layer-1",
    puzzle: "2x2",
    orientation: [],
    startingFaces: facelets(input),
    steps,
  };
}
export function firstSolveSpaceSummary() {
  const distances = crossTable();
  const fixedEdges = [4, 5, 6, 7, 8, 9, 10, 11],
    fixedCorners = [4, 5, 6, 7];
  const count = (
    codes: number[],
    type: "edges" | "corners",
    operations: Operation[],
    starts: number[][] = [codes],
  ) => {
    const queue = [...starts],
      seen = new Set(starts.map(key));
    for (let head = 0; head < queue.length; head++)
      for (const op of operations) {
        const next = queue[head].map((code) => op[type][code]),
          value = key(next);
        if (!seen.has(value)) {
          seen.add(value);
          queue.push(next);
        }
        if (seen.size > 2000)
          throw new Error("Unexpected last-layer group size");
      }
    return seen.size;
  };
  const permutations = (values: number[]): number[][] =>
    values.length === 0
      ? [[]]
      : values.flatMap((value, index) =>
          permutations(values.filter((_, i) => i !== index)).map((rest) => [
            value,
            ...rest,
          ]),
        );
  return {
    crossStates: distances.filter((distance) => distance !== 255).length,
    crossMaximum: distances.reduce(
      (maximum, distance) =>
        distance === 255 ? maximum : Math.max(maximum, distance),
      0,
    ),
    cornerPlacements: [4, 5, 6, 7].map((target) =>
      count(
        [target * 3],
        "corners",
        cornerInsert.filter((op) =>
          preserves(
            op,
            [4, 5, 6, 7],
            fixedCorners.filter((id) => id < target),
          ),
        ),
      ),
    ),
    middlePlacements: [8, 9, 10, 11].map((target) =>
      count(
        [target * 2],
        "edges",
        middleInsert.filter((op) =>
          preserves(
            op,
            [...[4, 5, 6, 7], ...[8, 9, 10, 11].filter((id) => id < target)],
            fixedCorners,
          ),
        ),
      ),
    ),
    yellowEdgeStates: count(
      [0, 2, 4, 6],
      "edges",
      yellowEdges.filter((op) => preserves(op, fixedEdges, fixedCorners)),
    ),
    yellowCornerStates: count(
      [0, 3, 6, 9],
      "corners",
      yellowCorners.filter((op) => preserves(op, fixedEdges, fixedCorners)),
      // Orientation has 24 valid permutation goals. Sune/U has several
      // components; reverse reachability from ALL oriented goals verifies
      // every legal orientation/permutation, not just the solved component.
      permutations([0, 3, 6, 9]),
    ),
    cornerPermutations: count(
      [0, 3, 6, 9],
      "corners",
      permuteCorners.filter((op) => preserves(op, fixedEdges, fixedCorners)),
    ),
    finalEdgePermutations: count(
      [0, 2, 4, 6],
      "edges",
      permuteEdges.filter((op) =>
        preserves(op, fixedEdges, [0, 1, 2, 3, ...fixedCorners]),
      ),
    ),
  };
}
