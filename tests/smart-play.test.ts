import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  SmartAttemptContext,
  SmartAttemptBind,
  SmartAttemptBatch,
  SmartLessonContext,
  smartAttemptTurns,
  solvedCube,
  applyMoves,
  facelets,
  smartDeviceCatalogue,
  type SmartAttemptView,
} from "@cubers/core";
import { SmartAttemptLink } from "../apps/mobile/src/smart/attempt-link";
const context = () =>
  SmartAttemptContext.parse({
    model: "gan-356-i3",
    platform: "ios",
    reference: { up: "U", front: "F" },
    epoch: randomUUID(),
    nextSequence: 0,
    counter: 250,
    recoveryRun: 0,
    lastTime: null,
    independentState: true,
    continuity: "counter",
  });
test("smart game contracts require bounded physical context and keep hardware/play activation off", () => {
  const b = {
    nonce: "attempt-nonce",
    version: 0,
    model: "gan-356-i3",
    platform: "ios",
    faces: facelets(solvedCube()),
    counter: 250,
  };
  assert.equal(SmartAttemptBind.safeParse(b).success, true);
  for (const patch of [
    { address: "AA:BB:CC:DD:EE:FF" },
    { reference: { up: "D", front: "F" } },
    { faces: undefined },
    { counter: 256 },
  ])
    assert.equal(SmartAttemptBind.safeParse({ ...b, ...patch }).success, false);
  assert.equal(
    SmartAttemptContext.safeParse({ ...context(), nextSequence: 10000 })
      .success,
    true,
  );
  assert.equal(
    SmartAttemptContext.safeParse({ ...context(), nextSequence: 10001 })
      .success,
    false,
  );
  assert.equal(
    SmartLessonContext.safeParse({ ...context(), nextSequence: 2001 }).success,
    false,
  );
  assert.ok(
    smartDeviceCatalogue().every(
      (row) =>
        !row.enabled &&
        !row.physicallyTested &&
        !row.playEnabled &&
        !row.playPlatforms.length,
    ),
  );
});
test("smart game accounting preserves hardware counter wrap and its independent-state requirement at the 10000-turn bound", () => {
  const ctx = { ...context(), nextSequence: 9998, counter: 254 },
    start = applyMoves(solvedCube(), "R U F"),
    end = applyMoves(start, "R U"),
    request = SmartAttemptBatch.parse({
      action: "turns",
      nonce: "attempt-nonce",
      version: 9,
      epoch: ctx.epoch,
      turns: [
        {
          sequence: 9998,
          move: "R",
          counter: 255,
          receivedAt: 1,
          recovered: false,
        },
        {
          sequence: 9999,
          move: "U",
          counter: 0,
          receivedAt: 2,
          recovered: false,
        },
      ],
      faces: facelets(end),
      counter: 0,
      independentState: false,
    }),
    result = smartAttemptTurns(ctx, start, request);
  assert.equal(result.context.nextSequence, 10000);
  assert.equal(result.context.counter, 0);
  assert.equal(result.context.independentState, false);
  assert.equal(
    SmartAttemptBatch.safeParse({
      ...request,
      turns: [{ ...request.turns[1], sequence: 10000 }],
    }).success,
    false,
  );
  assert.deepEqual(
    facelets(start),
    facelets(applyMoves(solvedCube(), "R U F")),
  );
});
test("closing a delayed smart game binding interrupts only its exact committed epoch and publishes no stale state", async () => {
  let release!: (value: SmartAttemptView) => void;
  const waiting = new Promise<SmartAttemptView>((r) => {
      release = r;
    }),
    ctx = context(),
    row: SmartAttemptView = {
      id: randomUUID(),
      nonce: "attempt-nonce",
      version: 0,
      status: "CREATED",
      smart: null,
      scramble: ["R"],
      moves: [],
      recordingAt: null,
      inspectionAt: null,
      startedAt: null,
      durationMs: null,
    },
    calls: string[] = [],
    published: SmartAttemptView[] = [];
  const api = async <T = any>(path: string, body?: any): Promise<T> => {
    calls.push(path);
    if (path.endsWith("/bind")) return waiting as Promise<T>;
    if (path.endsWith("/interrupt")) {
      row.status = "INTERRUPTED";
      return {} as T;
    }
    return structuredClone(row) as T;
  };
  const link = new SmartAttemptLink(
    api,
    { id: row.id, model: "gan-356-i3", platform: "ios" },
    (value) => published.push(value),
    () => {},
  );
  link.observe({
    type: "state",
    state: applyMoves(solvedCube(), ["R"]),
    verified: false,
    deviceCounter: 250,
  });
  const binding = link.bind();
  await new Promise((r) => setImmediate(r));
  const closing = link.close();
  row.smart = ctx;
  row.version = 1;
  release(structuredClone(row));
  await assert.rejects(binding);
  await closing;
  assert.equal(published.length, 0);
  assert.equal(row.status, "INTERRUPTED");
  assert.equal(calls.filter((path) => path.endsWith("/interrupt")).length, 1);
});

