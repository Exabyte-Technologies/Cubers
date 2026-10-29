import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planFourFirstSolve,
  fourGuidanceSpaceSummary,
  fourPieceCycle,
} from "../apps/api/src/four-first-solve-planner";
import {
  solvedCube,
  applyMoves,
  inverse,
  facelets,
  fromFacelets,
  scramble,
  isSolved,
  validateScan,
  FOUR_REFERENCE,
  FOUR_CENTER_SLOTS,
  FOUR_WING_SLOTS,
  FOUR_CENTER_COLORS,
  fourWings,
  fourCenters,
  fourSolveGoal,
  cubePieces,
  prepareGuidedFour,
  guidedTeaching,
} from "@cubers/core";
test("4×4 setup tables cover every ordered center and wing triple with pure cycles", () => {
  assert.deepEqual(fourGuidanceSpaceSummary(), {
    centerTriples: 12144,
    centerMaximumSetup: 6,
    wingTriples: 12144,
    wingMaximumSetup: 5,
  });
  for (const kind of ["centers", "wings"] as const)
    for (const positions of [
      [0, 1, 2],
      [23, 0, 12],
      [5, 17, 9],
    ]) {
      const moves = fourPieceCycle(kind, positions),
        tagged = applyMoves(solvedCube(4), moves),
        source = solvedCube(4);
      const slots = kind === "centers" ? FOUR_CENTER_SLOTS : FOUR_WING_SLOTS;
      const index = new Map(slots.map((piece, i) => [piece[0].p.join(), i]));
      for (let original = 0; original < source.stickers.length; original++) {
        const s = source.stickers[original],
          result = tagged.stickers[original],
          from = index.get(s.p.join());
        if (from !== undefined && positions.includes(from))
          assert.equal(
            index.get(result.p.join()),
            positions[(positions.indexOf(from) + 1) % 3],
          );
        else assert.deepEqual(result, s);
      }
      assert.ok(isSolved(applyMoves(tagged, inverse(moves))));
    }
  assert.throws(() => fourPieceCycle("centers", [0, 0, 1]));
});
test("200 arbitrary legal 4×4 scans complete centers, twelve edge pairs and all reduced-layer goals", () => {
  let seed = 37121;
  const random = () =>
    (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let index = 0; index < 200; index++) {
    const original = applyMoves(solvedCube(4), [
        ...scramble(4, random),
        ...[[], ["x"], ["y2"], ["z'"]][index % 4],
      ]),
      before = JSON.stringify(facelets(original));
    const plan = planFourFirstSolve(fromFacelets(4, facelets(original)));
    assert.equal(plan.steps.length, 32);
    let state = fromFacelets(4, plan.startingFaces);
    for (const step of plan.steps) {
      assert.deepEqual(step.blocks.flat(), step.moves);
      state = applyMoves(state, step.moves);
      assert.equal(
        fourSolveGoal(state, step),
        true,
        `${index}:${step.goal}:${step.target}`,
      );
    }
    assert.equal(isSolved(state), true);
    assert.ok(plan.steps.flatMap((step) => step.moves).length <= 2500);
    assert.equal(JSON.stringify(facelets(original)), before);
  }
});
test("legal paired-edge flip, odd visible corners and center swaps receive complete 4×4 plans", () => {
  const flip = solvedCube(4);
  for (const wing of cubePieces(flip).filter(
    (piece) =>
      piece.length === 2 &&
      piece.some((s) => s.color === "U") &&
      piece.some((s) => s.color === "R"),
  ))
    [wing[0].color, wing[1].color] = [wing[1].color, wing[0].color];
  const corners = facelets(solvedCube(4));
  [corners.R[0], corners.F[0]] = [corners.F[0], corners.R[0]];
  [corners.F[3], corners.L[3]] = [corners.L[3], corners.F[3]];
  const center = facelets(FOUR_REFERENCE);
  [center.F[5], center.R[5]] = [center.R[5], center.F[5]];
  for (const state of [
    flip,
    fromFacelets(4, corners),
    fromFacelets(4, center),
  ]) {
    assert.ok(validateScan(state).valid);
    const plan = planFourFirstSolve(state);
    assert.ok(
      isSolved(
        applyMoves(
          fromFacelets(4, plan.startingFaces),
          plan.steps.flatMap((step) => step.moves),
        ),
      ),
    );
  }
  const impossible = solvedCube(4),
    wing = cubePieces(impossible).find((piece) => piece.length === 2)!;
  [wing[0].color, wing[1].color] = [wing[1].color, wing[0].color];
  assert.throws(() => planFourFirstSolve(impossible), /valid/);
});
test("replanning after every 4×4 checkpoint leaves cumulative completed phases unchanged", () => {
  let state = applyMoves(solvedCube(4), "Rw U Fw' L2 Dw B Rw2 F U' x");
  let plan = planFourFirstSolve(state);
  for (let stage = 0; stage < 32; stage++) {
    state = applyMoves(state, plan.steps[stage].moves);
    const fresh = planFourFirstSolve(state);
    assert.ok(
      fresh.steps.slice(0, stage + 1).every((step) => step.moves.length === 0),
      `past phase changed at ${stage}`,
    );
    plan = fresh;
  }
  assert.ok(isSolved(state));
  const disrupted = applyMoves(state, "Rw"),
    final = plan.steps.at(-1)!;
  assert.equal(fourSolveGoal(disrupted, final), false);
  for (const locale of ["en", "zh"] as const)
    assert.ok(guidedTeaching(final, facelets(disrupted), locale, "4x4").title);
});
test("4×4 scan framing preserves mixed centers and aligns recognizable completed centers", () => {
  const mixed = applyMoves(FOUR_REFERENCE, "Rw U Fw'");
  assert.deepEqual(facelets(prepareGuidedFour(mixed)), facelets(mixed));
  const outer = applyMoves(FOUR_REFERENCE, "R U F2");
  for (const frame of ["", "x", "y2", "z'", "x y z"])
    assert.deepEqual(
      facelets(prepareGuidedFour(applyMoves(outer, frame))),
      facelets(outer),
    );
  const swapped = facelets(FOUR_REFERENCE);
  for (const index of [5, 6, 9, 10])
    [swapped.F[index], swapped.R[index]] = [swapped.R[index], swapped.F[index]];
  const unusual = fromFacelets(4, swapped);
  assert.deepEqual(facelets(prepareGuidedFour(unusual)), swapped);
});
