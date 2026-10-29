import {
  solvedCube,
  applyMoves,
  facelets,
  fromFacelets,
  validateScan,
  type CubeState,
  type Face,
  type Sticker,
  turn,
} from "./puzzle";
import {
  cubePieces,
  centerRelativeCube,
  pieceCoordinates,
  EDGE_PIECES,
  firstSolveGoal,
  type FirstSolveGoal,
} from "./first-solve";
export const FOUR_CENTER_ORDER: Face[] = ["D", "F", "R", "L", "B", "U"];
export const FOUR_REFERENCE = applyMoves(solvedCube(4), "z2");
const canonical = cubePieces(solvedCube(4));
export const FOUR_CENTER_SLOTS = canonical.filter(
  (piece) => piece.length === 1,
);
export const FOUR_WING_SLOTS = canonical.filter((piece) => piece.length === 2);
const position = (piece: Sticker[]) => piece[0].p.join(",");
const wingIdentity = (piece: Sticker[]) => {
  const [a, b] = [...piece].sort((x, y) => x.color.localeCompare(y.color));
  const cross = [
    a.normal[1] * b.normal[2] - a.normal[2] * b.normal[1],
    a.normal[2] * b.normal[0] - a.normal[0] * b.normal[2],
    a.normal[0] * b.normal[1] - a.normal[1] * b.normal[0],
  ];
  return (
    a.color +
    b.color +
    ":" +
    Math.sign(
      cross.reduce((sum, value, axis) => sum + value * (a.p[axis] - 1.5), 0),
    )
  );
};
const referencePieces = new Map(
  cubePieces(FOUR_REFERENCE).map((piece) => [position(piece), piece]),
);
const wingIdentities = FOUR_WING_SLOTS.map((piece) =>
  wingIdentity(referencePieces.get(position(piece))!),
);
export const FOUR_WING_COLORS = FOUR_WING_SLOTS.map((piece) =>
  referencePieces.get(position(piece))!.map((sticker) => sticker.color),
);
export const FOUR_CENTER_COLORS = FOUR_CENTER_SLOTS.map(
  (piece) => referencePieces.get(position(piece))![0].color,
);
export const FOUR_CENTER_FACES = FOUR_CENTER_SLOTS.map(
  (piece) => piece[0].color,
);
export const FOUR_PAIR_SLOTS = EDGE_PIECES.map((name) =>
  FOUR_WING_SLOTS.map((piece, index) => ({ piece, index }))
    .filter(
      ({ piece }) =>
        piece
          .map((sticker) => sticker.color)
          .sort()
          .join("") === name.split("").sort().join(""),
    )
    .map(({ index }) => index),
);
export const permutationParity = (values: number[]) => {
  let parity = 0;
  for (let a = 0; a < values.length; a++)
    for (let b = a + 1; b < values.length; b++)
      if (values[a] > values[b]) parity ^= 1;
  return parity;
};
export function fourCenters(state: CubeState) {
  if (state.size !== 4) throw new Error("Expected 4×4");
  const pieces = new Map(
    cubePieces(state).map((piece) => [position(piece), piece]),
  );
  return FOUR_CENTER_SLOTS.map((slot) => pieces.get(position(slot))![0].color);
}
export function fourWings(state: CubeState) {
  if (state.size !== 4) throw new Error("Expected 4×4");
  const pieces = new Map(
    cubePieces(state).map((piece) => [position(piece), piece]),
  );
  const identities = FOUR_WING_SLOTS.map((slot) =>
    wingIdentities.indexOf(wingIdentity(pieces.get(position(slot))!)),
  );
  if (identities.includes(-1) || new Set(identities).size !== 24)
    throw new Error("Invalid 4×4 wing identities");
  return identities;
}
export function fourCornerParity(state: CubeState) {
  const small = applyMoves(solvedCube(3), "z2");
  for (const piece of cubePieces(state).filter((group) => group.length === 3))
    for (const sticker of piece) {
      const target = small.stickers.find(
        (candidate) =>
          candidate.p.every(
            (value, axis) => value === (sticker.p[axis] * 2) / 3,
          ) &&
          candidate.normal.every(
            (value, axis) => value === sticker.normal[axis],
          ),
      );
      if (!target) throw new Error("Invalid 4×4 corner geometry");
      target.color = sticker.color;
    }
  return permutationParity(
    pieceCoordinates(centerRelativeCube(small)).corners.map((code) =>
      Math.floor(code / 3),
    ),
  );
}
export function fourCentersReady(state: CubeState) {
  return fourCenters(state).every(
    (color, slot) => color === FOUR_CENTER_COLORS[slot],
  );
}
export function reduceFour(state: CubeState): CubeState {
  if (!fourCentersReady(state))
    throw new Error("Complete the six center colors before reduction");
  const large = facelets(state),
    small = facelets(solvedCube(3));
  for (const face of Object.keys(large) as Face[]) {
    const f = large[face];
    for (const pair of [
      [1, 2],
      [4, 8],
      [7, 11],
      [13, 14],
    ])
      if (f[pair[0]] !== f[pair[1]])
        throw new Error("Every pair of wings must match");
    small[face] = [f[0], f[1], f[3], f[4], f[5], f[7], f[12], f[13], f[15]];
  }
  const reduced = fromFacelets(3, small),
    result = validateScan(reduced);
  if (!result.valid)
    throw new Error(result.reason || "Reduction parity remains");
  return reduced;
}
export function prepareGuidedFour(state: CubeState) {
  if (state.size !== 4) throw new Error("Expected 4×4");
  const colors = fourCenters(state);
  if (
    !FOUR_CENTER_ORDER.every(
      (face) =>
        new Set(colors.filter((_, slot) => FOUR_CENTER_FACES[slot] === face))
          .size === 1,
    )
  )
    return state;
  const queue = [state],
    seen = new Set<string>();
  for (let at = 0; at < queue.length; at++) {
    const current = queue[at],
      signature = fourCenters(current).join("");
    if (seen.has(signature)) continue;
    seen.add(signature);
    if (fourCentersReady(current)) return current;
    if (seen.size <= 24) queue.push(turn(current, "x"), turn(current, "y"));
  }
  return state;
}
export type FourSolveStep = {
  goal: "four-even-wings" | "four-centers" | "four-pair" | "four-layer";
  target?: number;
  layerGoal?: FirstSolveGoal;
  wingTarget?: number[];
  cornerParity?: number;
  moves: string[];
  blocks: string[][];
};
export type FourFirstSolvePlan = {
  version: "4-reduction-1";
  puzzle: "4x4";
  orientation: string[];
  startingFaces: Record<Face, Face[]>;
  steps: FourSolveStep[];
};
export function fourSolveGoal(state: CubeState, step: FourSolveStep) {
  if (state.size !== 4) return false;
  if (step.goal === "four-even-wings")
    return permutationParity(fourWings(state)) === 0;
  const centers = fourCenters(state);
  if (step.goal === "four-centers")
    return (
      Number.isInteger(step.target) &&
      step.target! >= 0 &&
      step.target! < 6 &&
      permutationParity(fourWings(state)) === 0 &&
      FOUR_CENTER_ORDER.slice(0, step.target! + 1).every((face) =>
        centers.every(
          (color, slot) =>
            FOUR_CENTER_FACES[slot] !== face ||
            color === FOUR_CENTER_COLORS[slot],
        ),
      )
    );
  if (step.goal === "four-pair") {
    if (
      !fourCentersReady(state) ||
      step.wingTarget?.length !== 24 ||
      fourCornerParity(state) !== step.cornerParity ||
      !Number.isInteger(step.target) ||
      step.target! < 0 ||
      step.target! >= 12
    )
      return false;
    const wings = fourWings(state);
    return FOUR_PAIR_SLOTS.slice(0, step.target! + 1)
      .flat()
      .every((slot) => wings[slot] === step.wingTarget![slot]);
  }
  try {
    return (
      step.goal === "four-layer" &&
      !!step.layerGoal &&
      firstSolveGoal(reduceFour(state), step.layerGoal, step.target)
    );
  } catch {
    return false;
  }
}
