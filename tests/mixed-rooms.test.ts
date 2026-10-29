import { test } from "node:test";
import assert from "node:assert/strict";
import { CreateRoom, playInput, SmartAttemptContext } from "@cubers/core";
import {
  attemptInputWhere,
  exactAttemptTurns,
} from "../apps/api/src/attempt-input";
test("mixed room contracts keep actual inputs and reject ranked category laundering", () => {
  const room = { puzzle: "3x3", input: "virtual", mode: "race", ranked: false };
  assert.equal(CreateRoom.parse(room).mixed, false);
  assert.equal(CreateRoom.parse({ ...room, mixed: true }).mixed, true);
  assert.equal(
    CreateRoom.safeParse({ ...room, mixed: true, ranked: true }).success,
    false,
  );
  assert.equal(
    CreateRoom.safeParse({ ...room, input: "mixed" }).success,
    false,
  );
  assert.equal(playInput({ ...room, mixed: true }, "scan"), "scan");
  assert.equal(playInput(room, "scan"), "virtual");
  assert.throws(() => playInput({ ...room, mixed: true }, null));
  assert.deepEqual(attemptInputWhere("scan"), {
    OR: [
      { input: "scan", room: { mixed: true } },
      { input: null, room: { input: "scan", mixed: false } },
    ],
  });
});
test("turn statistics require counted smart continuity and never infer turns from scans", () => {
  const room = { input: "virtual", mixed: true };
  const base = { room, input: "virtual", smart: null };
  assert.equal(exactAttemptTurns(base), true);
  assert.equal(exactAttemptTurns({ ...base, input: "scan" }), false);
  assert.equal(exactAttemptTurns({ ...base, input: "smart" }), false);
  const smart = SmartAttemptContext.parse({
    model: "gan-356-i3",
    platform: "ios",
    reference: { up: "U", front: "F" },
    epoch: "8de9c2fe-d275-4efe-9aae-f66f09c8c40b",
    nextSequence: 2,
    counter: 252,
    recoveryRun: 0,
    lastTime: 102,
    independentState: true,
    continuity: "counter",
  });
  assert.equal(exactAttemptTurns({ ...base, input: "smart", smart }), true);
  assert.equal(
    exactAttemptTurns({
      ...base,
      input: "smart",
      smart: {
        ...smart,
        model: "gocube-edge",
        counter: null,
        continuity: "net-state",
      },
    }),
    false,
  );
});
