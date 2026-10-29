import test from "node:test";
import assert from "node:assert/strict";
import {
  planFirstSolve,
  firstSolveSpaceSummary,
} from "../apps/api/src/first-solve-planner";
import {
  solvedCube,
  applyMoves,
  scramble,
  isSolved,
  fromFacelets,
  facelets,
  firstSolveGoal,
  whiteDownFrame,
  pieceCoordinates,
  centerRelativeCube,
} from "@cubers/core";
test("layer planner spans every cross state and the complete constrained insertion/last-layer groups", () => {
  assert.deepEqual(firstSolveSpaceSummary(), {
    crossStates: 190080,
    crossMaximum: 8,
    cornerPlacements: [24, 21, 18, 15],
    middlePlacements: [16, 14, 12, 10],
    yellowEdgeStates: 192,
    yellowCornerStates: 648,
    cornerPermutations: 24,
    finalEdgePermutations: 12,
  });
});
test("200 legal random scans solve through all thirteen validated teaching checkpoints", () => {
  let seed = 1701;
  const random = () =>
    (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  for (let index = 0; index < 200; index++) {
    const initial = applyMoves(solvedCube(), scramble(3, random));
    const scanned = fromFacelets(3, facelets(initial));
    const plan = planFirstSolve(scanned);
    let state = applyMoves(scanned, plan.orientation);
    assert.equal(facelets(state).D[4], "U");
    assert.equal(facelets(state).F[4], "F");
    assert.deepEqual(facelets(state), plan.startingFaces);
    assert.equal(plan.steps.length, 13);
    for (const step of plan.steps) {
      assert.deepEqual(step.blocks.flat(), step.moves);
      state = applyMoves(state, step.moves);
      assert.equal(
        firstSolveGoal(state, step.goal, step.target),
        true,
        `${index}:${step.goal}:${step.target}`,
      );
    }
    assert.equal(isSolved(state), true);
    assert.ok(plan.steps.flatMap((s) => s.moves).length <= 500);
  }
});
test("teaching frame handles rigid rotations and slice/wide-derived legal states without changing scan colors", () => {
  for (const frame of ["", "x", "x2", "x'", "y", "y2", "z", "x y", "z2 y'"]) {
    const state = applyMoves(solvedCube(), `M E' S2 Rw U R' F2 ${frame}`);
    const original = JSON.stringify(facelets(state));
    const plan = planFirstSolve(state);
    assert.equal(
      isSolved(
        applyMoves(state, [
          ...plan.orientation,
          ...plan.steps.flatMap((s) => s.moves),
        ]),
      ),
      true,
    );
    assert.equal(JSON.stringify(facelets(state)), original);
  }
  const framed = whiteDownFrame(solvedCube());
  assert.deepEqual(
    pieceCoordinates(centerRelativeCube(framed.cube)).edges,
    Array.from({ length: 12 }, (_, id) => id * 2),
  );
  assert.equal(firstSolveGoal(framed.cube, "corner", 0), false);
});
test("invalid or unsupported scans cannot obtain a solution plan", () => {
  assert.throws(() => planFirstSolve(solvedCube(4)), /3×3/);
  const faces = facelets(solvedCube());
  [faces.U[7], faces.F[1]] = [faces.F[1], faces.U[7]];
  assert.throws(() => planFirstSolve(fromFacelets(3, faces)), /valid/);
});
test("complete 2×2 guidance solves arbitrary references and legal odd corner permutations through six checkpoints", () => {
  let seed = 4217;
  const random = () =>
    (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  for (let index = 0; index < 200; index++) {
    const initial = applyMoves(solvedCube(2), [
      ...scramble(2, random),
      ...[[], ["x"], ["y2"], ["z'"]][index % 4],
    ]);
    const plan = planFirstSolve(fromFacelets(2, facelets(initial)));
    assert.equal(plan.puzzle, "2x2");
    assert.equal(plan.steps.length, 6);
    assert.deepEqual(plan.orientation, []);
    let current = initial;
    for (const step of plan.steps) {
      current = applyMoves(current, step.moves);
      assert.equal(firstSolveGoal(current, step.goal, step.target), true);
    }
    assert.equal(isSolved(current), true);
    assert.equal(facelets(current).D[0], "U");
    assert.equal(facelets(current).F[0], "F");
  }
  const swapped = facelets(solvedCube(2));
  swapped.R[0] = "F";
  swapped.F[1] = "L";
  swapped.F[0] = "R";
  swapped.L[1] = "F";
  const state = fromFacelets(2, swapped),
    plan = planFirstSolve(state);
  assert.equal(
    isSolved(
      applyMoves(
        state,
        plan.steps.flatMap((s) => s.moves),
      ),
    ),
    true,
  );
  assert.equal(firstSolveGoal(state, "cross"), false);
  const twisted = facelets(solvedCube(2));
  [twisted.U[3], twisted.R[0], twisted.F[1]] = [
    twisted.F[1],
    twisted.U[3],
    twisted.R[0],
  ];
  assert.throws(() => planFirstSolve(fromFacelets(2, twisted)), /valid/);
});
