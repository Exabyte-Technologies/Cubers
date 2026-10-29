import { test } from "node:test";
import assert from "node:assert/strict";
import { planFirstSolve } from "../apps/api/src/first-solve-planner";
import { planFourFirstSolve } from "../apps/api/src/four-first-solve-planner";
import { planPyraminxFirstSolve } from "../apps/api/src/pyraminx-first-solve-planner";
import {
  serviceError,
  LessonStageAdvice,
  facelets,
  SmartCubeFrame,
  SMART_FIRST_SOLVE_REFERENCE,
  lessons,
  LESSON_STAGES,
  lessonStageSetup,
  lessonStageAdvice,
  lessonStageComplete,
  scopedLessonPlan,
  scopedLessonStart,
  prepareGuidedState,
  guidedState,
  guidedFacelets,
  guidedGoal,
  practiceApply,
  practiceSolved,
  solvedPuzzle,
  isPyraminx,
  OfflineGuidedSnapshot,
  openOfflineGuidance,
  type PracticeState,
  type GuidedSolvePlan,
} from "@cubers/core";
import { moveGridRows } from "../apps/mobile/src/move-grid";
import { guidedMoveText } from "../apps/mobile/src/guided-move-text";

const solve = (state: PracticeState): GuidedSolvePlan =>
  isPyraminx(state)
    ? planPyraminxFirstSolve(state)
    : state.size === 4
      ? planFourFirstSolve(state)
      : planFirstSolve(state);

test("move grids use six cells, inverse pairs and separate self-inverse half turns", () => {
  const turns = ["R", "U", "F", "L", "D", "B"].flatMap((f) => [
    f,
    f + "'",
    f + "2",
  ]);
  const rows = moveGridRows(turns);
  assert.deepEqual(rows, [
    ["R", "R'", "U", "U'", "F", "F'"],
    ["L", "L'", "D", "D'", "B", "B'"],
    ["R2", "U2", "F2", "L2", "D2", "B2"],
  ]);
  assert.equal(new Set(rows.flat()).size, turns.length);
  const pyra = ["U", "L", "R", "B", "u", "l", "r", "b"].flatMap((f) => [
    f,
    f + "'",
  ]);
  assert.deepEqual(new Set(moveGridRows(pyra).flat()), new Set(pyra));
  assert.deepEqual(
    moveGridRows([
      "Rw",
      "Rw'",
      "Uw",
      "Uw'",
      "Fw",
      "Fw'",
      "Rw2",
      "Uw2",
      "Fw2",
    ])[0],
    ["Rw", "Rw'", "Uw", "Uw'", "Fw", "Fw'"],
  );
});

test("every solving-stage lesson has a legal prepared setup with completed prerequisites", () => {
  for (const def of LESSON_STAGES) {
    const { state, setup } = lessonStageSetup(def.id);
    assert.ok(setup.length);
    assert.equal(lessonStageAdvice(state, def.id), null, def.id);
    assert.equal(lessonStageComplete(state, def.id), false, def.id);
    if (def.previous)
      assert.equal(lessonStageComplete(state, def.previous), true, def.id);
    assert.deepEqual(
      guidedFacelets(guidedState(def.puzzle, guidedFacelets(state))),
      guidedFacelets(state),
    );
  }
});

test("a corners lesson refuses an unfinished cross and identifies the actual lesson", () => {
  const cross = lessonStageSetup("3-cross").state;
  assert.deepEqual(lessonStageAdvice(cross, "3-corners"), {
    requestedLessonId: "3-corners",
    actualLessonId: "3-cross",
    reason: "prerequisite",
  });
  const middle = lessonStageSetup("3-middle").state;
  assert.deepEqual(lessonStageAdvice(middle, "3-corners"), {
    requestedLessonId: "3-corners",
    actualLessonId: "3-middle",
    reason: "already-complete",
  });
  assert.equal(
    lessonStageAdvice(prepareGuidedState(solvedPuzzle("3x3")), "3-corners")
      ?.actualLessonId,
    null,
  );
});

