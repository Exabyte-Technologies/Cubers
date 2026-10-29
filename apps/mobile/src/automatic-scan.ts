import {
  FACES,
  fromFacelets,
  facelets,
  validateScan,
  turn,
  type Face,
  type CubeState,
} from "@cubers/core";
import { type Sample } from "./scan";

export const SCAN_FACE_ORDER: readonly Face[] = ["F", "R", "B", "L", "U", "D"];
// Capture positions are relative to the initial grip, never inferred from the
// most common sticker color. The final x' restores that same grip.
export const SCAN_TURNS = [
  ["y"],
  ["y"],
  ["y"],
  ["y", "x'"],
  ["x2"],
  ["x'"],
] as const;
import { type ScanFrame } from "./scan-alignment";
export { inspectScanFrame, scanSquare, type ScanFrame } from "./scan-alignment";
export const SCAN_HOLD_MS = 500,
  SCAN_TURN_MS = 1500;
export class ScanReadLease {
  private epoch = 0;
  private pending: { epoch: number } | null = null;
  begin() {
    if (this.pending) return null;
    return (this.pending = { epoch: this.epoch });
  }
  invalidate() {
    this.epoch++;
  }
  isCurrent(lease: { epoch: number }) {
    return this.pending === lease && lease.epoch === this.epoch;
  }
  finish(lease: { epoch: number }) {
    if (this.pending === lease) this.pending = null;
  }
}
function difference(a: readonly number[], b: readonly number[]) {
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
}

function rotatedIndex(i: number, size: number, rotation: number) {
  let r = Math.floor(i / size),
    c = i % size;
  for (let n = 0; n < rotation; n++) [r, c] = [size - 1 - c, r];
  return r * size + c;
}
export function sameScannedFace(
  a: readonly Sample[],
  b: readonly Sample[],
  size: 2 | 3 | 4,
) {
  if (a.length !== size * size || b.length !== a.length) return false;
  for (let rotation = 0; rotation < 4; rotation++) {
    let mismatches = 0,
      total = 0;
    for (let i = 0; i < a.length; i++) {
      const other = b[rotatedIndex(i, size, rotation)];
      if (a[i].color !== other.color) mismatches++;
      total += difference(a[i].rgb, other.rgb);
    }
    if (mismatches <= Math.floor(a.length * 0.08) && total / a.length < 48)
      return true;
  }
  return false;
}
export type ScanPhase =
  "searching" | "holding" | "turning" | "move-away" | "duplicate" | "complete";
export type ScanUpdate = {
  phase: ScanPhase;
  index: number;
  captured?: Sample[];
  remainingMs?: number;
};
/** Owns timing separately from React/camera latency. Old/background frames
 * cannot extend a hold or bypass the post-capture movement requirement. */
export class AutomaticScanGate {
  readonly captured: Sample[][] = [];
  private hold: ScanFrame | null = null;
  private lastTime = -Infinity;
  private coolUntil = 0;
  private awaySince: number | null = null;
  private awayFrames = 0;
  private released = true;
  private distinctOverride = false;
  private duplicate = false;
  constructor(readonly size: 2 | 3 | 4) {}
  resetHold() {
    this.hold = null;
    this.awaySince = null;
    this.awayFrames = 0;
  }
  confirmDistinctFace() {
    if (this.duplicate && this.released && this.size !== 3) {
      this.distinctOverride = true;
      this.hold = null;
    }
  }
  feed(frame: ScanFrame): ScanUpdate {
    const now = frame.capturedAt,
      index = this.captured.length;
    if (index === 6) return { phase: "complete", index };
    if (now <= this.lastTime) return { phase: "searching", index };
    if (now - this.lastTime > 1000) this.resetHold();
    this.lastTime = now;
    if (index > 0 && !this.released) {
      if (!frame.aligned) {
        this.awaySince ??= now;
        this.awayFrames++;
        if (this.awayFrames >= 2 && now - this.awaySince >= 100)
          this.released = true;
      } else {
        this.awaySince = null;
        this.awayFrames = 0;
      }
    }
    if (now < this.coolUntil)
      return { phase: "turning", index, remainingMs: this.coolUntil - now };
    if (!this.released) return { phase: "move-away", index };
    if (!frame.aligned) {
      this.hold = null;
      return { phase: "searching", index };
    }
    this.duplicate = this.captured.some((previous) =>
      sameScannedFace(previous, frame.samples, this.size),
    );
    if (this.duplicate && !this.distinctOverride) {
      this.hold = null;
      return { phase: "duplicate", index };
    }
    if (
      !this.hold ||
      !sameScannedFace(this.hold.samples, frame.samples, this.size) ||
      (this.hold.corners &&
        frame.corners &&
        frame.corners.some((p, i) => {
          const before = this.hold!.corners![i],
            a = frame.corners![0],
            b = frame.corners![1];
          return (
            Math.hypot(p[0] - before[0], p[1] - before[1]) >
            Math.hypot(a[0] - b[0], a[1] - b[1]) * 0.08
          );
        }))
    )
      this.hold = frame;
    if (now - this.hold.capturedAt < SCAN_HOLD_MS)
      return { phase: "holding", index };
    const captured = frame.samples.map((s) => ({
      ...s,
      rgb: [...s.rgb] as [number, number, number],
    }));
    this.captured.push(captured);
    this.hold = null;
    this.released = false;
    this.awayFrames = 0;
    this.awaySince = null;
    this.coolUntil = now + SCAN_TURN_MS;
    this.distinctOverride = false;
    this.duplicate = false;
    return {
      phase: "turning",
      index: index + 1,
      captured,
      remainingMs: SCAN_TURN_MS,
    };
  }
}

