import { test } from "node:test";
import assert from "node:assert/strict";
import {
  solvedCube,
  applyMoves,
  facelets,
  fromFacelets,
  validateScan,
  lessons,
  scramble,
  type CubeState,
} from "@cubers/core";
function wings(state: CubeState) {
  const pieces = new Map<string, typeof state.stickers>();
  for (const sticker of state.stickers) {
    const key = sticker.p.join();
    pieces.set(key, [...(pieces.get(key) || []), sticker]);
  }
  return [...pieces.values()].filter((piece) => piece.length === 2);
}
test("4×4 accepts legal wide turns, inner slices, rotations and both parity types", () => {
  let value = 738321;
  const random = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
  for (let i = 0; i < 500; i++) {
    const state = applyMoves(solvedCube(4), scramble(4, random));
    assert.deepEqual(validateScan(state), { valid: true, complete: true });
    assert.ok(validateScan(applyMoves(state, "x y z")).valid);
  }
  for (const move of [
    "R",
    "L",
    "F",
    "B",
    "U",
    "D",
    "Rw",
    "Lw",
    "Fw",
    "Bw",
    "Uw",
    "Dw",
  ])
    for (const suffix of ["", "'", "2"])
      assert.ok(
        validateScan(applyMoves(solvedCube(4), move + suffix)).valid,
        move + suffix,
      );
  assert.ok(
    validateScan(
      applyMoves(
        solvedCube(4),
        lessons.find((lesson) => lesson.id === "4-parity")!.algorithm,
      ),
    ).valid,
  );
  // A single paired-edge flip is a legal 4×4 color state, unlike a 3×3 edge flip.
  const flippedPair = solvedCube(4);
  for (const wing of wings(flippedPair).filter(
    (piece) =>
      piece.some((s) => s.color === "U") && piece.some((s) => s.color === "R"),
  ))
    [wing[0].color, wing[1].color] = [wing[1].color, wing[0].color];
  assert.ok(validateScan(flippedPair).valid);
  // An odd visible corner permutation is legal: hidden same-color center labels
  // can supply matching parity. Do not apply the 3×3 corner/edge parity rule.
  const odd = facelets(solvedCube(4));
  [odd.R[0], odd.F[0]] = [odd.F[0], odd.R[0]];
  [odd.F[3], odd.L[3]] = [odd.L[3], odd.F[3]];
  assert.ok(validateScan(fromFacelets(4, odd)).valid);
});
test("4×4 rejects every single-wing flip and a twisted or mirrored corner", () => {
  for (let i = 0; i < 24; i++) {
    const state = solvedCube(4),
      wing = wings(state)[i];
    [wing[0].color, wing[1].color] = [wing[1].color, wing[0].color];
    assert.equal(validateScan(state).valid, false, `wing ${i}`);
    assert.match(validateScan(state).reason!, /wing/i);
  }
  const twisted = facelets(solvedCube(4));
  [twisted.U[15], twisted.R[0], twisted.F[3]] = [
    twisted.R[0],
    twisted.F[3],
    twisted.U[15],
  ];
  assert.match(validateScan(fromFacelets(4, twisted)).reason!, /twisted/);
  const mirrored = facelets(solvedCube(4));
  [mirrored.R[0], mirrored.F[3]] = [mirrored.F[3], mirrored.R[0]];
  assert.match(validateScan(fromFacelets(4, mirrored)).reason!, /mirrored/);
});
test("4×4 permits center color permutations but enforces color quotas", () => {
  const colors = facelets(solvedCube(4));
  [colors.F[5], colors.R[5]] = [colors.R[5], colors.F[5]];
  assert.ok(validateScan(fromFacelets(4, colors)).valid);
  colors.F[6] = "U";
  assert.equal(validateScan(fromFacelets(4, colors)).valid, false);
});
