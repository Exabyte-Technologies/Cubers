import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionStatistics,
  StatisticsQuery,
  type SessionSolve,
} from "@cubers/core";
const solve = (
  id: string,
  start: string,
  durationMs = 10000,
  input: SessionSolve["input"] = "virtual",
  puzzle: SessionSolve["puzzle"] = "3x3",
): SessionSolve => ({
  id,
  puzzle,
  input,
  durationMs,
  startedAt: start,
  createdAt: start,
  finishedAt: new Date(Date.parse(start) + durationMs).toISOString(),
});
test("session grouping uses the prior end, preserves midnight sessions and separates a gap over thirty minutes", () => {
  const data = sessionStatistics(
    [
      solve("a", "2026-10-16T15:59:50Z"),
      solve("b", "2026-10-16T16:01:00Z", 10000, "scan"),
      solve("c", "2026-10-16T16:31:10Z"), // Exactly thirty minutes since b ended.
      solve("d", "2026-10-16T17:01:20.001Z"),
    ].reverse(),
    "Asia/Shanghai",
  );
  assert.deepEqual(
    data.sessions.map((s) => s.solves),
    [1, 3],
  );
  assert.deepEqual(
    data.days.map((d) => [d.day, d.solves]),
    [
      ["2026-10-17", 3],
      ["2026-10-16", 1],
    ],
  );
  assert.equal(
    data.sessions[1].categories.find((c) => c.input === "scan")?.solves,
    1,
  );
  assert.equal(data.sessions[1].solvingMs, 30000);
  assert.equal(data.sessions[1].spanMs, 1890000);
});
test("daily statistics follow named time zones across daylight-saving changes", () => {
  const rows = [
    solve("a", "2026-11-01T05:50:00Z"),
    solve("b", "2026-11-01T06:10:00Z"),
    solve("c", "2026-11-02T04:50:00Z"),
  ];
  const ny = sessionStatistics(rows, "America/New_York"),
    utc = sessionStatistics(rows, "UTC");
  assert.deepEqual(
    ny.sessions.map((s) => s.solves),
    [1, 2],
  );
  assert.deepEqual(
    ny.days.map((d) => [d.day, d.solves]),
    [["2026-11-01", 3]],
  );
  assert.deepEqual(
    utc.days.map((d) => [d.day, d.solves]),
    [
      ["2026-11-02", 1],
      ["2026-11-01", 2],
    ],
  );
});
test("session categories preserve puzzle and input boundaries and mark legacy timestamp estimates", () => {
  const a = solve("a", "2026-10-01T12:00:00Z", 1000),
    b = solve("b", "2026-10-01T12:01:00Z", 3000),
    c = solve("c", "2026-10-01T12:02:00Z", 500, "scan"),
    d = solve("d", "2026-10-01T12:03:00Z", 800, "virtual", "2x2");
  b.startedAt = null;
  b.finishedAt = null;
  const result = sessionStatistics([d, c, b, a], "UTC", true);
  assert.equal(result.window.estimatedStarts, 1);
  assert.equal(result.sessions[0].mayIncludeEarlierSolves, true);
  assert.equal(result.sessions[0].categories.length, 3);
  const virtual = result.sessions[0].categories.find(
    (c) => c.puzzle === "3x3" && c.input === "virtual",
  )!;
  assert.deepEqual(virtual, {
    puzzle: "3x3",
    input: "virtual",
    solves: 2,
    bestMs: 1000,
    meanMs: 2000,
    solvingMs: 4000,
  });
  assert.equal("id" in result.sessions[0], false);
  assert.equal("moves" in virtual, false);
});
test("statistics cap returned sessions and days, disclose omitted history and reject oversized inputs", () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    solve(String(i), new Date(Date.UTC(2026, 0, i + 1)).toISOString()),
  );
  const data = sessionStatistics(rows, "UTC", true);
  assert.equal(data.sessions.length, 30);
  assert.equal(data.omittedSessions, 10);
  assert.equal(data.days.length, 30);
  assert.equal(data.omittedDays, 10);
  assert.equal(data.window.hasEarlier, true);
  assert.throws(() => sessionStatistics(Array(1001).fill(rows[0]), "UTC"));
  assert.equal(sessionStatistics([], "UTC").sessions.length, 0);
});
test("statistics reject invalid zones, unknown query fields and invalid trusted records", () => {
  for (const timeZone of [
    "Mars/City",
    "../UTC",
    "+08:00",
    "x".repeat(65),
    "UTC?user=other",
  ])
    assert.equal(StatisticsQuery.safeParse({ timeZone }).success, false);
  assert.equal(
    StatisticsQuery.safeParse({ timeZone: "UTC", userId: "other" }).success,
    false,
  );
  assert.equal(StatisticsQuery.parse({}).timeZone, "UTC");
  const row = solve("a", "2026-10-01T12:00:00Z");
  for (const durationMs of [0, -1, NaN, 3600001, 1.5])
    assert.throws(() => sessionStatistics([{ ...row, durationMs }], "UTC"));
  assert.throws(() => sessionStatistics([{ ...row, startedAt: "bad" }], "UTC"));
});
