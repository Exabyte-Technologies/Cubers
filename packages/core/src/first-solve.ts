import {
  FACES,
  solvedCube,
  facelets,
  turn,
  applyMoves,
  isSolved,
  type CubeState,
  type Face,
  type Sticker,
} from "./puzzle";
import { z } from "zod";
import type {
  PyraminxFirstSolvePlan,
  PyraminxSolveStep,
  PyraminxSolveGoal,
} from "./pyraminx-first-solve";
import type { FourFirstSolvePlan, FourSolveStep } from "./four-first-solve";
export const GuidedPuzzle = z.enum(["2x2", "3x3", "4x4", "pyraminx"]);
export type GuidedPuzzle = z.infer<typeof GuidedPuzzle>;
export const GUIDED_COURSE_IDS = [
  "2-first-solve",
  "3-first-solve",
  "4-first-solve",
  "pyra-first-solve",
] as const;
export const guidedCourseId = (puzzle: GuidedPuzzle) =>
  puzzle === "pyraminx"
    ? "pyra-first-solve"
    : puzzle === "4x4"
      ? "4-first-solve"
      : puzzle === "2x2"
        ? "2-first-solve"
        : "3-first-solve";
export const guidedSize = (puzzle: Exclude<GuidedPuzzle, "pyraminx">) =>
  puzzle === "4x4" ? 4 : puzzle === "2x2" ? 2 : 3;
export const guidedPuzzleForCourse = (id: string) =>
  GuidedPuzzle.options.find((puzzle) => guidedCourseId(puzzle) === id);
export const EDGE_PIECES = [
  "UR",
  "UF",
  "UL",
  "UB",
  "DR",
  "DF",
  "DL",
  "DB",
  "FR",
  "FL",
  "BL",
  "BR",
] as const;
export const CORNER_PIECES = [
  "URF",
  "UFL",
  "ULB",
  "UBR",
  "DFR",
  "DLF",
  "DBL",
  "DRB",
] as const;
const identity = (colors: string[]) => [...colors].sort().join("");
export function cubePieces(cube: CubeState) {
  const groups = new Map<string, Sticker[]>();
  for (const sticker of cube.stickers) {
    const key = sticker.p.join(",");
    const group = groups.get(key) || [];
    group.push(sticker);
    groups.set(key, group);
  }
  return [...groups.values()];
}
const canonicalPieces = cubePieces(solvedCube(3));
const locations = (names: readonly string[]) =>
  names.map((name) => {
    const group = canonicalPieces.find(
      (piece) =>
        identity(piece.map((s) => s.color)) === identity(name.split("")),
    )!;
    return {
      position: group[0].p,
      normals: name
        .split("")
        .map((color) => group.find((s) => s.color === color)!.normal),
    };
  });
export const EDGE_LOCATIONS = locations(EDGE_PIECES),
  CORNER_LOCATIONS = locations(CORNER_PIECES);
export type PieceCoordinates = { edges: number[]; corners: number[] };
export function pieceCoordinates(cube: CubeState): PieceCoordinates {
  if (cube.size !== 3) throw new Error("First-solve coordinates require 3×3");
  const edges: number[] = [],
    corners: number[] = [];
  for (const piece of cubePieces(cube)) {
    if (piece.length !== 2 && piece.length !== 3) continue;
    const names = piece.length === 2 ? EDGE_PIECES : CORNER_PIECES;
    const slots = piece.length === 2 ? EDGE_LOCATIONS : CORNER_LOCATIONS;
    const values = piece.length === 2 ? edges : corners;
    const id = names.findIndex(
      (name) =>
        identity(name.split("")) === identity(piece.map((s) => s.color)),
    );
    if (id < 0) throw new Error("Unrecognized cube piece");
    const primary = piece.find((s) => s.color === names[id][0])!;
    const position = slots.findIndex((slot) =>
      slot.position.every((v, i) => v === primary.p[i]),
    );
    const orientation = slots[position]?.normals.findIndex((normal) =>
      normal.every((v, i) => v === primary.normal[i]),
    );
    if (
      position < 0 ||
      orientation === undefined ||
      orientation < 0 ||
      values[id] !== undefined
    )
      throw new Error("Invalid cube piece coordinates");
    values[id] = position * piece.length + orientation;
  }
  if (edges.length !== 12 || corners.length !== 8)
    throw new Error("Incomplete cube");
  return { edges, corners };
}
// Work with center-relative colors internally; display and scan colors stay
// untouched. This lets the standard D-layer goals mean the learner's white.
export function centerRelativeCube(cube: CubeState): CubeState {
  const faces = facelets(cube),
    mapping = new Map<Face, Face>(FACES.map((face) => [faces[face][4], face]));
  if (cube.size !== 3 || mapping.size !== 6)
    throw new Error("Invalid center frame");
  return {
    size: 3,
    stickers: cube.stickers.map((sticker) => ({
      ...sticker,
      color: mapping.get(sticker.color)!,
    })),
  };
}
// A 2×2 has no centers. Keep the captured position frame, with the desired
// solved color scheme white D / green F. Lifting corner coordinates reuses the
// same geometry as 3×3 without imposing its nonexistent edge-parity constraint.
export function twoByTwoCoordinates(cube: CubeState) {
  if (cube.size !== 2) throw new Error("Expected 2×2");
  const target = facelets(applyMoves(solvedCube(3), "z2"));
  const mapping = new Map<Face, Face>(
    FACES.map((face) => [target[face][4], face]),
  );
  const lifted = solvedCube(3);
  for (const sticker of cube.stickers) {
    const destination = lifted.stickers.find(
      (candidate) =>
        candidate.p.every((value, axis) => value === sticker.p[axis] * 2) &&
        candidate.normal.every((value, axis) => value === sticker.normal[axis]),
    );
    if (!destination) throw new Error("Invalid 2×2 corner geometry");
    destination.color = mapping.get(sticker.color)!;
  }
  return pieceCoordinates(lifted).corners;
}
export function whiteDownFrame(cube: CubeState): {
  cube: CubeState;
  orientation: string[];
} {
  if (cube.size !== 3) throw new Error("First solve requires 3×3");
  const pending = [{ cube, orientation: [] as string[] }],
    seen = new Set<string>();
  for (let i = 0; i < pending.length; i++) {
    const current = pending[i],
      faces = facelets(current.cube);
    if (faces.D[4] === "U" && faces.F[4] === "F") return current;
    const key = FACES.map((face) => faces[face][4]).join("");
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 24) break;
    for (const move of ["x", "y"])
      pending.push({
        cube: turn(current.cube, move),
        orientation: [...current.orientation, move],
      });
  }
  throw new Error("Center colors do not form a teaching frame");
}
export function prepareGuidedCube(cube: CubeState) {
  if (cube.size === 3) return whiteDownFrame(cube).cube;
  if (cube.size !== 2 || !isSolved(cube)) return cube;
  const queue = [cube],
    seen = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index],
      faces = facelets(current);
    if (faces.D[0] === "U" && faces.F[0] === "F") return current;
    const key = FACES.map((face) => faces[face][0]).join("");
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 24) break;
    for (const move of ["x", "y"]) queue.push(turn(current, move));
  }
  throw new Error("Invalid finished 2×2 frame");
}
export type FirstSolveGoal =
  | "cross"
  | "corner"
  | "middle"
  | "yellow-cross"
  | "yellow-face"
  | "corner-positions"
  | "solved";
