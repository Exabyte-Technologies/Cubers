import { type Puzzle } from "./contracts";
import {
  solvedCube,
  applyMoves,
  inverse,
  isSolved,
  stateKey,
  turn,
  fromFacelets,
  validateScan,
  FACES,
  type CubeState,
  type Face,
  scramble,
} from "./puzzle";
import {
  solvedPyraminx,
  pyraminxApply,
  pyraminxInverse,
  pyraminxSolved,
  pyraminxKey,
  pyraminxOrientations,
  pyraminxFromFacelets,
  validatePyraminx,
  type PyraminxState,
  type PyraFace,
  type PyraColor,
  pyraminxScramble,
} from "./pyraminx";
export type PracticeState = CubeState | PyraminxState;
export const isPyraminx = (state: PracticeState): state is PyraminxState =>
  "puzzle" in state;
export function solvedPuzzle(puzzle: Puzzle): PracticeState {
  return puzzle === "pyraminx"
    ? solvedPyraminx()
    : solvedCube(Number(puzzle[0]) as 2 | 3 | 4);
}
export function scramblePuzzle(puzzle: Puzzle, random: () => number): string[] {
  return puzzle === "pyraminx"
    ? pyraminxScramble(random)
    : scramble(Number(puzzle[0]) as 2 | 3 | 4, random);
}
export function practiceSolved(state: PracticeState) {
  return isPyraminx(state) ? pyraminxSolved(state) : isSolved(state);
}
export function practiceApply(
  state: PracticeState,
  moves: string[] | string,
): PracticeState {
  return isPyraminx(state)
    ? pyraminxApply(state, moves)
    : applyMoves(state, moves);
}
export function practiceSetup(
  puzzle: Puzzle,
  algorithm: string,
): PracticeState {
  return puzzle === "pyraminx"
    ? pyraminxApply(solvedPyraminx(), pyraminxInverse(algorithm))
    : applyMoves(
        solvedCube(Number(puzzle[0]) as 2 | 3 | 4),
        inverse(algorithm),
      );
}
export function practiceKey(state: PracticeState) {
  return isPyraminx(state) ? pyraminxKey(state) : stateKey(state);
}
// Whole-puzzle rotations change the camera's view, not the physical position.
export function practiceMatches(
  actual: PracticeState,
  expected: PracticeState,
) {
  if (isPyraminx(actual) !== isPyraminx(expected)) return false;
  const target = practiceKey(expected);
  if (isPyraminx(actual))
    return pyraminxOrientations(actual).some(
      (state) => pyraminxKey(state) === target,
    );
  if (!isPyraminx(expected) && actual.size !== expected.size) return false;
  const queue = [actual],
    seen = new Set<string>();
  while (queue.length) {
    const state = queue.shift()!,
      key = stateKey(state);
    if (key === target) return true;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 24) throw new Error("Invalid cube orientation group");
    queue.push(turn(state, "x"), turn(state, "y"));
  }
  return false;
}
export function practiceScan(
  puzzle: Puzzle,
  faces: Record<string, string[]>,
): PracticeState {
  if (puzzle === "pyraminx") {
    if (Object.keys(faces).sort().join() !== ["F", "R", "L", "D"].sort().join())
      throw new Error("Scan exactly four triangular faces");
    const state = pyraminxFromFacelets(faces as Record<PyraFace, PyraColor[]>),
      result = validatePyraminx(state);
    if (!result.valid)
      throw new Error(result.reason || "Invalid Pyraminx state");
    return state;
  }
  const size = Number(puzzle[0]) as 2 | 3 | 4;
  if (
    Object.keys(faces).sort().join() !== [...FACES].sort().join() ||
    Object.values(faces).some(
      (face) =>
        face.length !== size * size ||
        face.some((color) => !FACES.includes(color as Face)),
    )
  )
    throw new Error("Scan exactly six faces with valid sticker colors");
  const state = fromFacelets(size, faces as Record<Face, Face[]>),
    result = validateScan(state);
  if (!result.valid || !result.complete)
    throw new Error(result.reason || "Invalid cube state");
  return state;
}
