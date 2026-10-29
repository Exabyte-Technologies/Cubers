// Original tetrahedral sticker model. Coordinates are integer barycentric
// coordinates with sum 9. Notation follows WCA Regulation 12e.
export const PYRA_FACES = ["F", "R", "L", "D"] as const;
export type PyraFace = (typeof PYRA_FACES)[number];
export const PYRA_COLORS = ["F", "R", "B", "D"] as const;
export type PyraColor = (typeof PYRA_COLORS)[number];
export const PYRA_VERTICES = ["U", "L", "R", "B"] as const;
export type PyraVertex = (typeof PYRA_VERTICES)[number];
export type Barycentric = [number, number, number, number];
export type PyraSticker = { position: Barycentric; color: PyraColor };
export type PyraminxState = { puzzle: "pyraminx"; stickers: PyraSticker[] };
const radius = 1.6,
  base = (radius * Math.sqrt(8)) / 3;
export const PYRA_POINTS: [number, number, number][] = [
  [0, radius, 0],
  [(-base * Math.sqrt(3)) / 2, -radius / 3, base / 2],
  [(base * Math.sqrt(3)) / 2, -radius / 3, base / 2],
  [0, -radius / 3, -base],
];
const faceVertices: Record<PyraFace, [number, number, number]> = {
  F: [0, 1, 2],
  R: [0, 2, 3],
  L: [0, 3, 1],
  D: [3, 2, 1],
};
const faceColors: Record<PyraFace, PyraColor> = {
  F: "F",
  R: "R",
  L: "B",
  D: "D",
};
const key = (position: Barycentric) => position.join(",");
const triangles = PYRA_FACES.flatMap((face) => {
  const [top, left, right] = faceVertices[face];
  const coordinate = (t: number, l: number, r: number): Barycentric => {
    const values: Barycentric = [0, 0, 0, 0];
    values[top] = t;
    values[left] = l;
    values[right] = r;
    return values;
  };
  return Array.from({ length: 9 }, (_, index) => {
    const row = Math.floor(Math.sqrt(index)),
      column = index - row * row,
      half = Math.floor(column / 2),
      down = column % 2 === 1;
    const position = down
      ? coordinate(8 - 3 * row, 3 * row - 1 - 3 * half, 2 + 3 * half)
      : coordinate(7 - 3 * row, 1 + 3 * (row - half), 1 + 3 * half);
    const vertices = down
      ? [
          coordinate(9 - 3 * row, 3 * (row - half), 3 * half),
          coordinate(9 - 3 * row, 3 * (row - 1 - half), 3 * (half + 1)),
          coordinate(6 - 3 * row, 3 * (row - half), 3 * (half + 1)),
        ]
      : [
          coordinate(9 - 3 * row, 3 * (row - half), 3 * half),
          coordinate(6 - 3 * row, 3 * (row + 1 - half), 3 * half),
          coordinate(6 - 3 * row, 3 * (row - half), 3 * (half + 1)),
        ];
    return { face, index, position, vertices, color: faceColors[face] };
  });
});
const byPosition = new Map(
  triangles.map((triangle) => [key(triangle.position), triangle]),
);
export function solvedPyraminx(): PyraminxState {
  return {
    puzzle: "pyraminx",
    stickers: triangles.map(({ position, color }) => ({
      position: [...position],
      color,
    })),
  };
}
export function pyraminxFacelets(
  state: PyraminxState,
): Record<PyraFace, PyraColor[]> {
  const colors = new Map(
    state.stickers.map((sticker) => [key(sticker.position), sticker.color]),
  );
  return Object.fromEntries(
    PYRA_FACES.map((face) => [
      face,
      triangles
        .filter((t) => t.face === face)
        .map((t) => colors.get(key(t.position))!),
    ]),
  ) as Record<PyraFace, PyraColor[]>;
}
export function pyraminxFromFacelets(
  faces: Record<PyraFace, PyraColor[]>,
): PyraminxState {
  for (const face of PYRA_FACES)
    if (
      faces[face]?.length !== 9 ||
      faces[face].some((color) => !PYRA_COLORS.includes(color))
    )
      throw new Error("Each triangular face needs nine valid stickers");
  return {
    puzzle: "pyraminx",
    stickers: triangles.map(({ face, index, position }) => ({
      position: [...position],
      color: faces[face][index],
    })),
  };
}
export function pyraminxKey(state: PyraminxState) {
  return PYRA_FACES.flatMap((face) => pyraminxFacelets(state)[face]).join("");
}
export function pyraminxSolved(state: PyraminxState) {
  const faces = pyraminxFacelets(state);
  return PYRA_FACES.every((face) =>
    faces[face].every((color) => color === faces[face][0]),
  );
}
export function pyraminxPoint(position: Barycentric): [number, number, number] {
  return [0, 1, 2].map((axis) =>
    position.reduce(
      (sum, weight, vertex) => sum + (weight * PYRA_POINTS[vertex][axis]) / 9,
      0,
    ),
  ) as [number, number, number];
}
export function pyraminxGeometry(state: PyraminxState) {
  return state.stickers.map((sticker) => {
    const triangle = byPosition.get(key(sticker.position));
    if (!triangle) throw new Error("Invalid triangle position");
    return { ...sticker, vertices: triangle.vertices.map(pyraminxPoint) };
  });
}
function cycle(vertex: number) {
  const others = [0, 1, 2, 3].filter((value) => value !== vertex),
    a = PYRA_POINTS[others[0]],
    b = PYRA_POINTS[others[1]],
    axis = PYRA_POINTS[vertex];
  const cross = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  if (cross.reduce((sum, value, index) => sum + value * axis[index], 0) > 0)
    [others[1], others[2]] = [others[2], others[1]];
  return others;
}
function rotate(
  state: PyraminxState,
  vertex: number,
  threshold: number,
  reverse: boolean,
): PyraminxState {
  const permutation = cycle(vertex);
  if (reverse)
    [permutation[1], permutation[2]] = [permutation[2], permutation[1]];
  return {
    puzzle: "pyraminx",
    stickers: state.stickers.map((sticker) => {
      const position = [...sticker.position] as Barycentric;
      if (position[vertex] >= threshold)
        permutation.forEach((source, index) => {
          position[permutation[(index + 1) % 3]] = sticker.position[source];
        });
      return { position, color: sticker.color };
    }),
  };
}
export function pyraminxTurn(state: PyraminxState, move: string) {
  const match = /^([ULRBulrb])(')?$/.exec(move);
  if (!match)
    throw new Error(
      "Pyraminx moves use U L R B and lowercase tips, optionally followed by a prime",
    );
  const vertex = PYRA_VERTICES.indexOf(match[1].toUpperCase() as PyraVertex);
  return rotate(
    state,
    vertex,
    match[1] === match[1].toLowerCase() ? 7 : 4,
    !!match[2],
  );
}
export function pyraminxApply(
  state: PyraminxState,
  algorithm: string | readonly string[],
) {
  const moves =
    typeof algorithm === "string"
      ? algorithm.trim().split(/\s+/).filter(Boolean)
      : algorithm;
  return moves.reduce(pyraminxTurn, state);
}
export function pyraminxInverse(algorithm: string | readonly string[]) {
  const moves =
    typeof algorithm === "string"
      ? algorithm.trim().split(/\s+/).filter(Boolean)
      : [...algorithm];
  if (moves.some((move) => !/^([ULRBulrb])(')?$/.test(move)))
    throw new Error("Invalid Pyraminx move");
  return moves
    .reverse()
    .map((move) => (move.endsWith("'") ? move.slice(0, -1) : `${move}'`));
}
export function pyraminxOrientations(state: PyraminxState) {
  const queue = [state],
    seen = new Set<string>(),
    result: PyraminxState[] = [];
  while (queue.length) {
    const current = queue.shift()!,
      signature = current.stickers
        .map((sticker) => key(sticker.position))
        .join(";");
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(current);
    queue.push(rotate(current, 0, 0, false), rotate(current, 2, 0, false));
  }
  return result;
}
const reference = solvedPyraminx();
function pieceColors(state: PyraminxState, positions: Barycentric[]) {
  const colors = new Map(
    state.stickers.map((sticker) => [key(sticker.position), sticker.color]),
  );
  return positions.map((position) => colors.get(key(position))!).join("");
}
const axialPositions = PYRA_VERTICES.map((_, vertex) =>
  triangles.filter((t) => t.position[vertex] === 5).map((t) => t.position),
);
const tipPositions = PYRA_VERTICES.map((_, vertex) =>
  triangles.filter((t) => t.position[vertex] === 7).map((t) => t.position),
);
const edgePairs: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];
const edgePositions = edgePairs.map(([a, b]) =>
  triangles
    .filter((t) => t.position[a] === 4 && t.position[b] === 4)
    .map((t) => t.position)
    .sort((a, b) => a.indexOf(0) - b.indexOf(0)),
);
const edgeReference = edgePositions.map((positions) =>
  pieceColors(reference, positions),
);
const orientations = (vertex: number, tip: boolean) =>
  [0, 1, 2].map((count) =>
    pieceColors(
      pyraminxApply(
        reference,
        Array(count).fill(
          tip ? PYRA_VERTICES[vertex].toLowerCase() : PYRA_VERTICES[vertex],
        ),
      ),
      tip ? tipPositions[vertex] : axialPositions[vertex],
    ),
  );
const axialReference = PYRA_VERTICES.map((_, vertex) =>
  orientations(vertex, false),
);
const tipReference = PYRA_VERTICES.map((_, vertex) =>
  orientations(vertex, true),
);
export type PyraminxCoordinates = {
  edges: number[];
  flips: number[];
  axials: number[];
  tips: number[];
};
export function pyraminxCoordinates(
  state: PyraminxState,
): PyraminxCoordinates | undefined {
  const axials = axialPositions.map((positions, vertex) =>
      axialReference[vertex].indexOf(pieceColors(state, positions)),
    ),
    tips = tipPositions.map((positions, vertex) =>
      tipReference[vertex].indexOf(pieceColors(state, positions)),
    );
  if ([...axials, ...tips].some((value) => value < 0)) return;
  const colors = edgePositions.map((positions) =>
    pieceColors(state, positions),
  );
  const edges = colors.map((pair) =>
    edgeReference.findIndex(
      (reference) =>
        reference === pair || reference === pair.split("").reverse().join(""),
    ),
  );
  if (edges.some((value) => value < 0) || new Set(edges).size !== 6) return;
  const flips = colors.map((pair, index) =>
    pair === edgeReference[edges[index]] ? 0 : 1,
  );
  return { edges, flips, axials, tips };
}
export function validatePyraminx(state: PyraminxState): {
  valid: boolean;
  reason?: string;
  normalized?: PyraminxState;
  coordinates?: PyraminxCoordinates;
} {
  if (
    state?.puzzle !== "pyraminx" ||
    state.stickers?.length !== 36 ||
    new Set(state.stickers.map((sticker) => key(sticker.position))).size !==
      36 ||
    state.stickers.some(
      (sticker) =>
        !byPosition.has(key(sticker.position)) ||
        !PYRA_COLORS.includes(sticker.color),
    )
  )
    return { valid: false, reason: "Invalid triangular sticker structure" };
  if (
    PYRA_COLORS.some(
      (color) =>
        state.stickers.filter((sticker) => sticker.color === color).length !==
        9,
    )
  )
    return {
      valid: false,
      reason: "Each of the four colors must appear nine times",
    };
  for (const normalized of pyraminxOrientations(state)) {
    const c = pyraminxCoordinates(normalized);
    if (!c) continue;
    let parity = 0;
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++) if (c.edges[i] > c.edges[j]) parity ^= 1;
    if (parity)
      return {
        valid: false,
        reason: "Two swapped edges cannot be reached by legal Pyraminx turns",
      };
    if (c.flips.reduce((sum, value) => sum ^ value, 0))
      return {
        valid: false,
        reason:
          "A single flipped edge cannot be reached by legal Pyraminx turns",
      };
    return { valid: true, normalized, coordinates: c };
  }
  return {
    valid: false,
    reason: "A tip or axial piece has inconsistent or reflected colors",
  };
}
export function pyraminxScramble(random: () => number = Math.random) {
  const moves: string[] = [];
  for (let index = 0; index < 12; index++) {
    const candidates = PYRA_VERTICES.filter(
      (vertex) => vertex !== moves.at(-1)?.[0],
    );
    moves.push(
      candidates[Math.floor(random() * candidates.length)] +
        (random() < 0.5 ? "" : "'"),
    );
  }
  for (const vertex of PYRA_VERTICES) {
    const turn = Math.floor(random() * 3);
    if (turn) moves.push(vertex.toLowerCase() + (turn === 2 ? "'" : ""));
  }
  return moves;
}
