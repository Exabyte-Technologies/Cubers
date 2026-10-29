import { FACES, type Face } from "@cubers/core";
import { SCAN_TURNS, SCAN_TURN_MS } from "./automatic-scan";

export function scanTurnProgress(elapsedMs: number) {
  return Math.max(0, Math.min(1, (elapsedMs / SCAN_TURN_MS - 0.08) / 0.8));
}

export function scanTurnInstruction(index: number) {
  if (index < 3)
    return {
      en: "Bring the right-hand face toward the camera. Keep the same top edge up.",
      zh: "将右侧面转向相机，保持原来的上边缘朝上。",
    };
  if (index === 3)
    return {
      en: "Bring the right-hand face forward once more, then tip the top face toward the camera.",
      zh: "再将右侧面转向相机，然后把顶面翻向相机。",
    };
  if (index === 4)
    return {
      en: "Flip the whole cube forward 180° around the left-to-right axis. Keep the side faces on the same left and right; do not twist a layer.",
      zh: "沿左右方向的水平轴，将整个魔方向前翻转 180°。左右两侧不互换，不要拧动单层。",
    };
  return {
    en: "Tip the top face toward the camera to return to your starting grip.",
    zh: "将当前顶面翻向相机，回到开始扫描时的握持方向。",
  };
}

export type ScanVertex = readonly [number, number, number];
export type TurnPolygon = {
  face: Face;
  sticker?: number;
  vertices: readonly ScanVertex[];
  points: readonly (readonly [number, number])[];
  depth: number;
};
const camera: ScanVertex = [3.2, 2.2, 7];
const dot = (a: ScanVertex, b: ScanVertex) =>
  a.reduce((n, v, i) => n + v * b[i], 0);
const length = Math.hypot(...camera);
const forward = camera.map((v) => v / length) as unknown as ScanVertex;
const rightLength = Math.hypot(camera[0], camera[2]);
const right: ScanVertex = [
  camera[2] / rightLength,
  0,
  -camera[0] / rightLength,
];
const up: ScanVertex = [
  forward[1] * right[2],
  forward[2] * right[0] - forward[0] * right[2],
  -forward[1] * right[0],
];
const normal: Record<Face, ScanVertex> = {
  F: [0, 0, 1],
  R: [1, 0, 0],
  B: [0, 0, -1],
  L: [-1, 0, 0],
  U: [0, 1, 0],
  D: [0, -1, 0],
};
function onFace(face: Face, u: number, v: number): ScanVertex {
  const x = 2 * u - 1,
    y = 1 - 2 * v;
  switch (face) {
    case "F":
      return [x, y, 1];
    case "R":
      return [1, y, -x];
    case "B":
      return [-x, y, -1];
    case "L":
      return [-1, y, x];
    case "U":
      return [x, 1, -y];
    case "D":
      return [x, -1, y];
  }
}
/** Rigid 3D rotations in the same world axes/sign convention as core.turn.
 * The two-part fourth instruction finishes yaw BEFORE starting the pitch. */
export function scanTurnVertex(
  vertex: ScanVertex,
  turnIndex: number,
  progress: number,
): ScanVertex {
  let p = vertex;
  const moves = SCAN_TURNS[Math.max(0, Math.min(5, turnIndex))];
  const time = Math.max(0, Math.min(1, progress)) * moves.length;
  moves.forEach((move, i) => {
    const t = Math.max(0, Math.min(1, time - i));
    const eased = t * t * (3 - 2 * t);
    // x2 tips the top toward the camera, like the other pitch instructions.
    const angle =
      (move === "y" ? -Math.PI / 2 : move === "x2" ? Math.PI : Math.PI / 2) *
      eased;
    const [x, y, z] = p,
      c = Math.cos(angle),
      s = Math.sin(angle);
    p =
      move === "y"
        ? [c * x + s * z, y, -s * x + c * z]
        : [x, c * y - s * z, s * y + c * z];
  });
  return p;
}
export function projectScanVertex(p: ScanVertex): readonly [number, number] {
  const depth = length - dot(p, forward);
  return [
    110 + (440 * dot(p, right)) / depth,
    110 - (440 * dot(p, up)) / depth,
  ];
}
/** Six independently projected faces with depth ordering and back-face
 * removal. No 2D card transform: hidden sides disappear and new sides emerge. */
export function scanTurnPolygons(
  size: 2 | 3 | 4,
  turnIndex: number,
  progress: number,
): TurnPolygon[] {
  const output: TurnPolygon[] = [];
  for (const face of FACES) {
    const n = scanTurnVertex(normal[face], turnIndex, progress);
    if (dot(n, camera) <= 1 + 1e-7) continue;
    const add = (
      u0: number,
      v0: number,
      u1: number,
      v1: number,
      sticker?: number,
    ) => {
      const vertices = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ].map(([u, v]) =>
        scanTurnVertex(onFace(face, u, v), turnIndex, progress),
      );
      output.push({
        face,
        sticker,
        vertices,
        points: vertices.map(projectScanVertex),
        depth: vertices.reduce((n, p) => n + dot(p, forward), 0) / 4,
      });
    };
    add(0, 0, 1, 1);
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++)
        add(
          (col + 0.055) / size,
          (row + 0.055) / size,
          (col + 0.945) / size,
          (row + 0.945) / size,
          row * size + col,
        );
  }
  // Order complete faces, keeping a face's solid body behind its stickers.
  const depths = new Map<Face, number>();
  output.forEach((p) => {
    if (p.sticker === undefined) depths.set(p.face, p.depth);
  });
  return output.sort(
    (a, b) =>
      depths.get(a.face)! - depths.get(b.face)! ||
      (a.sticker === undefined
        ? -1
        : b.sticker === undefined
          ? 1
          : a.sticker - b.sticker),
  );
}
