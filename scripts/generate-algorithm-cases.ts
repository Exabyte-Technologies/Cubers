// Reproducible, original composite exercises. No third-party case sheets copied.
import { writeFileSync } from "node:fs";
import { inverse } from "../packages/core/src/puzzle";
import {
  algorithmPermutation,
  permuteColors,
  shapeKey,
  canonicalShape,
  preservesFirstLayers,
  solvedColors,
  type AlgorithmFamily,
} from "../packages/core/src/algorithm-shapes";
const sune = "R U R' U R U2 R'",
  orientEdges = "F R U R' U' F'";
const tPermutation = "R U R' U' R' F R2 U' R' U' R U R' F'",
  uPermutation = "R U' R U R U R U' R' U' R2";
const specifications: {
  family: AlgorithmFamily;
  size: 2 | 3;
  macros: string[];
  states: number;
  cases: number;
}[] = [
  {
    family: "OLL",
    size: 3,
    macros: [sune, orientEdges],
    states: 216,
    cases: 57,
  },
  {
    family: "PLL",
    size: 3,
    macros: [tPermutation, uPermutation],
    states: 288,
    cases: 21,
  },
  {
    family: "CLL",
    size: 2,
    macros: [sune, tPermutation],
    states: 648,
    cases: 42,
  },
];
function simplify(sequence: string[]) {
  const output: string[] = [];
  for (const move of sequence) {
    const last = output.at(-1);
    if (last?.[0] === move[0]) {
      output.pop();
      const count =
        (last.endsWith("2") ? 2 : last.endsWith("'") ? 3 : 1) +
        (move.endsWith("2") ? 2 : move.endsWith("'") ? 3 : 1);
      if (count % 4) output.push(move[0] + ["", "", "2", "'"][count % 4]);
    } else output.push(move);
  }
  return output;
}
const families = specifications.map(
  ({ family, size, macros, states, cases }) => {
    const generators = [
      ...new Set([
        "U",
        "U'",
        "U2",
        ...macros.flatMap((macro) => [macro, inverse(macro).join(" ")]),
      ]),
    ].map((algorithm) => ({
      moves: algorithm.split(" "),
      permutation: algorithmPermutation(size, algorithm),
    }));
    const solved = solvedColors(size),
      solvedClass = canonicalShape(solved, family);
    type Node = { colors: string; path: string[]; cost: number };
    const initial: Node = { colors: solved, path: [], cost: 0 },
      queue = [initial],
      seen = new Map([[shapeKey(solved, family), initial]]);
    // Weighted search favors shorter combinations of familiar triggers. This is
    // shortest within these macros, not an optimal-move or finger-trick claim.
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;
      if (seen.get(shapeKey(current.colors, family)) !== current) continue;
      for (const generator of generators) {
        const colors = permuteColors(current.colors, generator.permutation),
          key = shapeKey(colors, family),
          cost = current.cost + generator.moves.length;
        if ((seen.get(key)?.cost ?? Infinity) <= cost) continue;
        const next = {
          colors,
          cost,
          path: [...current.path, ...generator.moves],
        };
        seen.set(key, next);
        queue.push(next);
      }
    }
    if (seen.size !== states)
      throw new Error(
        `${family}: expected ${states} reachable states, got ${seen.size}`,
      );
    const classes = new Map<string, Node>();
    for (const node of seen.values()) {
      if (!preservesFirstLayers(node.colors, family))
        throw new Error(`${family} changed a solved layer`);
      const canonical = canonicalShape(node.colors, family);
      if (canonical === solvedClass) continue;
      if (!classes.has(canonical) || classes.get(canonical)!.cost > node.cost)
        classes.set(canonical, node);
    }
    if (classes.size !== cases)
      throw new Error(
        `${family}: expected ${cases} cases, got ${classes.size}`,
      );
    const entries = [...classes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pattern, node], index) => ({
        id: `${family.toLowerCase()}-cubers-${String(index + 1).padStart(3, "0")}`,
        family,
        puzzle: size === 2 ? "2x2" : "3x3",
        pattern,
        representative: node.colors,
        algorithm: simplify(inverse(node.path)).join(" "),
      }));
    console.log(
      `${family}: ${states} states, ${entries.length} nontrivial classes; solved layers preserved.`,
    );
    return { family, states, cases: entries };
  },
);
writeFileSync(
  "packages/core/src/algorithm-cases.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      method:
        "Original combinations of validated cubing triggers; Cubers IDs are not standard case numbers.",
      families,
    },
    null,
    2,
  ) + "\n",
);
