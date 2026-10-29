import test from "node:test";
import assert from "node:assert/strict";
import {
  assessmentDefinitions,
  AssessmentAnswer,
  StartAssessment,
  practiceSetup,
  practiceApply,
  practiceSolved,
  lessons,
} from "@cubers/core";

test("every authored placement variant starts unsolved, has a valid solution and names a matching bilingual course", () => {
  for (const [puzzle, stages] of Object.entries(assessmentDefinitions)) {
    assert.equal(stages.length, 3);
    assert.equal(new Set(stages.map((stage) => stage.id)).size, 3);
    for (const stage of stages) {
      const lesson = lessons.find((l) => l.id === stage.lessonId);
      assert.equal(lesson?.puzzle, puzzle);
      assert.equal(stage.choices.length, 3);
      for (const content of [
        stage.title,
        stage.question,
        stage.explanation,
        ...stage.choices,
      ]) {
        assert.ok(content.en.length > 5);
        assert.match(content.zh, /[\u3400-\u9fff]/);
      }
      assert.ok(stage.choices[stage.correct]);
      for (const algorithm of stage.algorithms) {
        const initial = practiceSetup(lesson!.puzzle, algorithm);
        assert.equal(
          practiceSolved(initial),
          false,
          `${puzzle}:${stage.id}:${algorithm}`,
        );
        assert.equal(practiceSolved(practiceApply(initial, algorithm)), true);
      }
    }
  }
});
test("placement contracts refuse forged scores, unsupported input modes, missing choices and unbounded move submissions", () => {
  for (const value of [
    { kind: "submit", version: 0, optionId: "a", moves: [], passed: true },
    { kind: "submit", version: 0, optionId: "a", moves: Array(301).fill("R") },
    { kind: "submit", version: 0, moves: [] },
    { kind: "skip", version: 0, score: 3 },
    { kind: "skip", version: -1 },
  ])
    assert.equal(AssessmentAnswer.safeParse(value).success, false);
  assert.equal(
    StartAssessment.safeParse({ puzzle: "3x3", input: "smart" }).success,
    false,
  );
  assert.equal(StartAssessment.safeParse({ puzzle: "5x5" }).success, false);
});
