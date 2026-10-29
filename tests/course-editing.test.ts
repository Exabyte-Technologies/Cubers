import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  checkedCourseLesson,
  CoursePublish,
  CourseCreate,
  lessons,
} from "@cubers/core";
const custom = (puzzle = "3x3", algorithm = "R U R' U'") => ({
  id: `custom-${randomUUID()}`,
  puzzle,
  kind: "drill",
  level: "beginner",
  title: { en: "An original practice", zh: "原创练习" },
  summary: { en: "Follow a verified exercise.", zh: "完成经过校验的练习。" },
  steps: { en: ["Watch the reference orientation."], zh: ["注意参照方向。"] },
  algorithm,
  minutes: 5,
});
test("all launch lessons remain editable bilingual teaching with fixed built-in verification", () => {
  for (const lesson of lessons) {
    assert.equal(checkedCourseLesson(lesson).id, lesson.id);
    const edited = {
      ...lesson,
      title: { en: "Revised teaching", zh: "修订后的教学内容" },
    };
    assert.equal(checkedCourseLesson(edited).title.zh, edited.title.zh);
    for (const patch of [
      { puzzle: lesson.puzzle === "2x2" ? "3x3" : "2x2" },
      { algorithm: lesson.algorithm + " R" },
      { level: lesson.level === "advanced" ? "beginner" : "advanced" },
    ])
      assert.throws(() => checkedCourseLesson({ ...lesson, ...patch }));
  }
});
test("original drill authoring rejects empty, identity, oversized, forged and puzzle-incompatible exercises", () => {
  for (const [puzzle, algorithm] of [
    ["2x2", "R U R'"],
    ["3x3", "R U2"],
    ["4x4", "Rw U Rw'"],
    ["pyraminx", "u L R'"],
  ])
    assert.equal(checkedCourseLesson(custom(puzzle, algorithm)).puzzle, puzzle);
  for (const value of [
    custom("3x3", ""),
    custom("3x3", "R R'"),
    custom("3x3", "not-a-turn"),
    custom("2x2", "Rw"),
    custom("pyraminx", "R2"),
    { ...custom(), id: "3-forged" },
    { ...custom(), kind: "guided-first-solve" },
    { ...custom(), caseFamily: "OLL" },
    { ...custom(), algorithm: Array(501).fill("R").join(" ") },
    { ...custom(), title: { en: "", zh: "标题" } },
  ])
    assert.throws(() => checkedCourseLesson(value));
  const one = custom();
  assert.throws(() => checkedCourseLesson(one, "4x4"));
  const { id, ...lesson } = one;
  assert.ok(
    CourseCreate.safeParse({
      lesson,
      reason: "Original teaching material for review",
    }).success,
  );
  assert.equal(
    CourseCreate.safeParse({
      lesson: { ...lesson, id: "forged" },
      reason: "Original teaching material",
    }).success,
    false,
  );
});
test("publication requires exact revision and both language/rights attestations while withdrawal needs none", () => {
  assert.ok(
    CoursePublish.safeParse({ expectedVersion: 1, published: false }).success,
  );
  const publish = {
    expectedVersion: 3,
    published: true,
    reviewed: true,
    englishReviewed: true,
    chineseReviewed: true,
    rightsConfirmed: true,
  };
  assert.ok(CoursePublish.safeParse(publish).success);
  for (const key of [
    "expectedVersion",
    "reviewed",
    "englishReviewed",
    "chineseReviewed",
    "rightsConfirmed",
  ]) {
    const missing = { ...publish } as any;
    delete missing[key];
    assert.equal(CoursePublish.safeParse(missing).success, false);
  }
});
