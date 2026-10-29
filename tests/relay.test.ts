import { test } from "node:test";
import assert from "node:assert/strict";
import { relayProgress } from "@cubers/core";
const roster = [
  "private-first-account",
  "private-second-account",
  "private-third-account",
];
test("relay progress identifies only the viewer's own numbered leg and exact verified subtotal", () => {
  const result = relayProgress(
    { status: "ACTIVE", roster, round: 1 },
    [
      { userId: roster[0], status: "APPROVED", durationMs: 3456 },
      { userId: roster[1], status: "INSPECTION", durationMs: null },
    ],
    roster[1],
  );
  assert.deepEqual(
    result.legs.map((l) => [l.number, l.yours, l.state]),
    [
      [1, false, "complete"],
      [2, true, "solving"],
      [3, false, "waiting"],
    ],
  );
  assert.equal(result.completed, 1);
  assert.equal(result.solveTotalMs, 3456);
  assert.equal(result.status, "active");
  for (const id of roster)
    assert.equal(JSON.stringify(result).includes(id), false);
});
test("relay team completion requires every verified leg; interruption keeps only completed private solve time", () => {
  const attempts = roster.map((userId, index) => ({
    userId,
    status: "APPROVED",
    durationMs: 1000 + index,
  }));
  assert.equal(
    relayProgress({ status: "FINISHED", roster, round: 3 }, attempts, roster[0])
      .solveTotalMs,
    3003,
  );
  assert.equal(
    relayProgress({ status: "FINISHED", roster, round: 3 }, attempts, roster[0])
      .status,
    "complete",
  );
  const stopped = relayProgress(
    { status: "CLOSED", roster, round: 1 },
    [
      attempts[0],
      { userId: roster[1], status: "INTERRUPTED", durationMs: 9999 },
    ],
    roster[2],
  );
  assert.equal(stopped.status, "interrupted");
  assert.equal(stopped.solveTotalMs, 1000);
  assert.equal(stopped.completed, 1);
  assert.equal(stopped.legs[1].durationMs, null);
});
test("an open relay lists its pending order without granting a ready turn or result", () => {
  const p = relayProgress({ status: "OPEN", roster, round: 0 }, [], roster[0]);
  assert.equal(p.status, "waiting");
  assert.ok(p.legs.every((l) => l.state === "waiting"));
  assert.equal(p.completed, 0);
});
