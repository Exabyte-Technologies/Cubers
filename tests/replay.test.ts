import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatedReplay,
  ReplayTimeline,
  ReplayPacket,
  practiceApply,
  practiceKey,
  practiceSolved,
  solvedPuzzle,
  inverse,
  pyraminxInverse,
  type Puzzle,
} from "@cubers/core";
function source(puzzle: Puzzle, scramble: string[]) {
  const moves =
    puzzle === "pyraminx" ? pyraminxInverse(scramble) : inverse(scramble);
  return {
    attemptId: "10000000-0000-4000-8000-000000000001",
    puzzle,
    input: "virtual" as const,
    mode: "race" as const,
    durationMs: 10000,
    createdAt: "2026-10-17T00:00:00Z",
    scramble,
    events: moves.map((move, sequence) => ({
      move,
      sequence,
      elapsedMs: sequence * 100,
    })),
  };
}
test("saved virtual replays reconstruct all four puzzles, wide turns, tips and rotations", async () => {
  for (const [puzzle, scramble] of [
    ["2x2", ["R", "U2", "F'", "x"]],
    ["3x3", ["R", "M2", "U", "S'", "x"]],
    ["4x4", ["Rw", "U2", "Fw'", "x", "D"]],
    ["pyraminx", ["R", "u", "B", "l'"]],
  ] as [Puzzle, string[]][]) {
    const packet = validatedReplay(source(puzzle, scramble));
    assert.equal("events" in packet, false);
    const timeline = await ReplayTimeline.create(packet, async () => {});
    const initial = practiceApply(solvedPuzzle(puzzle), scramble);
    for (let i = 0; i <= packet.moves.length; i++)
      assert.equal(
        practiceKey(timeline.stateAt(i)),
        practiceKey(practiceApply(initial, packet.moves.slice(0, i))),
      );
    assert.equal(practiceSolved(timeline.stateAt(packet.moves.length)), true);
    assert.equal(practiceKey(timeline.stateAt(0)), practiceKey(initial));
  }
});
test("replays reject missing, replayed, out-of-order, future, foreign-puzzle and unsolved streams", () => {
  const base = source("3x3", ["R", "U"]);
  const invalid = [
    {
      ...base,
      events: base.events.map((e) => ({ ...e, sequence: e.sequence + 1 })),
    },
    { ...base, events: [base.events[0], base.events[0]] },
    {
      ...base,
      events: [
        { ...base.events[0], elapsedMs: 200 },
        { ...base.events[1], elapsedMs: 100 },
      ],
    },
    {
      ...base,
      events: [{ ...base.events[0], elapsedMs: 11001 }, base.events[1]],
    },
    { ...base, events: [{ ...base.events[0], move: "R3" }] },
    { ...base, events: [] },
    { ...base, puzzle: "pyraminx", scramble: ["F"], events: [] },
    { ...base, input: "scan" },
    { ...base, privateEmail: "person@example.test" },
  ];
  for (const value of invalid) assert.throws(() => validatedReplay(value));
  assert.equal(
    ReplayPacket.safeParse({ ...validatedReplay(base), nonce: "secret" })
      .success,
    false,
  );
});
test("long replay seeking stays bounded and deterministic with one hundred checkpoints", async () => {
  const candidate = source("4x4", []);
  candidate.events = Array.from({ length: 10000 }, (_, sequence) => ({
    sequence,
    move: sequence % 2 ? "Rw'" : "Rw",
    elapsedMs: sequence,
  }));
  const packet = validatedReplay(candidate);
  let pauses = 0;
  const timeline = await ReplayTimeline.create(packet, async () => {
    pauses++;
  });
  assert.equal(pauses, 100);
  assert.equal(practiceSolved(timeline.stateAt(10000)), true);
  for (const index of [0, 1, 99, 100, 101, 9987, 9999, 10000])
    assert.equal(
      practiceKey(timeline.stateAt(index)),
      practiceKey(
        practiceApply(solvedPuzzle("4x4"), packet.moves.slice(0, index)),
      ),
    );
  for (const index of [-1, 10001, NaN, 0.5])
    assert.throws(() => timeline.stateAt(index));
  assert.throws(() =>
    validatedReplay({
      ...candidate,
      events: [...candidate.events, candidate.events[0]],
    }),
  );
});
test("client replay building cancels at chunk boundaries and never accepts a non-solved packet", async () => {
  const base = source("3x3", []);
  base.events = Array.from({ length: 200 }, (_, sequence) => ({
    sequence,
    move: sequence % 2 ? "R'" : "R",
    elapsedMs: sequence,
  }));
  const packet = validatedReplay(base);
  let current = true,
    pauses = 0;
  await assert.rejects(
    ReplayTimeline.create(
      packet,
      async () => {
        pauses++;
        current = false;
      },
      () => current,
    ),
    /cancelled/,
  );
  assert.equal(pauses, 1);
  await assert.rejects(
    ReplayTimeline.create({ ...packet, moves: ["R"] }, async () => {}),
    /does not solve/,
  );
  await assert.rejects(
    ReplayTimeline.create(
      packet,
      async () => {},
      () => false,
    ),
    /cancelled/,
  );
});
test("smart replay archives retain all three continuity labels without connection identifiers", async () => {
  for (const model of ["gan-356-i3", "gocube-edge", "giiker-i3s"] as const) {
    const virtual = source("3x3", ["R", "U", "F'"]),
      counted = model === "gan-356-i3",
      smart = {
        model,
        platform: "ios",
        reference: { up: "U", front: "F" },
        epoch: "10000000-0000-4000-8000-000000000002",
        nextSequence: virtual.events.length,
        counter: counted ? 253 : null,
        recoveryRun: 0,
        lastTime: 103,
        independentState: true,
        continuity: counted ? "counter" : "net-state",
      },
      packet = validatedReplay({ ...virtual, input: "smart", smart });
    assert.equal(packet.input, "smart");
    assert.deepEqual((packet as any).telemetry, {
      model,
      continuity: smart.continuity,
    });
    for (const field of [
      "smart",
      "epoch",
      "counter",
      "platform",
      "reference",
      "nonce",
      "events",
    ])
      assert.equal(Object.hasOwn(packet, field), false);
    const timeline = await ReplayTimeline.create(packet, async () => {});
    assert.equal(practiceSolved(timeline.stateAt(packet.moves.length)), true);
  }
});
test("smart replay archives reject inconsistent model, context and injected turn vocabulary", async () => {
  const base = source("3x3", ["R"]),
    smart = {
      model: "gan-356-i3",
      platform: "android",
      reference: { up: "U", front: "F" },
      epoch: "10000000-0000-4000-8000-000000000002",
      nextSequence: 1,
      counter: 251,
      recoveryRun: 0,
      lastTime: 101,
      independentState: true,
      continuity: "counter",
    },
    candidate = { ...base, input: "smart", smart };
  for (const patch of [
    { nextSequence: 0 },
    { recoveryRun: 1 },
    { independentState: false },
    { lastTime: null },
    { counter: null },
    { continuity: "net-state" },
    { reference: { up: "D", front: "F" } },
    { model: "gocube-edge" },
    { epoch: "bad" },
  ])
    assert.throws(() =>
      validatedReplay({ ...candidate, smart: { ...smart, ...patch } }),
    );
  for (const patch of [
    { puzzle: "2x2" },
    { input: "scan" },
    { smart: undefined },
    { events: [] },
    { events: [{ move: "x", sequence: 0, elapsedMs: 0 }] },
    { nonce: "secret" },
  ])
    assert.throws(() => validatedReplay({ ...candidate, ...patch }));
  const packet = validatedReplay(candidate);
  assert.equal(
    ReplayPacket.safeParse({
      ...packet,
      telemetry: { model: "gocube-edge", continuity: "counter" },
    }).success,
    false,
  );
  await assert.rejects(
    ReplayTimeline.create({ ...packet, moves: ["x", "x'"] }, async () => {}),
  );
});
