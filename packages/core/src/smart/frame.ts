import { z } from "zod";
import {
  FACES,
  applyMoves,
  facelets,
  inverse,
  solvedCube,
  turn,
  type CubeState,
  type Face,
} from "../puzzle";
import { smartFacelets } from "./cubies";
import type { SmartSessionEvent } from "./session";

const opposite: Record<Face, Face> = {
  U: "D",
  D: "U",
  R: "L",
  L: "R",
  F: "B",
  B: "F",
};
/** Center colors at the learner's top and front, not gyro or world coordinates. */
export const SmartReference = z
  .object({
    up: z.enum(FACES),
    front: z.enum(FACES),
  })
  .strict()
  .refine(
    ({ up, front }) => up !== front && opposite[up] !== front,
    "Top and front must be adjacent center colors",
  );
export type SmartReference = z.infer<typeof SmartReference>;
export const SMART_HARDWARE_REFERENCE: Readonly<SmartReference> = Object.freeze(
  { up: "U", front: "F" },
);
export const SMART_FIRST_SOLVE_REFERENCE: Readonly<SmartReference> =
  Object.freeze({ up: "D", front: "F" });

type Orientation = { centers: Record<Face, Face>; moves: readonly string[] };
let orientations: Orientation[] | undefined;
function allOrientations(): Orientation[] {
  if (orientations) return orientations;
  const queue = [{ cube: solvedCube(), moves: [] as string[] }],
    seen = new Set<string>(),
    result: Orientation[] = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i],
      colors = facelets(item.cube),
      centers = Object.fromEntries(
        FACES.map((f) => [f, colors[f][4]]),
      ) as Record<Face, Face>,
      key = FACES.map((f) => centers[f]).join("");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ centers, moves: Object.freeze([...item.moves]) });
    for (const move of ["x", "y"])
      queue.push({ cube: turn(item.cube, move), moves: [...item.moves, move] });
  }
  if (result.length !== 24) throw new Error("Invalid rigid cube orientations");
  orientations = result;
  return result;
}
function position(state: CubeState): CubeState {
  if (state.size !== 3 || state.stickers.length !== 54)
    throw new Error("Smart reference mapping requires a complete 3×3 position");
  const faces = facelets(state);
  // Also rejects bad geometry, unknown colors, impossible pieces and a changed
  // hardware center frame. Never relabel sticker colors to make a state fit.
  return smartFacelets(FACES.flatMap((f) => faces[f]));
}

/** Immutable, explicitly selected rigid reference for one connection epoch. */
export class SmartCubeFrame {
  private readonly rotations: readonly string[];
  private readonly undoRotations: readonly string[];
  private readonly forward: Readonly<Record<Face, Face>>;
  private readonly backward: Readonly<Record<Face, Face>>;
  readonly reference: Readonly<SmartReference>;
  constructor(reference: SmartReference) {
    const parsed = SmartReference.parse(reference);
    this.reference = Object.freeze({ ...parsed });
    const orientation = allOrientations().find(
      (o) => o.centers.U === parsed.up && o.centers.F === parsed.front,
    );
    if (!orientation) throw new Error("Unsupported cube reference");
    this.rotations = Object.freeze([...orientation.moves]);
    this.undoRotations = Object.freeze(inverse([...this.rotations]));
    // Proper rigid rotations preserve the clockwise suffix. Only the face
    // position changes; colors remain the physical cube's original colors.
    this.forward = Object.freeze(
      Object.fromEntries(
        FACES.map((source) => [
          source,
          FACES.find((target) => orientation.centers[target] === source)!,
        ]),
      ) as Record<Face, Face>,
    );
    this.backward = Object.freeze(
      Object.fromEntries(
        FACES.map((target) => [target, orientation.centers[target]]),
      ) as Record<Face, Face>,
    );
    Object.freeze(this);
  }
  toTeachingState(hardware: CubeState): CubeState {
    return applyMoves(position(hardware), [...this.rotations]);
  }
  toHardwareState(teaching: CubeState): CubeState {
    if (teaching.size !== 3 || teaching.stickers.length !== 54)
      throw new Error(
        "Smart reference mapping requires a complete 3×3 position",
      );
    return position(applyMoves(teaching, [...this.undoRotations]));
  }
  private move(raw: string, faces: Readonly<Record<Face, Face>>): string {
    const match = /^([URFDLB])(2|')?$/.exec(raw);
    if (!match || match[0] !== raw)
      throw new Error("Smart cubes report outer face turns only");
    return faces[match[1] as Face] + (match[2] || "");
  }
  toTeachingMove(hardware: string): string {
    return this.move(hardware, this.forward);
  }
  toHardwareMove(teaching: string): string {
    return this.move(teaching, this.backward);
  }
  project(event: SmartSessionEvent): SmartSessionEvent {
    if (event.type === "state")
      return { ...event, state: this.toTeachingState(event.state) };
    if (event.type === "move")
      return {
        ...event,
        move: { ...event.move, move: this.toTeachingMove(event.move.move) },
      };
    return { ...event };
  }
}
