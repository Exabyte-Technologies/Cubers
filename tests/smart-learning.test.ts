import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  lessons,
  practiceSetup,
  practiceApply,
  practiceKey,
  SmartCubeFrame,
  SmartLessonContext,
  SmartLessonAction,
  smartLessonReference,
  smartLessonTurns,
  checkSmartLessonSnapshot,
  facelets,
  applyMoves,
  solvedCube,
  type SmartModel,
  type CubeState,
  type SmartLessonView,
} from "@cubers/core";
import { SmartLessonLink } from "../apps/mobile/src/smart/lesson-link";
function context(model: SmartModel, reference = { up: "U", front: "F" }) {
  return SmartLessonContext.parse({
    model,
    platform: "ios",
    reference,
    epoch: randomUUID(),
    nextSequence: 0,
    counter: model === "gan-356-i3" ? 250 : null,
    recoveryRun: 0,
    lastTime: null,
    independentState: true,
    continuity: model === "gan-356-i3" ? "counter" : "net-state",
  });
}
function batch(ctx: SmartLessonContext, start: CubeState, moves: string[]) {
  const frame = new SmartCubeFrame(ctx.reference),
    hardware = frame.toHardwareState(start);
  return SmartLessonAction.parse({
    action: "turns",
    version: 1,
    epoch: ctx.epoch,
    turns: moves.map((move, i) => ({
      sequence: ctx.nextSequence + i,
      move: frame.toHardwareMove(move),
      receivedAt: 100 + i,
      counter: ctx.counter === null ? null : (ctx.counter + i + 1) & 255,
      recovered: false,
    })),
    faces: facelets(
      applyMoves(
        hardware,
        moves.map((move) => frame.toHardwareMove(move)),
      ),
    ),
    counter: ctx.counter === null ? null : (ctx.counter + moves.length) & 255,
    independentState: true,
  }) as Extract<SmartLessonAction, { action: "turns" }>;
}
test("smart lesson verification maps all 3x3 shorter guides for each model without changing the original setup", () => {
  const examples = lessons.filter(
    (l) => l.puzzle === "3x3" && l.alternatives?.length,
  );
  examples.push(lessons.find((l) => l.id === "3-notation")!);
  for (const lesson of examples)
    for (const model of ["gan-356-i3", "gocube-edge", "giiker-i3s"] as const) {
      const reference = smartLessonReference(lesson),
        ctx = context(model, reference),
        start = practiceSetup(lesson.puzzle, lesson.algorithm) as CubeState,
        moves = (lesson.alternatives?.[0].algorithm || lesson.algorithm).split(
          " ",
        );
      const result = smartLessonTurns(ctx, start, batch(ctx, start, moves));
      assert.deepEqual(result.moves, moves);
      assert.equal(
        practiceKey(result.state),
        practiceKey(practiceApply(start, moves)),
      );
      assert.equal(result.context.nextSequence, moves.length);
      assert.equal(ctx.nextSequence, 0);
      checkSmartLessonSnapshot(
        result.context,
        result.state,
        batch(ctx, start, moves).faces,
        result.context.counter,
      );
    }
});
test("smart teaching references include rotated exercise centers without changing hardware colors", () => {
  for (const algorithm of ["R U R' U'", "z2 R U F", "x y R2 F'", "y2 L U L'"]) {
    const lesson = { puzzle: "3x3" as const, algorithm },
      reference = smartLessonReference(lesson),
      frame = new SmartCubeFrame(reference),
      state = practiceSetup("3x3", algorithm) as CubeState;
    assert.equal(
      practiceKey(frame.toTeachingState(frame.toHardwareState(state))),
      practiceKey(state),
    );
  }
  assert.throws(() => smartLessonReference({ puzzle: "2x2", algorithm: "R" }));
});
test("smart lesson batches reject forged, repeated, missing and excessive recovered turns", () => {
  const start = applyMoves(solvedCube(), "R U F"),
    ctx = context("gan-356-i3"),
    valid = batch(ctx, start, ["U", "R"]),
    original = structuredClone(ctx);
  for (const patch of [
    { turns: [{ ...valid.turns[0], sequence: 1 }, valid.turns[1]] },
    { turns: [{ ...valid.turns[0], counter: 252 }, valid.turns[1]] },
    { counter: 2 },
    { faces: facelets(solvedCube()) },
  ])
    assert.throws(() => smartLessonTurns(ctx, start, { ...valid, ...patch }));
  assert.throws(() =>
    smartLessonTurns({ ...ctx, lastTime: 1000 }, start, valid),
  );
  const excessive = batch(ctx, start, Array(7).fill("U"));
  excessive.turns = excessive.turns.map((turn) => ({
    ...turn,
    recovered: true,
  }));
  assert.throws(() => smartLessonTurns(ctx, start, excessive));
  excessive.turns[6].recovered = false;
  assert.equal(smartLessonTurns(ctx, start, excessive).context.recoveryRun, 0);
  const net = context("gocube-edge"),
    netBatch = batch(net, start, ["R"]);
  netBatch.turns[0].recovered = true;
  assert.throws(() => smartLessonTurns(net, start, netBatch));
  assert.deepEqual(ctx, original);
  assert.equal(
    SmartLessonAction.safeParse({
      ...valid,
      turns: [{ ...valid.turns[0], move: "R\n" }],
    }).success,
    false,
  );
  assert.equal(
    SmartLessonAction.safeParse({
      ...valid,
      turns: Array(51).fill(valid.turns[0]),
    }).success,
    false,
  );
  assert.equal(
    SmartLessonContext.safeParse({ ...ctx, address: "AA:BB:CC:DD:EE:FF" })
      .success,
    false,
  );
});
function linkFixture() {
  const start = practiceSetup("3x3", "R U R' U'") as CubeState,
    ctx = context("gan-356-i3");
  let row: SmartLessonView = {
    id: randomUUID(),
    lessonId: "3-notation",
    puzzle: "3x3",
    input: "smart",
    version: 0,
    status: "PREPARING",
    algorithm: "R U R' U'",
    guideId: null,
    guideAlgorithm: null,
    courseVersion: 1,
    moves: [],
    smart: { ...ctx, counter: null },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    finishedAt: null,
  };
  const calls: any[] = [],
    published: SmartLessonView[] = [],
    errors: string[] = [];
  let current = clone(start);
  function clone(state: CubeState) {
    return applyMoves(state, []);
  }
  const api = async (path: string, body?: any) => {
    calls.push({ path, body: body ? structuredClone(body) : undefined });
    if (path.includes("/smart-sessions") || !body) return structuredClone(row);
    const request = SmartLessonAction.parse(body);
    assert.equal(request.version, row.version);
    assert.equal(request.epoch, row.smart.epoch);
    if (request.action === "confirm") {
      row = {
        ...row,
        status: "PRACTICING",
        smart: { ...row.smart, counter: request.counter },
      };
      checkSmartLessonSnapshot(
        row.smart,
        current,
        request.faces,
        request.counter,
      );
    }
    if (request.action === "turns") {
      const result = smartLessonTurns(row.smart, current, request);
      row = {
        ...row,
        smart: result.context,
        moves: [...row.moves, ...result.moves],
      };
      current = result.state;
    }
    if (request.action === "interrupt") row = { ...row, status: "INTERRUPTED" };
    if (request.action === "finish") row = { ...row, status: "COMPLETED" };
    row = { ...row, version: row.version + 1 };
    return structuredClone(row);
  };
  const link = new SmartLessonLink(
    api as any,
    {
      lessonId: row.lessonId,
      courseVersion: 1,
      model: ctx.model,
      platform: "ios",
    },
    (r) => published.push(r),
    (e) => errors.push(e),
  );
  link.observe({
    type: "state",
    state: start,
    verified: true,
    deviceCounter: 250,
  });
  return {
    link,
    api,
    start,
    calls,
    published,
    errors,
    get row() {
      return row;
    },
  };
}
test("native lesson bridge sends bounded correct prefixes and preserves hardware counter wrap", async () => {
  const f = linkFixture();
  await f.link.start();
  try {
    let state = f.start;
    for (let i = 0; i < 70; i++) {
      state = applyMoves(state, ["U"]);
      f.link.observe({
        type: "move",
        sequence: i,
        receivedAt: 100 + i,
        integrity: "counter",
        move: { move: "U", deviceCounter: (251 + i) & 255 },
      });
    }
    f.link.observe({
      type: "state",
      state,
      verified: true,
      deviceCounter: (250 + 70) & 255,
    });
    await f.link.flush(true);
    const sent = f.calls.filter((c) => c.body?.action === "turns");
    assert.deepEqual(
      sent.map((c) => c.body.turns.length),
      [50, 20],
    );
    assert.deepEqual(
      sent.map((c) => c.body.independentState),
      [false, true],
    );
    assert.equal(f.row.smart.nextSequence, 70);
    assert.equal(f.row.smart.counter, 64);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.link.close();
  }
  assert.equal(f.row.status, "INTERRUPTED");
});
test("native lesson bridge closes a delayed creation without publishing into an abandoned view", async () => {
  const f = linkFixture();
  let release!: (row: SmartLessonView) => void;
  const creation = new Promise<SmartLessonView>((resolve) => {
    release = resolve;
  });
  const link = new SmartLessonLink(
    (async (path: string, body?: any) =>
      path.includes("/smart-sessions") ? creation : f.api(path, body)) as any,
    {
      lessonId: "3-notation",
      courseVersion: 1,
      model: "gan-356-i3",
      platform: "ios",
    },
    (r) => f.published.push(r),
    (e) => f.errors.push(e),
  );
  link.observe({
    type: "state",
    state: f.start,
    verified: true,
    deviceCounter: 250,
  });
  const started = link.start();
  const closed = link.close();
  release(f.row);
  await assert.rejects(started);
  await closed;
  assert.equal(f.published.length, 0);
  assert.equal(f.row.status, "INTERRUPTED");
});
test("native lesson bridge stops on sequence gaps and never uploads later turns to the old epoch", async () => {
  const f = linkFixture();
  await f.link.start();
  f.link.observe({
    type: "move",
    sequence: 1,
    receivedAt: 1,
    integrity: "counter",
    move: { move: "R", deviceCounter: 251 },
  });
  await f.link.close();
  f.link.observe({
    type: "move",
    sequence: 0,
    receivedAt: 2,
    integrity: "counter",
    move: { move: "R", deviceCounter: 251 },
  });
  await f.link.flush(true);
  assert.equal(f.errors.length, 1);
  assert.equal(f.row.status, "INTERRUPTED");
  assert.equal(f.calls.filter((c) => c.body?.action === "turns").length, 0);
});