export function firstSolveGoal(
  cube: CubeState,
  goal: FirstSolveGoal,
  target?: number,
) {
  if (cube.size === 2) {
    const corners = twoByTwoCoordinates(cube);
    const firstLayer = [4, 5, 6, 7].every((id) => corners[id] === id * 3);
    if (goal === "corner")
      return (
        [4, 5, 6, 7].includes(target ?? 7) &&
        [4, 5, 6, 7]
          .filter((id) => id <= (target ?? 7))
          .every((id) => corners[id] === id * 3)
      );
    if (goal === "yellow-face")
      return (
        firstLayer &&
        [0, 1, 2, 3].every((id) => corners[id] < 12 && corners[id] % 3 === 0)
      );
    if (goal === "solved" || goal === "corner-positions")
      return firstLayer && [0, 1, 2, 3].every((id) => corners[id] === id * 3);
    return false;
  }
  const { edges, corners } = pieceCoordinates(centerRelativeCube(cube));
  const cross = [4, 5, 6, 7].every((id) => edges[id] === id * 2);
  if (goal === "cross") return cross;
  const layer = cross && [4, 5, 6, 7].every((id) => corners[id] === id * 3);
  if (goal === "corner")
    return (
      [4, 5, 6, 7].includes(target ?? 7) &&
      cross &&
      [4, 5, 6, 7]
        .filter((id) => id <= (target ?? 7))
        .every((id) => corners[id] === id * 3)
    );
  const f2l = layer && [8, 9, 10, 11].every((id) => edges[id] === id * 2);
  if (goal === "middle")
    return (
      [8, 9, 10, 11].includes(target ?? 11) &&
      layer &&
      [8, 9, 10, 11]
        .filter((id) => id <= (target ?? 11))
        .every((id) => edges[id] === id * 2)
    );
  const yellowCross =
    f2l && [0, 1, 2, 3].every((id) => edges[id] < 8 && edges[id] % 2 === 0);
  if (goal === "yellow-cross") return yellowCross;
  const yellowFace =
    yellowCross &&
    [0, 1, 2, 3].every((id) => corners[id] < 12 && corners[id] % 3 === 0);
  if (goal === "yellow-face") return yellowFace;
  const positioned =
    yellowFace && [0, 1, 2, 3].every((id) => corners[id] === id * 3);
  if (goal === "corner-positions") return positioned;
  return positioned && [0, 1, 2, 3].every((id) => edges[id] === id * 2);
}
export type FirstSolveStep = {
  goal: FirstSolveGoal;
  target?: number;
  moves: string[];
  blocks: string[][];
};
export type FirstSolvePlan = {
  version: "3-layer-1" | "2-layer-1";
  puzzle?: GuidedPuzzle;
  orientation: string[];
  startingFaces: Record<Face, Face[]>;
  steps: FirstSolveStep[];
};
export type GuidedSolveView = {
  id: string;
  lessonId?: string;
  setupMoves?: string[];
  puzzle: GuidedPuzzle;
  input: "virtual" | "scan" | "smart";
  status: string;
  version: number;
  stage: number;
  total: number;
  currentFaces: Record<string, string[]>;
  step: GuidedSolveStep | null;
  stageMoves: string[];
  moveCount: number;
  matchedGuide: boolean;
  guideIndex: number;
  canContinueWithoutCheck?: boolean;
  createdAt: string;
  expiresAt: string;
  finishedAt: string | null;
  checkpoints: {
    kind: string;
    goal?: FirstSolveGoal | PyraminxSolveGoal | FourSolveStep["goal"];
    layerGoal?: FirstSolveGoal;
    target?: number;
    at: string;
  }[];
};
export type GuidedSolvePlan = (
  FirstSolvePlan | PyraminxFirstSolvePlan | FourFirstSolvePlan
) & { lessonId?: string; setupMoves?: string[] };
export type GuidedSolveStep =
  FirstSolveStep | PyraminxSolveStep | FourSolveStep;
