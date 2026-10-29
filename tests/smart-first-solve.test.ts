import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  SmartGuidedCreate,
  SmartGuidedAction,
  SmartLessonContext,
  SMART_FIRST_SOLVE_REFERENCE,
  SmartCubeFrame,
  smartLessonTurns,
  applyMoves,
  facelets,
  solvedCube,
  practiceKey,
  type SmartConnectionView,
} from "@cubers/core";
import { SmartLessonLink } from "../apps/mobile/src/smart/lesson-link";
import { LessonWork, demonstrateState } from "../apps/mobile/src/lesson-work";
function context(sequence = 0, counter = 250) {
  return SmartLessonContext.parse({
    model: "gan-356-i3",
    platform: "ios",
    reference: SMART_FIRST_SOLVE_REFERENCE,
    epoch: randomUUID(),
    nextSequence: sequence,
    counter,
    recoveryRun: 0,
    lastTime: null,
    independentState: true,
    continuity: "counter",
  });
}
test("smart first-solve contracts require a confirmed device state and keep manual actions unavailable", () => {
  const create = {
    model: "gan-356-i3",
    platform: "ios",
    courseVersion: 2,
    faces: facelets(applyMoves(solvedCube(), "R U")),
    counter: 250,
  };
  assert.equal(SmartGuidedCreate.safeParse(create).success, true);
  for (const patch of [
    { faces: undefined },
    { alternativeId: "shorter-v1" },
    { reference: { up: "U", front: "F" } },
    { address: "AA:BB:CC:DD:EE:FF" },
  ])
    assert.equal(
      SmartGuidedCreate.safeParse({ ...create, ...patch }).success,
      false,
    );
  const base = {
    version: 0,
    epoch: randomUUID(),
    faces: create.faces,
    counter: 250,
  };
  for (const action of ["checkpoint", "replan"])
    assert.equal(
      SmartGuidedAction.safeParse({ ...base, action }).success,
      true,
    );
  for (const action of ["finish", "confirm", "reset"])
    assert.equal(
      SmartGuidedAction.safeParse({ ...base, action }).success,
      false,
    );
  assert.equal(
    SmartLessonContext.safeParse({ ...context(), nextSequence: 2000 }).success,
    true,
  );
  assert.equal(
    SmartLessonContext.safeParse({ ...context(), nextSequence: 2001 }).success,
    false,
  );
});
test("smart first-solve turn accounting crosses counter wrap and reaches the 2000-event bound in its fixed frame", () => {
  const ctx = context(1998, 254),
    frame = new SmartCubeFrame(ctx.reference),
    hardware = applyMoves(solvedCube(), "R U F"),
    start = frame.toTeachingState(hardware);
  const action = SmartGuidedAction.parse({
    action: "turns",
    version: 9,
    epoch: ctx.epoch,
    turns: [
      {
        sequence: 1998,
        move: "R",
        receivedAt: 1,
        counter: 255,
        recovered: false,
      },
      {
        sequence: 1999,
        move: "U",
        receivedAt: 2,
        counter: 0,
        recovered: false,
      },
    ],
    faces: facelets(applyMoves(hardware, ["R", "U"])),
    counter: 0,
    independentState: true,
  });
  if (action.action !== "turns") assert.fail();
  const next = smartLessonTurns(ctx, start, action);
  assert.equal(next.context.nextSequence, 2000);
  assert.equal(next.context.counter, 0);
  assert.equal(
    practiceKey(next.state),
    practiceKey(frame.toTeachingState(applyMoves(hardware, ["R", "U"]))),
  );
  assert.equal(
    SmartGuidedAction.safeParse({
      ...action,
      turns: [{ ...action.turns[1], sequence: 2000 }],
    }).success,
    false,
  );
  assert.deepEqual(next.context.reference, SMART_FIRST_SOLVE_REFERENCE);
});
test("native smart bridge keeps collecting across verified stages and replanning without resetting its epoch", async () => {
  let row: SmartConnectionView = {
      id: randomUUID(),
      version: 0,
      status: "PRACTICING",
      smart: context(),
    },
    hardware = applyMoves(solvedCube(), "R U F");
  const frame = new SmartCubeFrame(row.smart.reference);
  let expected = frame.toTeachingState(hardware),
    checkpoints = 0;
  const calls: any[] = [],
    published: SmartConnectionView[] = [],
    problems: string[] = [];
  const api = async (path: string, body?: any) => {
    calls.push({ path, body: body ? structuredClone(body) : undefined });
    if (!body) return structuredClone(row);
    if (path === "smart-first-solves") {
      SmartGuidedCreate.parse(body);
      return structuredClone(row);
    }
    const request = SmartGuidedAction.parse(body);
    assert.equal(request.version, row.version);
    assert.equal(request.epoch, row.smart.epoch);
    if (request.action === "turns") {
      const result = smartLessonTurns(row.smart, expected, request);
      expected = result.state;
      row = { ...row, smart: result.context };
    }
    if (request.action === "checkpoint")
      row = {
        ...row,
        status: ++checkpoints === 2 ? "COMPLETED" : "PRACTICING",
      };
    if (request.action === "interrupt") row = { ...row, status: "INTERRUPTED" };
    row = { ...row, version: row.version + 1 };
    return structuredClone(row);
  };
  const link = new SmartLessonLink<SmartConnectionView>(
    api as any,
    {
      lessonId: "3-first-solve",
      courseVersion: 2,
      model: "gan-356-i3",
      platform: "ios",
      guided: true,
    },
    (value) => published.push(value),
    (message) => problems.push(message),
  );
  link.observe({
    type: "state",
    state: hardware,
    verified: true,
    deviceCounter: 250,
  });
  const move = async (sequence: number, value: string) => {
    hardware = applyMoves(hardware, [value]);
    link.observe({
      type: "move",
      sequence,
      receivedAt: 10 + sequence,
      integrity: "counter",
      move: { move: value, deviceCounter: (251 + sequence) & 255 },
    });
    link.observe({
      type: "state",
      state: hardware,
      verified: true,
      deviceCounter: (251 + sequence) & 255,
    });
    await link.flush(true);
  };
  try {
    await link.start();
    await move(0, "R");
    await link.finish();
    assert.equal(link.saved!.status, "PRACTICING");
    await move(1, "U");
    const epoch = link.saved!.smart.epoch;
    await link.replan();
    assert.equal(link.saved!.smart.nextSequence, 2);
    assert.equal(link.saved!.smart.epoch, epoch);
    await move(2, "F");
    await link.finish();
    assert.equal(link.saved!.status, "COMPLETED");
    link.observe({
      type: "move",
      sequence: 3,
      receivedAt: 13,
      integrity: "counter",
      move: { move: "L", deviceCounter: 254 },
    });
    await link.flush(true);
    assert.equal(row.smart.nextSequence, 3);
    assert.equal(checkpoints, 2);
    assert.deepEqual(problems, []);
    assert.equal(
      calls.some(
        (call) =>
          call.body?.action === "confirm" || call.body?.action === "finish",
      ),
      false,
    );
    assert.equal(
      calls.filter((call) => call.body?.action === "replan").length,
      1,
    );
    assert.ok(published.length > 3);
  } finally {
    await link.close();
  }
  assert.equal(row.status, "COMPLETED");
});
test("guided previews clone the actual position, stop on interruption and cannot mutate their starting state", async () => {
  const initial = applyMoves(solvedCube(), "R U F"),
    original = practiceKey(initial),
    work = new LessonWork();
  work.focus(true);
  work.activate(true);
  const task = work.begin()!;
  let count = 0;
  await demonstrateState(
    initial,
    ["F'", "U'", "R'"],
    task,
    (frame) => {
      count++;
      if (count === 1) frame.state.stickers.splice(0);
      else {
        assert.equal(frame.state.stickers.length, 54);
        work.focus(false);
      }
    },
    true,
  );
  assert.equal(count, 2);
  assert.equal(practiceKey(initial), original);
  assert.equal(task.finish(), false);
});
