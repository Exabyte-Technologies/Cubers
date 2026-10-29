import { test } from "node:test";
import assert from "node:assert/strict";
import {
  practiceApply,
  practiceMatches,
  practiceSetup,
  practiceScan,
  practiceSolved,
  isPyraminx,
  lessons,
  facelets,
  pyraminxFacelets,
  turn,
  pyraminxOrientations,
  type Puzzle,
} from "@cubers/core";
import { recognizeTriangular, sampleTriangular } from "../apps/mobile/src/scan";
test("all authored puzzle drills have reachable inverse setups and finish solved", () => {
  for (const lesson of lessons.filter(
    (lesson) => lesson.kind !== "guided-first-solve",
  )) {
    const initial = practiceSetup(lesson.puzzle, lesson.algorithm);
    assert.equal(practiceSolved(initial), false, lesson.id);
    assert.equal(
      practiceSolved(practiceApply(initial, lesson.algorithm)),
      true,
      lesson.id,
    );
    {
      const faces = isPyraminx(initial)
        ? pyraminxFacelets(initial)
        : facelets(initial);
      assert.equal(
        practiceMatches(practiceScan(lesson.puzzle, faces), initial),
        true,
        lesson.id,
      );
    }
  }
});
test("physical checkpoints accept whole-puzzle orientation but reject a different turn or puzzle", () => {
  for (const puzzle of ["2x2", "3x3", "pyraminx"] as Puzzle[]) {
    const state = practiceSetup(puzzle, "R U R'"),
      other = practiceApply(state, "L");
    assert.equal(practiceMatches(other, state), false);
    if (isPyraminx(state))
      for (const orientation of pyraminxOrientations(state))
        assert.equal(practiceMatches(orientation, state), true);
    else
      assert.equal(practiceMatches(turn(turn(state, "x"), "y"), state), true);
  }
  assert.equal(
    practiceMatches(practiceSetup("2x2", "R"), practiceSetup("3x3", "R")),
    false,
  );
  assert.throws(() => practiceScan("4x4", {}), /six/);
  assert.throws(() => practiceScan("pyraminx", {}), /four/);
  assert.throws(() => practiceScan("3x3", { F: ["q"] }), /six/);
});
test("Pyraminx photo sampler uses nine triangle centroids and marks uncertain colors", () => {
  const expected = ["F", "R", "B", "D", "F", "R", "B", "D", "F"],
    rgb: Record<string, number[]> = {
      F: [30, 200, 50],
      R: [230, 15, 15],
      B: [20, 60, 230],
      D: [230, 220, 15],
    };
  const width = 300,
    height = 400,
    side = width * 0.65,
    unit = side / 3,
    rowHeight = (unit * Math.sqrt(3)) / 2;
  const data = new Uint8Array(width * height * 4);
  expected.forEach((color, index) => {
    const row = Math.floor(Math.sqrt(index)),
      column = index - row * row;
    const x = Math.round(
        (width - side) / 2 + ((2 - row) * unit) / 2 + ((column + 1) * unit) / 2,
      ),
      y = Math.round(
        (height - 3 * rowHeight) / 2 +
          (row + (column % 2 ? 1 / 3 : 2 / 3)) * rowHeight,
      );
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++)
        data.set([...rgb[color], 255], ((y + dy) * width + x + dx) * 4);
  });
  const samples = sampleTriangular(data, width, height);
  assert.deepEqual(
    samples.map((sample) => sample.color),
    expected,
  );
  assert.ok(samples.every((sample) => sample.confidence > 0.45));
  assert.equal(recognizeTriangular([30, 30, 30]).confidence, 0);
  assert.throws(
    () => sampleTriangular(new Uint8Array(4), 300, 400),
    /image size/,
  );
});
