import { test } from "node:test";
import assert from "node:assert/strict";
import {
  solvedCube,
  turn,
  applyMoves,
  inverse,
  isSolved,
  stateKey,
  validateScan,
  facelets,
  fromFacelets,
  scramble,
  FACES,
  lessons,
} from "@cubers/core";
for (const size of [2, 3, 4] as const) {
  test(`${size}×${size}: moves and inverse preserve all stickers`, () => {
    const moves = "R U2 F' L D B2 R' U F D' L2";
    const s = applyMoves(solvedCube(size), moves);
    assert.equal(isSolved(s), false);
    assert.equal(
      stateKey(applyMoves(s, inverse(moves))),
      stateKey(solvedCube(size)),
    );
    for (const f of FACES)
      assert.equal(s.stickers.filter((x) => x.color === f).length, size * size);
  });
  test(`${size}×${size}: four turns, whole orientations and half turns`, () => {
    for (const f of [...FACES, "x", "y", "z"]) {
      assert.equal(
        stateKey(applyMoves(solvedCube(size), [f, f, f, f])),
        stateKey(solvedCube(size)),
      );
      assert.equal(
        stateKey(applyMoves(solvedCube(size), [`${f}2`, `${f}2`])),
        stateKey(solvedCube(size)),
      );
    }
    assert.equal(isSolved(applyMoves(solvedCube(size), "x y z")), true);
  });
  test(`${size}×${size}: facelet round-trip`, () => {
    const s = applyMoves(solvedCube(size), scramble(size));
    assert.equal(stateKey(fromFacelets(size, facelets(s))), stateKey(s));
  });
}
test("3×3: legal scrambles remain reachable", () => {
  for (let i = 0; i < 100; i++) {
    const s = applyMoves(solvedCube(), scramble(3));
    assert.deepEqual(validateScan(s), { valid: true, complete: true });
    assert.equal(validateScan(applyMoves(s, "x y")).valid, true);
  }
});
test("2×2: legal states pass corner checks", () => {
  for (let i = 0; i < 30; i++)
    assert.equal(
      validateScan(applyMoves(solvedCube(2), scramble(2))).valid,
      true,
    );
});
test("3×3 rejects a flipped edge, twisted corner, and odd permutation", () => {
  let f = facelets(solvedCube());
  [f.U[7], f.F[1]] = [f.F[1], f.U[7]];
  assert.match(validateScan(fromFacelets(3, f)).reason!, /flipped/);
  f = facelets(solvedCube());
  [f.U[8], f.R[0], f.F[2]] = [f.R[0], f.F[2], f.U[8]];
  assert.match(validateScan(fromFacelets(3, f)).reason!, /twisted/);
  f = facelets(solvedCube());
  [f.U[5], f.U[7]] = [f.U[7], f.U[5]];
  [f.R[1], f.F[1]] = [f.F[1], f.R[1]];
  assert.match(validateScan(fromFacelets(3, f)).reason!, /parity/);
});
test("4×4 legal parity algorithm reverses correctly", () => {
  const alg = lessons.find((l) => l.id === "4-parity")!.algorithm;
  const s = applyMoves(solvedCube(4), alg);
  assert.equal(isSolved(s), false);
  assert.equal(stateKey(applyMoves(s, inverse(alg))), stateKey(solvedCube(4)));
});
test("malformed notation and color counts are rejected", () => {
  assert.throws(() => turn(solvedCube(), "R;process.exit()"));
  const f = facelets(solvedCube());
  f.U[0] = "R";
  assert.equal(validateScan(fromFacelets(3, f)).valid, false);
});
test("every cube exercise has a deterministic completion checkpoint", () => {
  for (const lesson of lessons.filter(
    (x) => x.puzzle !== "pyraminx" && x.kind !== "guided-first-solve",
  )) {
    const n = Number(lesson.puzzle[0]) as 2 | 3 | 4;
    assert.ok(
      isSolved(
        applyMoves(
          applyMoves(solvedCube(n), inverse(lesson.algorithm)),
          lesson.algorithm,
        ),
      ),
      lesson.id,
    );
  }
});
