import { puzzles } from "cubing/puzzles";

const definitions = {
  222: ["2x2x2", 3, "URFDLB"],
  333: ["3x3x3", 1, "URFDLB"],
  444: ["4x4x4", 1, "URFDLB"],
  pyram: ["pyraminx", 5, "URLB"],
};
const filters = new Map();

// Ignore center sticker orientation and Pyraminx tips. Requiring six body
// moves on Pyraminx prevents tip turns from making an easy body pass the filter.
function key(pattern, event) {
  return JSON.stringify(
    Object.entries(pattern.patternData)
      .filter(([orbit]) => event !== "pyram" || orbit !== "CORNERS2")
      .map(([orbit, data]) => [
        orbit,
        data.pieces,
        orbit === "CENTERS" ? [] : data.orientation,
      ]),
  );
}
async function build(event) {
  const [name, depth, faces] = definitions[event] ?? [];
  if (!name) throw Error("Unsupported scramble event");
  const kpuzzle = await puzzles[name].kpuzzle();
  const moves = [...faces].flatMap((face) =>
    (event === "pyram" ? ["", "'"] : ["", "2", "'"]).map((suffix) =>
      kpuzzle.algToTransformation(face + suffix),
    ),
  );
  if (event === "444")
    for (const face of faces)
      for (const suffix of ["", "2", "'"])
        moves.push(kpuzzle.algToTransformation(face + "w" + suffix));
  let frontier = [kpuzzle.defaultPattern()];
  const rejected = new Set(frontier.map((p) => key(p, event)));
  if (event !== "pyram") {
    // All 24 solved orientations count as solved, especially on centerless 2x2.
    const rotations = ["x", "y"].map((m) => kpuzzle.algToTransformation(m));
    for (let i = 0; i < frontier.length; i++)
      for (const rotation of rotations) {
        const state = frontier[i].applyTransformation(rotation),
          k = key(state, event);
        if (!rejected.has(k)) {
          rejected.add(k);
          frontier.push(state);
        }
      }
    if (frontier.length !== 24) throw Error("Invalid cube orientation model");
  }
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const pattern of frontier)
      for (const move of moves) {
        const state = pattern.applyTransformation(move),
          k = key(state, event);
        if (!rejected.has(k)) {
          rejected.add(k);
          next.push(state);
        }
      }
    frontier = next;
  }
  return { kpuzzle, rejected };
}
export async function passesMinimumDistance(event, algorithm) {
  if (!filters.has(event)) filters.set(event, build(event));
  const { kpuzzle, rejected } = await filters.get(event);
  return !rejected.has(
    key(kpuzzle.defaultPattern().applyAlg(algorithm), event),
  );
}
