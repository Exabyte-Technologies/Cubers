import { test } from "node:test";
import assert from "node:assert/strict";
import {
  algorithmCases,
  recognizeAlgorithmCase,
  applyMoves,
  fromFacelets,
  facelets,
  inverse,
  isSolved,
  solvedCube,
  stateKey,
  FACES,
  validateScan,
  observeLastLayer,
  lastLayerObservations,
  type Face,
  type AlgorithmFamily,
} from "@cubers/core";
import {
  algorithmPermutation,
  permuteColors,
  canonicalShape,
  shapeKey,
  solvedColors,
  preservesFirstLayers,
} from "../packages/core/src/algorithm-shapes";
const specifications: {
  family: AlgorithmFamily;
  size: 2 | 3;
  states: number;
  cases: number;
  generators: string[];
}[] = [
  {
    family: "OLL",
    size: 3,
    states: 216,
    cases: 57,
    generators: ["U", "R U R' U R U2 R'", "F R U R' U' F'"],
  },
  {
    family: "PLL",
    size: 3,
    states: 288,
    cases: 21,
    generators: [
      "U",
      "R U R' U' R' F R2 U' R' U' R U R' F'",
      "R U' R U R U R U' R' U' R2",
    ],
  },
  {
    family: "CLL",
    size: 2,
    states: 648,
    cases: 42,
    generators: [
      "U",
      "R U R' U R U2 R'",
      "R U R' U' R' F R2 U' R' U' R U R' F'",
    ],
  },
];
for (const { family, size, states, cases, generators } of specifications) {
  test(`${family} covers all ${cases} nontrivial cases and recognizes every reachable last-layer pattern`, () => {
    const entries = algorithmCases.filter((entry) => entry.family === family);
    assert.equal(entries.length, cases);
    assert.equal(new Set(entries.map((entry) => entry.pattern)).size, cases);
    const solved = solvedColors(size),
      identity = canonicalShape(solved, family);
    for (const entry of entries) {
      const setup = applyMoves(solvedCube(size), inverse(entry.algorithm));
      assert.equal(stateKey(setup), entry.representative, entry.id);
      assert.equal(validateScan(setup).valid, true, entry.id);
      assert.ok(preservesFirstLayers(stateKey(setup), family), entry.id);
      assert.equal(canonicalShape(stateKey(setup), family), entry.pattern);
      assert.ok(isSolved(applyMoves(setup, entry.algorithm)), entry.id);
    }
    const permutations = generators.map((algorithm) =>
        algorithmPermutation(size, algorithm),
      ),
      queue = [solved],
      seen = new Set([shapeKey(solved, family)]);
    for (let head = 0; head < queue.length; head++)
      for (const permutation of permutations) {
        const next = permuteColors(queue[head], permutation),
          key = shapeKey(next, family);
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(next);
        }
      }
    assert.equal(seen.size, states);
    assert.equal(
      new Set(queue.map((colors) => canonicalShape(colors, family))).size,
      cases + 1,
    );
    for (const colors of queue) {
      const state = fromFacelets(
        size,
        Object.fromEntries(
          FACES.map((face, i) => [
            face,
            colors.slice(i * size * size, (i + 1) * size * size).split(""),
          ]),
        ) as Record<Face, Face[]>,
      );
      const recognized = recognizeAlgorithmCase(state, family);
      // Check the teaching against independent face-row/column coordinates,
      // rather than the observer's geometric sticker grouping.
      const observation = observeLastLayer(state, family)!;
      const faces = facelets(state);
      assert.ok(observation);
      assert.deepEqual(observation.top, faces.U);
      const cornerIndices = size === 2 ? [0, 1, 2, 3] : [0, 2, 6, 8];
      assert.equal(
        observation.orientedCorners,
        cornerIndices.filter((index) => faces.U[index] === "U").length,
      );
      assert.equal(
        observation.orientedEdges,
        size === 2
          ? null
          : [1, 3, 5, 7].filter((index) => faces.U[index] === "U").length,
      );
      const cornerColors: Record<string, string[]> = {
        UFR: [faces.U[size * size - 1], faces.F[size - 1], faces.R[0]],
        UFL: [faces.U[size * (size - 1)], faces.F[0], faces.L[size - 1]],
        UBL: [faces.U[0], faces.B[size - 1], faces.L[0]],
        UBR: [faces.U[size - 1], faces.B[0], faces.R[size - 1]],
      };
      for (const piece of observation.corners) {
        assert.equal(
          [...piece.destination].sort().join(""),
          cornerColors[piece.slot].slice().sort().join(""),
        );
        assert.equal(piece.oriented, cornerColors[piece.slot][0] === "U");
      }
      assert.equal(
        new Set(observation.corners.map((piece) => piece.destination)).size,
        4,
      );
      const edgeColors: Record<string, string[]> =
        size === 3
          ? {
              UF: [faces.U[7], faces.F[1]],
              UL: [faces.U[3], faces.L[1]],
              UB: [faces.U[1], faces.B[1]],
              UR: [faces.U[5], faces.R[1]],
            }
          : {};
      for (const piece of observation.edges) {
        assert.equal(
          [...piece.destination].sort().join(""),
          edgeColors[piece.slot].slice().sort().join(""),
        );
        assert.equal(piece.oriented, edgeColors[piece.slot][0] === "U");
      }
      assert.equal(observation.edges.length, size === 3 ? 4 : 0);
      for (const side of observation.sides) {
        assert.deepEqual(side.stickers, faces[side.face].slice(0, size));
        if (side.stickers[0] === "U" && side.stickers.at(-1) === "U")
          assert.equal(
            side.matchingCorners,
            false,
            "White side stickers are not a side-color pair",
          );
      }
      if (canonicalShape(colors, family) === identity) {
        assert.equal(recognized, null);
        continue;
      }
      assert.ok(recognized, `${family} missed ${colors}`);
      const observations = lastLayerObservations(
        state,
        family,
        recognized.before,
      );
      assert.deepEqual(observations.current, observation);
      assert.deepEqual(
        observations.prepared,
        observeLastLayer(applyMoves(state, recognized.before), family),
      );
      const result = applyMoves(state, [
        ...recognized.before,
        ...recognized.algorithm,
        ...recognized.after,
      ]);
      assert.ok(preservesFirstLayers(stateKey(result), family));
      if (family === "OLL")
        assert.ok(facelets(result).U.every((color) => color === "U"));
      else assert.ok(isSolved(result), `${family} failed ${colors}`);
    }
  });
}
test("case recognition rejects unfinished first layers, wrong puzzle sizes and unoriented PLL input", () => {
  assert.equal(
    recognizeAlgorithmCase(applyMoves(solvedCube(), "R"), "OLL"),
    null,
  );
  assert.equal(recognizeAlgorithmCase(solvedCube(2), "PLL"), null);
  assert.equal(
    recognizeAlgorithmCase(applyMoves(solvedCube(), "R U R' U R U2 R'"), "PLL"),
    null,
  );
});
test("recognition teaching separates side pairs, bars and final alignment", () => {
  const topTurn = observeLastLayer(applyMoves(solvedCube(), "U"), "PLL")!;
  assert.ok(
    topTurn.sides.every(
      (side) => side.matchingCorners && side.solidBar && !side.aligned,
    ),
  );
  assert.deepEqual(
    topTurn.corners.map((piece) => piece.destination),
    ["UBR", "UFR", "UFL", "UBL"],
  );
  assert.deepEqual(
    topTurn.edges.map((piece) => piece.destination),
    ["UR", "UF", "UL", "UB"],
  );
  const permutation = observeLastLayer(
    applyMoves(solvedCube(), "R U R' U' R' F R2 U' R' U' R U R' F'"),
    "PLL",
  )!;
  assert.deepEqual(
    permutation.sides
      .filter((side) => side.matchingCorners)
      .map((side) => side.face),
    ["L"],
  );
  assert.ok(permutation.sides.every((side) => !side.solidBar));
  assert.deepEqual(
    permutation.corners.map((piece) => piece.destination),
    ["UBR", "UFL", "UBL", "UFR"],
  );
  assert.deepEqual(
    permutation.edges.map((piece) => piece.destination),
    ["UF", "UR", "UB", "UL"],
  );
});
test("OLL and CLL coaching counts upper corners separately from edges and excludes the center", () => {
  const sequence = "R U R' U R U2 R'";
  const oll = observeLastLayer(applyMoves(solvedCube(), sequence), "OLL")!;
  assert.deepEqual(oll.top, ["F", "U", "U", "U", "U", "U", "R", "U", "B"]);
  assert.equal(oll.orientedCorners, 1);
  assert.equal(oll.orientedEdges, 4);
  const cll = observeLastLayer(applyMoves(solvedCube(2), sequence), "CLL")!;
  assert.deepEqual(cll.top, ["F", "U", "R", "B"]);
  assert.equal(cll.orientedCorners, 1);
  assert.equal(cll.orientedEdges, null);
  assert.deepEqual(cll.edges, []);
});
test("teaching rejects wrong puzzle, frame, unfinished layers and premature PLL", () => {
  assert.equal(observeLastLayer(solvedCube(4), "OLL"), null);
  assert.equal(observeLastLayer(solvedCube(3), "CLL"), null);
  assert.equal(observeLastLayer(applyMoves(solvedCube(), "x"), "OLL"), null);
  assert.equal(observeLastLayer(applyMoves(solvedCube(), "R"), "OLL"), null);
  assert.equal(
    observeLastLayer(applyMoves(solvedCube(), "R U R' U R U2 R'"), "PLL"),
    null,
  );
  assert.throws(
    () => lastLayerObservations(solvedCube(), "OLL", ["R"]),
    /prerequisites/,
  );
});