test("native smart game bridge sends exact bounded prefixes and marks only the independently checked tail", async () => {
  let row: SmartAttemptView = {
      id: randomUUID(),
      nonce: "attempt-nonce",
      version: 0,
      status: "CREATED",
      smart: null,
      scramble: [],
      moves: [],
      recordingAt: null,
      inspectionAt: null,
      startedAt: null,
      durationMs: null,
    },
    hardware = solvedCube(),
    expected = solvedCube();
  const batches: SmartAttemptBatch[] = [];
  const api = async <T = any>(path: string, body?: any): Promise<T> => {
    if (!body) return structuredClone(row) as T;
    if (path.endsWith("/bind"))
      row = { ...row, smart: context(), version: row.version + 1 };
    else if (path.endsWith("/turns")) {
      const request = SmartAttemptBatch.parse(body);
      assert.equal(request.version, row.version);
      assert.equal(request.epoch, row.smart!.epoch);
      batches.push(request);
      const result = smartAttemptTurns(row.smart!, expected, request);
      expected = result.state;
      row = {
        ...row,
        smart: result.context,
        version: row.version + 1,
        moves: [
          ...row.moves,
          ...result.moves.map((move, i) => ({
            move,
            sequence: row.moves.length + i,
            elapsedMs: i,
          })),
        ],
      };
    } else if (path.endsWith("/inspect"))
      row = { ...row, status: "INSPECTION", version: row.version + 1 };
    else if (path.endsWith("/start"))
      row = { ...row, status: "SOLVING", version: row.version + 1 };
    else if (path.endsWith("/interrupt"))
      row = { ...row, status: "INTERRUPTED", version: row.version + 1 };
    return structuredClone(row) as T;
  };
  const link = new SmartAttemptLink(
    api,
    { id: row.id, model: "gan-356-i3", platform: "ios" },
    () => {},
    (message) => {
      throw Error(message);
    },
  );
  link.observe({
    type: "state",
    state: hardware,
    verified: false,
    deviceCounter: 250,
  });
  try {
    await link.bind();
    link.observe({
      type: "state",
      state: hardware,
      verified: true,
      deviceCounter: 250,
    });
    await link.inspect();
    await link.start();
    for (let n = 0; n < 52; n++) {
      const move = n % 2 ? "R'" : "R";
      hardware = applyMoves(hardware, [move]);
      link.observe({
        type: "move",
        sequence: n,
        receivedAt: 100 + n,
        integrity: "counter",
        move: { move, deviceCounter: (251 + n) & 255 },
      });
      link.observe({
        type: "state",
        state: hardware,
        verified: n === 51,
        deviceCounter: (251 + n) & 255,
      });
    }
    await link.flush(true);
    const received = batches.filter((b) => b.turns.length);
    assert.deepEqual(
      received.map((b) => b.turns.length),
      [50, 2],
    );
    assert.deepEqual(
      received.map((b) => b.independentState),
      [false, true],
    );
    assert.equal(row.smart!.nextSequence, 52);
    assert.equal(row.smart!.counter, 46);
    assert.equal(row.moves.length, 52);
    assert.deepEqual(facelets(expected), facelets(hardware));
  } finally {
    await link.close();
  }
});