export type ScanResolution = {
  state: CubeState;
  correctedCenter?: Face;
  canonicalMoves: string[];
};
function canonicalFrame(cube: CubeState) {
  if (cube.size !== 3) return { state: cube, moves: [] as string[] };
  const pending = [{ state: cube, moves: [] as string[] }],
    seen = new Set<string>();
  for (let i = 0; i < pending.length; i++) {
    const item = pending[i],
      faces = facelets(item.state),
      key = FACES.map((f) => faces[f][4]).join("");
    if (seen.has(key)) continue;
    seen.add(key);
    if (FACES.every((f) => faces[f][4] === f)) return item;
    for (const move of ["x", "y"])
      pending.push({
        state: turn(item.state, move),
        moves: [...item.moves, move],
      });
    if (seen.size > 24) break;
  }
  throw Error("Center colors do not form a valid orientation");
}
/** White-logo repair changes at most ONE center, and only if the complete
 * cube's color counts, rigid center frame and cubie legality identify it
 * uniquely. Non-center stickers and ambiguous states are never guessed. */
export function resolveAutomaticScan(
  size: 2 | 3 | 4,
  captures: readonly (readonly Sample[])[],
): ScanResolution {
  if (
    captures.length !== 6 ||
    captures.some((face) => face.length !== size * size)
  )
    throw Error("Scan all six faces");
  const faces = Object.fromEntries(
    SCAN_FACE_ORDER.map((f, i) => [f, captures[i].map((s) => s.color)]),
  ) as Record<Face, Face[]>;
  const original = fromFacelets(size, faces);
  let state = original,
    correctedCenter: Face | undefined;
  const validation = validateScan(original);
  if (!validation.valid && size === 3) {
    const centers = FACES.map((f) => faces[f][4]);
    const repeated = FACES.filter(
      (color) => centers.filter((c) => c === color).length === 2,
    );
    if (
      !centers.includes("U") &&
      repeated.length === 1 &&
      new Set(centers).size === 5
    ) {
      const candidates: CenterCandidate[] = [];
      for (const face of FACES.filter((f) => faces[f][4] === repeated[0])) {
        const candidate = fromFacelets(3, {
          ...faces,
          [face]: faces[face].map((c, i) => (i === 4 ? "U" : c)),
        });
        if (validateScan(candidate).valid)
          candidates.push({ state: candidate, face });
      }
      if (candidates.length === 1) {
        state = candidates[0].state;
        correctedCenter = candidates[0].face;
      }
    }
  }
  const checked = validateScan(state);
  if (!checked.valid) throw Error(checked.reason || "Check all six faces");
  const canonical = canonicalFrame(state);
  return {
    state: canonical.state,
    correctedCenter,
    canonicalMoves: canonical.moves,
  };
}
type CenterCandidate = { state: CubeState; face: Face };
