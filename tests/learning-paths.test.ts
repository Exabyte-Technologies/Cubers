import test from "node:test";
import assert from "node:assert/strict";
import { lessons } from "../packages/core/src/curriculum";
import {
  buildLearningPathways,
  lessonStep,
} from "../apps/mobile/src/learning-paths";

test("every published course appears once in a cubing pathway, with finer authored lesson nodes", () => {
  const courses = lessons.map((content) => ({ id: content.id, content }));
  const paths = buildLearningPathways(courses);
  assert.equal(paths.length, 6);
  const units = paths.flatMap((p) => p.units);
  assert.equal(units.length, courses.length);
  assert.equal(new Set(units.map((u) => u.id)).size, courses.length);
  for (const unit of units)
    for (const node of unit.lessons) {
      assert.equal(node.courseId, unit.id);
      assert.ok(
        node.stepIndex >= 0 &&
          node.stepIndex < unit.course.content.steps.en.length,
      );
      assert.equal(
        node.instruction.zh,
        unit.course.content.steps.zh[node.stepIndex],
      );
    }
  const beginner = paths.find((p) => p.id === "beginner-3x3")!;
  assert.equal(beginner.units[0].id, "3-notation");
  assert.equal(beginner.units.at(-1)?.id, "3-first-solve");
  assert.equal(
    beginner.units.find((u) => u.id === "3-cross")?.lessons.length,
    4,
  );
  assert.ok(
    paths
      .find((p) => p.id === "advanced-3x3")!
      .units.some((u) => u.course.content.caseFamily === "OLL"),
  );
  assert.ok(
    paths
      .find((p) => p.id === "advanced-2x2")!
      .units.some((u) => u.course.content.caseFamily === "CLL"),
  );
});
test("withdrawn courses create no phantom lessons, duplicates are ignored, guided solves preserve their validated entry", () => {
  const course = lessons.find((l) => l.id === "3-first-solve")!;
  const paths = buildLearningPathways([
    { id: course.id, content: course },
    { id: course.id, content: course },
  ]);
  const units = paths.flatMap((p) => p.units);
  assert.equal(units.length, 1);
  assert.equal(units[0].lessons.length, 1);
  assert.equal(units[0].lessons[0].guided, true);
  assert.equal(buildLearningPathways([]).flatMap((p) => p.units).length, 0);
});
test("lesson deep links accept only an existing authored step and never advance completion", () => {
  assert.equal(lessonStep("2", 4), 2);
  for (const value of [
    "-1",
    "4",
    "1.5",
    "0xff",
    "9999",
    "Infinity",
    [],
    undefined,
    "",
  ])
    assert.equal(lessonStep(value, 4), 0);
});
