export const FACES = ["U", "R", "F", "D", "L", "B"] as const;
export type Face = (typeof FACES)[number];
export const COLORS: Record<Face, string> = {
  U: "#f8f6ee",
  R: "#ec5347",
  F: "#42ad83",
  D: "#f6ce50",
  L: "#f39446",
  B: "#4e83d6",
};
export type Sticker = {
  p: [number, number, number];
  normal: [number, number, number];
  color: Face;
};
export type CubeState = { size: 2 | 3 | 4; stickers: Sticker[] };
const normals: Record<Face, [number, number, number]> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};
function facePosition(
  f: Face,
  r: number,
  c: number,
  n: number,
): [number, number, number] {
  const m = n - 1;
  return {
    U: [c, m, r],
    R: [m, m - r, m - c],
    F: [c, m - r, m],
    D: [c, 0, m - r],
    L: [0, m - r, c],
    B: [m - c, m - r, 0],
  }[f] as [number, number, number];
}
export function solvedCube(size: 2 | 3 | 4 = 3): CubeState {
  return {
    size,
    stickers: FACES.flatMap((f) =>
      Array.from({ length: size * size }, (_, i) => ({
        p: facePosition(f, Math.floor(i / size), i % size, size),
        normal: [...normals[f]] as [number, number, number],
        color: f,
      })),
    ),
  };
}
export function facelets(s: CubeState): Record<Face, Face[]> {
  return Object.fromEntries(
    FACES.map((f) => [
      f,
      Array.from({ length: s.size * s.size }, (_, i) => {
        const p = facePosition(f, Math.floor(i / s.size), i % s.size, s.size);
        return s.stickers.find(
          (t) =>
            t.p.every((v, j) => v === p[j]) &&
            t.normal.every((v, j) => v === normals[f][j]),
        )!.color;
      }),
    ]),
  ) as Record<Face, Face[]>;
}
export function fromFacelets(
  size: 2 | 3 | 4,
  faces: Record<Face, Face[]>,
): CubeState {
  const s = solvedCube(size);
  FACES.forEach((f, fi) => {
    if (faces[f]?.length !== size * size)
      throw new Error(`Face ${f} needs ${size * size} stickers`);
    faces[f].forEach((c, i) => {
      if (!FACES.includes(c)) throw new Error("Unknown color");
      s.stickers[fi * size * size + i].color = c;
    });
  });
  return s;
}
function rotate(
  v: [number, number, number],
  axis: number,
  dir: number,
  offset: number,
): [number, number, number] {
  const o = [...v] as [number, number, number];
  const a = (axis + 1) % 3,
    b = (axis + 2) % 3;
  o[a] = dir > 0 ? offset - v[b] : v[b];
  o[b] = dir > 0 ? v[a] : offset - v[a];
  return o;
}
export function turn(state: CubeState, move: string): CubeState {
  const match = /^([URFDLBMESxyz])(w)?(2|')?$/.exec(move);
  if (!match) throw new Error(`Unsupported move: ${move}`);
  const [, f, wide, suffix] = match,
    n = state.size,
    m = n - 1;
  if (wide && (!"URFDLB".includes(f) || n < 3))
    throw new Error("Wide turn is not supported for this puzzle");
  const axis = "RL Mx".replace(/ /g, "").includes(f)
    ? 0
    : "UD E y".replace(/ /g, "").includes(f)
      ? 1
      : 2;
  const high = "RUF".includes(f),
    whole = "xyz".includes(f),
    slice = "MES".includes(f);
  if (slice && n !== 3) throw new Error("Slice notation requires 3×3");
  let dir = "RUFxyzS".includes(f) ? -1 : 1;
  if (suffix === "'") dir *= -1;
  let stickers = state.stickers.map((t) => ({
    ...t,
    p: [...t.p] as [number, number, number],
    normal: [...t.normal] as [number, number, number],
  }));
  for (let k = 0; k < (suffix === "2" ? 2 : 1); k++)
    stickers = stickers.map((t) => {
      const a = t.p[axis];
      const selected =
        whole ||
        (slice
          ? a === 1
          : high
            ? a >= m - (wide ? 1 : 0)
            : a <= (wide ? 1 : 0));
      return selected
        ? {
            ...t,
            p: rotate(t.p, axis, dir, m),
            normal: rotate(t.normal, axis, dir, 0),
          }
        : t;
    });
  return { size: n, stickers };
}
export function applyMoves(s: CubeState, moves: string[] | string) {
  return (
    typeof moves === "string"
      ? moves.trim().split(/\s+/).filter(Boolean)
      : moves
  ).reduce(turn, s);
}
export function inverse(moves: string[] | string) {
  return (
    typeof moves === "string"
      ? moves.trim().split(/\s+/).filter(Boolean)
      : moves
  )
    .slice()
    .reverse()
    .map((m) =>
      m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : `${m}'`,
    );
}
export function isSolved(s: CubeState) {
  return Object.values(facelets(s)).every((f) => f.every((c) => c === f[0]));
}
export function stateKey(s: CubeState) {
  return FACES.map((f) => facelets(s)[f].join("")).join("");
}
function parity(p: number[]) {
  let inv = 0;
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv++;
  return inv % 2;
}
export type Validation = { valid: boolean; complete: boolean; reason?: string };
export function validateScan(s: CubeState): Validation {
  for (const f of FACES)
    if (s.stickers.filter((t) => t.color === f).length !== s.size * s.size)
      return {
        valid: false,
        complete: true,
        reason: `Expected ${s.size * s.size} ${f} stickers`,
      };
  // Normalize whole-cube orientation by testing the 24 rigid orientations.
  const queue = [s],
    seen = new Set<string>();
  let normalized: CubeState | undefined;
  while (queue.length) {
    const q = queue.shift()!,
      key = stateKey(q);
    if (seen.has(key)) continue;
    seen.add(key);
    const f = facelets(q);
    if (q.size !== 3 || FACES.every((x) => f[x][4] === x)) {
      normalized = q;
      break;
    }
    if (seen.size <= 24) queue.push(turn(q, "x"), turn(q, "y"));
  }
  if (!normalized)
    return {
      valid: false,
      complete: true,
      reason: "Center colors do not form a valid orientation",
    };
  const faces = facelets(normalized),
    n = s.size,
    m = n - 1,
    at = (f: Face, r: number, c: number) => faces[f][r * n + c];
  const corners = [
    [at("U", m, m), at("R", 0, 0), at("F", 0, m)],
    [at("U", m, 0), at("F", 0, 0), at("L", 0, m)],
    [at("U", 0, 0), at("L", 0, 0), at("B", 0, m)],
    [at("U", 0, m), at("B", 0, 0), at("R", 0, m)],
    [at("D", 0, m), at("F", m, m), at("R", m, 0)],
    [at("D", 0, 0), at("L", m, m), at("F", m, 0)],
    [at("D", m, 0), at("B", m, m), at("L", m, 0)],
    [at("D", m, m), at("R", m, m), at("B", m, 0)],
  ];
  const canonical = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"];
  let twist = 0;
  const cp: number[] = [];
  for (const c of corners) {
    const o = c.findIndex((x) => x === "U" || x === "D");
    if (o < 0)
      return { valid: false, complete: true, reason: "Invalid corner" };
    const k = canonical.indexOf(
      [c[o], c[(o + 1) % 3], c[(o + 2) % 3]].join(""),
    );
    if (k < 0 || cp.includes(k))
      return {
        valid: false,
        complete: true,
        reason: "Duplicate or mirrored corner",
      };
    cp.push(k);
    twist += o;
  }
  if (twist % 3)
    return { valid: false, complete: true, reason: "A corner is twisted" };
  if (n === 2) return { valid: true, complete: true };
  if (n === 4) return validateWingsAndCenters(s);
  const edges = [
    [at("U", 1, 2), at("R", 0, 1)],
    [at("U", 2, 1), at("F", 0, 1)],
    [at("U", 1, 0), at("L", 0, 1)],
    [at("U", 0, 1), at("B", 0, 1)],
    [at("D", 1, 2), at("R", 2, 1)],
    [at("D", 0, 1), at("F", 2, 1)],
    [at("D", 1, 0), at("L", 2, 1)],
    [at("D", 2, 1), at("B", 2, 1)],
    [at("F", 1, 2), at("R", 1, 0)],
    [at("F", 1, 0), at("L", 1, 2)],
    [at("B", 1, 2), at("L", 1, 0)],
    [at("B", 1, 0), at("R", 1, 2)],
  ];
  const ec = [
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
  ];
  let flip = 0;
  const ep: number[] = [];
  for (const e of edges) {
    let k = ec.indexOf(e.join(""));
    if (k < 0) {
      k = ec.indexOf(e.slice().reverse().join(""));
      flip++;
    }
    if (k < 0 || ep.includes(k))
      return {
        valid: false,
        complete: true,
        reason: "Duplicate or invalid edge",
      };
    ep.push(k);
  }
  if (flip % 2)
    return { valid: false, complete: true, reason: "An edge is flipped" };
  if (parity(cp) !== parity(ep))
    return {
      valid: false,
      complete: true,
      reason: "Corner and edge parity do not match",
    };
  return { valid: true, complete: true };
}
// 4×4 color-state reachability: corner twist was checked above. Each wing's
// two colors and geometric handedness identify one of 24 distinct pieces.
// Centers of the same color are indistinguishable, so their hidden labels can
// always satisfy corner/center permutation parity; 3×3 edge parity is inapplicable.
// Mathematical basis: Bonzio/Loi/Peruzzi, arXiv:1611.07437, Theorem 3.1.
function validateWingsAndCenters(state: CubeState): Validation {
  const groups = (cube: CubeState) => {
    const pieces = new Map<string, Sticker[]>();
    for (const sticker of cube.stickers) {
      const position = sticker.p.join(",");
      pieces.set(position, [...(pieces.get(position) || []), sticker]);
    }
    return [...pieces.values()];
  };
  function wingKey(piece: Sticker[]) {
    const [a, b] = [...piece].sort(
      (x, y) => FACES.indexOf(x.color) - FACES.indexOf(y.color),
    );
    const cross = [
      a.normal[1] * b.normal[2] - a.normal[2] * b.normal[1],
      a.normal[2] * b.normal[0] - a.normal[0] * b.normal[2],
      a.normal[0] * b.normal[1] - a.normal[1] * b.normal[0],
    ];
    const handedness = Math.sign(
      cross.reduce((sum, value, axis) => sum + value * (a.p[axis] - 1.5), 0),
    );
    return `${a.color}${b.color}:${handedness}`;
  }
  const canonical = new Set(
    groups(solvedCube(4))
      .filter((piece) => piece.length === 2)
      .map(wingKey),
  );
  const pieces = groups(state),
    seen = new Set<string>();
  for (const piece of pieces.filter((piece) => piece.length === 2)) {
    const key = wingKey(piece);
    if (!canonical.has(key) || seen.has(key))
      return {
        valid: false,
        complete: true,
        reason: "A wing is duplicated, reflected or has impossible colors",
      };
    seen.add(key);
  }
  if (seen.size !== 24)
    return {
      valid: false,
      complete: true,
      reason: "Expected 24 distinct wings",
    };
  const centers = pieces.filter((piece) => piece.length === 1).flat();
  if (
    centers.length !== 24 ||
    FACES.some(
      (face) => centers.filter((center) => center.color === face).length !== 4,
    )
  )
    return {
      valid: false,
      complete: true,
      reason: "Expected four center stickers of each color",
    };
  return { valid: true, complete: true };
}
export function scramble(size: 2 | 3 | 4, random: () => number = Math.random) {
  const out: string[] = [];
  let previous = -1;
  for (let i = 0; i < (size === 2 ? 11 : size === 4 ? 40 : 25); i++) {
    let axis: number;
    do {
      axis = Math.floor(random() * 3);
    } while (axis === previous);
    previous = axis;
    const faces = [
      ["R", "L"],
      ["U", "D"],
      ["F", "B"],
    ][axis];
    out.push(
      faces[Math.floor(random() * 2)] +
        (size === 4 && random() < 0.35 ? "w" : "") +
        ["", "'", "2"][Math.floor(random() * 3)],
    );
  }
  return out;
}
