import { FACES, solvedCube, applyMoves, facelets, type Face } from "./puzzle";
export type AlgorithmFamily = "OLL" | "PLL" | "CLL";
export function upperPositions(size: 2 | 3) {
  const n = size * size;
  return FACES.flatMap((face, fi) =>
    face === "U"
      ? Array.from({ length: n }, (_, i) => fi * n + i)
      : face === "D"
        ? []
        : Array.from({ length: size }, (_, i) => fi * n + i),
  );
}
export function solvedColors(size: 2 | 3) {
  return FACES.map((face) => face.repeat(size * size)).join("");
}
const permutations = new Map<string, number[]>();
export function algorithmPermutation(size: 2 | 3, algorithm: string) {
  const key = `${size}:${algorithm}`;
  const cached = permutations.get(key);
  if (cached) return cached;
  const state = solvedCube(size);
  // Unique labels derive a position permutation from the same geometric engine
  // used for interactive practice. They never enter a user puzzle state.
  state.stickers.forEach((sticker, index) => {
    sticker.color = String(index) as Face;
  });
  const result = FACES.flatMap(
    (face) => facelets(applyMoves(state, algorithm))[face],
  ).map(Number);
  permutations.set(key, result);
  return result;
}
export function permuteColors(colors: string, permutation: number[]) {
  return permutation.map((index) => colors[index]).join("");
}
export function shapeKey(colors: string, family: AlgorithmFamily) {
  const size = family === "CLL" ? 2 : 3;
  return upperPositions(size)
    .map((index) =>
      family === "OLL" ? (colors[index] === "U" ? "1" : "0") : colors[index],
    )
    .join("");
}
export function canonicalShape(colors: string, family: AlgorithmFamily) {
  const size = family === "CLL" ? 2 : 3,
    u = algorithmPermutation(size, "U"),
    sides = ["F", "R", "B", "L"];
  const keys: string[] = [];
  for (let auf = 0; auf < 4; auf++) {
    for (let frame = 0; frame < (family === "OLL" ? 1 : 4); frame++) {
      const relative = colors
        .split("")
        .map((color) =>
          sides.includes(color)
            ? sides[(sides.indexOf(color) + frame) % 4]
            : color,
        )
        .join("");
      keys.push(shapeKey(relative, family));
    }
    colors = permuteColors(colors, u);
  }
  return keys.sort()[0];
}
export function preservesFirstLayers(colors: string, family: AlgorithmFamily) {
  const size = family === "CLL" ? 2 : 3,
    solved = solvedColors(size),
    upper = new Set(upperPositions(size));
  return (
    colors.length === solved.length &&
    colors
      .split("")
      .every((color, index) => upper.has(index) || color === solved[index])
  );
}
