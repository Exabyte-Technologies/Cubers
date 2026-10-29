import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lessons,
  algorithmCases,
  checkedLessonAlternatives,
  checkedCourseLesson,
  lessonDemonstration,
  DownloadedLesson,
  LessonAlternative,
  TutorRequest,
  practiceSetup,
  practiceApply,
  practiceKey,
  solvedPuzzle,
  validateScan,
  type Lesson,
  type LessonAlternative as Alternative,
} from "@cubers/core";
const options = lessons.filter((row) => row.alternatives?.length);
test("66 shorter built-in alternatives solve the unchanged original case and preserve its exact frame", () => {
  assert.equal(lessons.length, 149);
  assert.equal(algorithmCases.length, 120);
  assert.equal(options.length, 66);
  assert.deepEqual(
    ["OLL", "PLL", "CLL"].map(
      (f) => options.filter((l) => l.caseFamily === f).length,
    ),
    [7, 19, 40],
  );
  let before = 0,
    after = 0;
  for (const lesson of options) {
    const original = algorithmCases.find((row) => row.id === lesson.id)!;
    assert.equal(lesson.algorithm, original.algorithm);
    assert.equal(
      practiceKey(practiceSetup(lesson.puzzle, lesson.algorithm)),
      original.representative,
    );
    const [alternative] = checkedLessonAlternatives(lesson);
    const state = practiceSetup(lesson.puzzle, alternative.algorithm);
    assert.equal("size" in state && validateScan(state).valid, true);
    assert.equal(practiceKey(state), original.representative);
    assert.equal(
      practiceKey(practiceApply(state, alternative.algorithm)),
      practiceKey(solvedPuzzle(lesson.puzzle)),
    );
    assert.deepEqual(checkedCourseLesson(lesson).alternatives, [alternative]);
    before += lesson.algorithm.split(" ").length;
    after += alternative.algorithm.split(" ").length;
  }
  assert.equal(before, 1662);
  assert.equal(after, 757);
});
test("baseline selection remains historical and alternatives resolve only published lesson identities", () => {
  const lesson = options[0],
    option = lesson.alternatives![0];
  assert.deepEqual(lessonDemonstration(lesson), {
    guideId: null,
    guideAlgorithm: null,
  });
  assert.deepEqual(lessonDemonstration(lesson, option.id), {
    guideId: option.id,
    guideAlgorithm: option.algorithm,
  });
  assert.throws(() => lessonDemonstration(lesson, "unpublished"));
  const { alternatives, ...legacy } = lesson;
  assert.doesNotThrow(() => checkedCourseLesson(legacy));
  assert.throws(() => lessonDemonstration(legacy, option.id));
  assert.throws(() =>
    checkedCourseLesson({ ...lesson, algorithm: option.algorithm }),
  );
  assert.throws(() =>
    checkedCourseLesson({
      ...lesson,
      alternatives: [{ ...option, title: { en: "Changed", zh: "已修改" } }],
    }),
  );
});
test("changed cases, rotations, longer sequences, duplicate identities and guided shortcuts fail validation", () => {
  const lesson = options[0],
    option = lesson.alternatives![0];
  for (const algorithm of [
    "R",
    "x " + option.algorithm,
    lesson.algorithm,
    "R R' " + lesson.algorithm,
    "",
  ])
    assert.throws(() =>
      checkedLessonAlternatives({
        ...lesson,
        alternatives: [{ ...option, algorithm }],
      }),
    );
  assert.throws(() =>
    checkedLessonAlternatives({ ...lesson, alternatives: [option, option] }),
  );
  assert.throws(() =>
    checkedLessonAlternatives({
      ...lesson,
      alternatives: Array(4).fill(option),
    }),
  );
  assert.throws(() =>
    checkedLessonAlternatives({ ...lesson, kind: "guided-first-solve" }),
  );
  for (const patch of [
    { id: "bad\n" },
    { id: "" },
    { title: { en: "", zh: "说明" } },
    { algorithm: "R\nU" },
    { steps: { en: [], zh: ["说明"] } },
    { invented: true },
  ])
    assert.equal(
      LessonAlternative.safeParse({ ...option, ...patch }).success,
      false,
    );
});
function packet(lesson: Lesson) {
  return {
    schemaVersion: 1,
    ownerId: "00000000-0000-4000-8000-000000000001",
    region: "INTL",
    downloadedAt: 1000,
    expiresAt: 61000,
    courseVersion: 3,
    lesson,
  };
}
test("downloaded alternatives are bounded and mathematically checked without changing legacy packets", () => {
  for (const lesson of options) {
    const result = DownloadedLesson.parse(packet(lesson));
    assert.equal(result.lesson.alternatives!.length, 1);
  }
  const { alternatives, ...legacy } = options[0];
  assert.equal(
    DownloadedLesson.parse(packet(legacy)).lesson.alternatives,
    undefined,
  );
  const option = alternatives![0];
  const changed = {
    ...options[0],
    alternatives: [{ ...option, algorithm: "R" }],
  };
  assert.equal(DownloadedLesson.safeParse(packet(changed)).success, false);
});
test("alternate tutoring accepts a guide identity and rejects client-supplied algorithms or provenance", () => {
  const request = {
    lessonId: options[0].id,
    courseVersion: 3,
    locale: "en",
    moves: [],
    alternativeId: "shorter-v1",
  };
  assert.equal(TutorRequest.parse(request).alternativeId, "shorter-v1");
  assert.equal(
    TutorRequest.safeParse({ ...request, guideAlgorithm: "R" }).success,
    false,
  );
  assert.equal(
    TutorRequest.safeParse({ ...request, source: "validated" }).success,
    false,
  );
});
