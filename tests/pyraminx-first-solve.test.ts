import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planPyraminxFirstSolve,
  pyraminxGuidanceSpaceSummary,
} from "../apps/api/src/pyraminx-first-solve-planner";
import {
  solvedPyraminx,
  pyraminxApply,
  pyraminxFacelets,
  pyraminxFromFacelets,
  pyraminxScramble,
  pyraminxOrientations,
  pyraminxSolved,
  pyraminxKey,
  prepareGuidedPyraminx,
  pyraminxSolveGoal,
} from "@cubers/core";
test("geometry-derived Pyraminx groups cover every legal edge configuration within the move budget", () => {
  const summary = pyraminxGuidanceSpaceSummary();
  assert.equal(summary.edgeStates, 11520);
  assert.equal(summary.groups, 12);
  assert.ok(summary.maximumGroups * 16 + 8 <= 200);
});
test("200 arbitrary Pyraminx scans and all twelve reference orientations solve through twelve cumulative checkpoints", () => {
  let seed = 2819;
  const random = () =>
    (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let index = 0; index < 200; index++) {
    const original = pyraminxApply(solvedPyraminx(), pyraminxScramble(random)),
      captured = pyraminxOrientations(original)[index % 12],
      source = pyraminxKey(captured),
      scan = pyraminxFromFacelets(pyraminxFacelets(captured)),
      plan = planPyraminxFirstSolve(scan);
    assert.equal(plan.puzzle, "pyraminx");
    assert.equal(plan.steps.length, 12);
    let state = prepareGuidedPyraminx(scan);
    assert.deepEqual(pyraminxFacelets(state), plan.startingFaces);
    for (const step of plan.steps) {
      assert.deepEqual(step.blocks.flat(), step.moves);
      assert.ok(step.moves.every((move) => /^[ULRBulrb]'?$/.test(move)));
      state = pyraminxApply(state, step.moves);
      assert.equal(
        pyraminxSolveGoal(state, step.goal, step.target),
        true,
        `${index}:${step.goal}:${step.target}`,
      );
    }
    assert.equal(pyraminxSolved(state), true);
    assert.ok(plan.steps.flatMap((step) => step.moves).length <= 200);
    assert.equal(pyraminxKey(captured), source);
  }
});
test("Pyraminx guidance refuses impossible flips, reflected tips and invalid targets", () => {
  const state = solvedPyraminx();
  const edge = state.stickers.filter(
    (sticker) => sticker.position[0] === 4 && sticker.position[1] === 4,
  );
  [edge[0].color, edge[1].color] = [edge[1].color, edge[0].color];
  assert.throws(() => planPyraminxFirstSolve(state), /flipped/);
  const reflected = solvedPyraminx(),
    tip = reflected.stickers.filter((sticker) => sticker.position[0] === 7);
  [tip[0].color, tip[1].color] = [tip[1].color, tip[0].color];
  assert.throws(() => planPyraminxFirstSolve(reflected), /reflected/);
  assert.equal(pyraminxSolveGoal(solvedPyraminx(), "pyra-tip", -1), false);
  assert.equal(pyraminxSolveGoal(solvedPyraminx(), "pyra-base-edge", 0), false);
});