test("all prepared plans contain only the requested targets, preserve supplied colors and end at that target", async () => {
  for (const def of LESSON_STAGES) {
    const { state: initial } = lessonStageSetup(def.id);
    const original = JSON.stringify(guidedFacelets(initial));
    const plan = scopedLessonPlan(solve(initial), def.id);
    assert.equal(plan.lessonId, def.id);
    assert.equal(JSON.stringify(guidedFacelets(initial)), original);
    assert.deepEqual(plan.startingFaces, guidedFacelets(initial));
    assert.ok(
      plan.steps.every((s) => def.goals.includes(s.goal)),
      def.id,
    );
    let state = initial;
    const start = scopedLessonStart(state, plan, def.id);
    assert.ok(start < plan.steps.length, def.id);
    for (const step of plan.steps.slice(start)) {
      state = practiceApply(state, step.moves);
      assert.equal(
        guidedGoal(state, step),
        true,
        `${def.id}:${step.goal}:${step.target}`,
      );
    }
    assert.equal(lessonStageComplete(state, def.id), true, def.id);
    const snapshot = OfflineGuidedSnapshot.parse({
      lessonId: def.id,
      sourceId: "11111111-1111-4111-8111-111111111111",
      sourceVersion: 0,
      puzzle: def.puzzle,
      input: "virtual",
      startingStage: start,
      startingFaces: plan.startingFaces,
      steps: plan.steps.slice(start),
    });
    const now = Date.now();
    const offline = await openOfflineGuidance(
      {
        schemaVersion: 1,
        ownerId: "22222222-2222-4222-8222-222222222222",
        region: "INTL",
        downloadedAt: now,
        expiresAt: now + 3600000,
        courseVersion: 1,
        lesson: lessons.find((l) => l.id === def.id),
        guidedPractice: snapshot,
      },
      { pause: async () => {} },
    );
    for (const step of snapshot.steps) {
      for (const move of step.moves) offline.turn(move);
      offline.checkpoint();
    }
    assert.equal(offline.view().completed, true);
    assert.equal(
      OfflineGuidedSnapshot.safeParse({ ...snapshot, lessonId: "3-notation" })
        .success,
      false,
    );
    assert.equal(
      OfflineGuidedSnapshot.safeParse({
        ...snapshot,
        steps: [...snapshot.steps, { ...snapshot.steps.at(-1)! }],
      }).success,
      false,
    );
  }
});

test("real lesson states can complete corners without solving later stages", () => {
  const scrambled = practiceApply(
    prepareGuidedState(solvedPuzzle("3x3")),
    "R U2 F' L D B2 R' U F2".split(" "),
  );
  const complete = solve(scrambled);
  let state = guidedState("3x3", complete.startingFaces);
  state = practiceApply(state, complete.steps[0].moves);
  assert.equal(lessonStageAdvice(state, "3-corners"), null);
  const plan = scopedLessonPlan(solve(state), "3-corners");
  for (const step of plan.steps) state = practiceApply(state, step.moves);
  assert.equal(lessonStageComplete(state, "3-corners"), true);
  assert.equal(practiceSolved(state), false);
  assert.ok(!plan.steps.some((s) => s.goal === "middle"));
});

test("next turn explanations distinguish inverse, half and wide turns in both languages", () => {
  assert.match(guidedMoveText("R'", "en", "3x3"), /counterclockwise/i);
  assert.match(guidedMoveText("Rw2", "en", "4x4"), /180|half/);
  assert.match(guidedMoveText("R", "zh", "3x3"), /右/);
  assert.match(guidedMoveText("u'", "en", "pyraminx"), /tip/);
});

test("smart lesson client sends the selected stage and relays safe prerequisite advice", async () => {
  const { SmartLessonLink } =
    await import("../apps/mobile/src/smart/lesson-link");
  const frame = new SmartCubeFrame(SMART_FIRST_SOLVE_REFERENCE);
  const hardware = frame.toHardwareState(
    lessonStageSetup("3-cross").state as any,
  );
  const advice = {
    requestedLessonId: "3-corners",
    actualLessonId: "3-cross",
    reason: "prerequisite",
  };
  let problem: unknown,
    body: any,
    path = "";
  const error = serviceError(
    409,
    {
      message: "This cube needs an earlier lesson first.",
      lessonStage: advice,
    },
    "zh",
  );
  const link = new SmartLessonLink(
    async (url, request) => {
      path = url;
      body = request;
      throw error;
    },
    {
      lessonId: "3-corners",
      courseVersion: 1,
      guided: true,
      model: "gan-356-i3",
      platform: "ios",
    },
    () => {},
    (_message, detail) => {
      problem = detail;
    },
  );
  link.observe({
    type: "state",
    state: hardware,
    verified: true,
    deviceCounter: 5,
  });
  await assert.rejects(link.start());
  assert.equal(path, "smart-first-solves");
  assert.equal(body.lessonId, "3-corners");
  assert.deepEqual(body.faces, facelets(hardware));
  assert.equal(body.counter, 5);
  assert.deepEqual((problem as any).lessonStage, advice);
  assert.equal(
    LessonStageAdvice.safeParse((problem as any).lessonStage).success,
    true,
  );
  await link.close();
});
