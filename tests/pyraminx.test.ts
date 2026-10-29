import { test } from "node:test";
import assert from "node:assert/strict";
import {
  solvedPyraminx,
  pyraminxTurn,
  pyraminxApply,
  pyraminxInverse,
  pyraminxKey,
  pyraminxSolved,
  pyraminxFacelets,
  pyraminxFromFacelets,
  pyraminxOrientations,
  validatePyraminx,
  pyraminxScramble,
  PYRA_VERTICES,
  pyraminxGeometry,
} from "@cubers/core";
test("Pyraminx has four nine-triangle faces and round trips scan colors", () => {
  const state = solvedPyraminx();
  assert.equal(state.stickers.length, 36);
  assert.equal(pyraminxGeometry(state).length, 36);
  assert.equal(
    pyraminxKey(pyraminxFromFacelets(pyraminxFacelets(state))),
    pyraminxKey(state),
  );
  assert.equal(validatePyraminx(state).valid, true);
});
test("Pyraminx clockwise moves have order three and lowercase moves turn only tips", () => {
  const solved = solvedPyraminx(),
    key = pyraminxKey(solved);
  for (const vertex of PYRA_VERTICES)
    for (const move of [vertex, vertex.toLowerCase()]) {
      assert.equal(pyraminxKey(pyraminxApply(solved, [move, move, move])), key);
      assert.equal(pyraminxKey(pyraminxApply(solved, [move, `${move}'`])), key);
      const turned = pyraminxTurn(solved, move);
      assert.equal(
        turned.stickers.filter(
          (sticker, index) =>
            sticker.position.join() !== solved.stickers[index].position.join(),
        ).length,
        move === vertex ? 12 : 3,
      );
    }
  assert.throws(() => pyraminxTurn(solved, "R2"));
  assert.throws(() => pyraminxTurn(solved, "F"));
});
test("legal Pyraminx scrambles remain reachable, invert and preserve all orientations", () => {
  let value = 13217;
  const random = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
  for (let i = 0; i < 100; i++) {
    const moves = pyraminxScramble(random),
      state = pyraminxApply(solvedPyraminx(), moves);
    assert.equal(validatePyraminx(state).valid, true, moves.join(" "));
    assert.equal(
      pyraminxSolved(pyraminxApply(state, pyraminxInverse(moves))),
      true,
    );
  }
  const orientations = pyraminxOrientations(
    pyraminxApply(solvedPyraminx(), "U R' L B u r'"),
  );
  assert.equal(orientations.length, 12);
  assert.ok(orientations.every((state) => validatePyraminx(state).valid));
});
test("Pyraminx rejects a single edge flip, two swapped edges and reflected tip colors", () => {
  function pair(
    state: ReturnType<typeof solvedPyraminx>,
    a: number,
    b: number,
  ) {
    return state.stickers
      .filter(
        (sticker) => sticker.position[a] === 4 && sticker.position[b] === 4,
      )
      .sort((x, y) => x.position.indexOf(0) - y.position.indexOf(0));
  }
  let state = solvedPyraminx(),
    edge = pair(state, 0, 1);
  [edge[0].color, edge[1].color] = [edge[1].color, edge[0].color];
  assert.equal(validatePyraminx(state).valid, false);
  state = solvedPyraminx();
  const a = pair(state, 0, 1),
    b = pair(state, 0, 2);
  for (let i = 0; i < 2; i++)
    [a[i].color, b[i].color] = [b[i].color, a[i].color];
  assert.equal(validatePyraminx(state).valid, false);
  state = solvedPyraminx();
  const tip = state.stickers.filter((sticker) => sticker.position[0] === 7);
  [tip[0].color, tip[1].color] = [tip[1].color, tip[0].color];
  assert.equal(validatePyraminx(state).valid, false);
});
