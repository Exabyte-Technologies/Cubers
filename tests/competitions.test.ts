import { test } from "node:test";
import assert from "node:assert/strict";
import {
  competitionScore,
  CompetitionDefinition,
  type CompetitionSlot,
} from "@cubers/core";
const ok = (durationMs: number): CompetitionSlot => ({
  status: "APPROVED",
  durationMs,
});
const dnf: CompetitionSlot = { status: "DNF" };
test("competition scoring keeps exact thirds, trims extremes and handles pending/DNF/DNS", () => {
  assert.deepEqual(competitionScore("MEAN3", [ok(1000), ok(1001), ok(1001)]), {
    status: "SCORED",
    units: 3002,
    bestMs: 1000,
  });
  assert.equal(
    competitionScore("AVERAGE5", [
      ok(1000),
      ok(2000),
      ok(3000),
      ok(4000),
      ok(5000),
    ]).units,
    9000,
  );
  assert.equal(
    competitionScore("AVERAGE5", [ok(1000), ok(2000), ok(3000), ok(4000), dnf])
      .units,
    9000,
  );
  assert.equal(
    competitionScore("AVERAGE5", [ok(1000), ok(2000), ok(3000), dnf, dnf])
      .status,
    "DNF",
  );
  assert.equal(
    competitionScore("BEST3", [ok(1000), dnf, { status: "DNS" }]).units,
    3000,
  );
  assert.equal(
    competitionScore("BEST3", [ok(1000), dnf, { status: "PENDING" }]).status,
    "PENDING",
  );
  assert.equal(
    competitionScore("MEAN3", [ok(1000), ok(2000), dnf]).status,
    "DNF",
  );
  assert.throws(() => competitionScore("BEST1", [ok(1)]));
  assert.throws(() => competitionScore("BEST1", [ok(1000), ok(1001)]));
});
test("competition schedules reject overlapping, oversized and out-of-order rounds", () => {
  const title = { en: "Round", zh: "轮次" },
    start = "2026-10-17T10:00:00.000Z";
  const value = {
    title,
    description: title,
    puzzle: "3x3",
    input: "virtual",
    ranked: false,
    capacity: 100,
    registrationOpensAt: "2026-10-17T08:00:00.000Z",
    registrationClosesAt: "2026-10-17T09:00:00.000Z",
    rounds: [
      {
        title,
        format: "BEST1",
        opensAt: start,
        closesAt: "2026-10-17T11:00:00.000Z",
      },
    ],
  };
  assert.equal(CompetitionDefinition.safeParse(value).success, true);
  assert.equal(
    CompetitionDefinition.safeParse({ ...value, capacity: 101 }).success,
    false,
  );
  assert.equal(
    CompetitionDefinition.safeParse({
      ...value,
      rounds: [...value.rounds, ...value.rounds],
    }).success,
    false,
  );
  assert.equal(
    CompetitionDefinition.safeParse({
      ...value,
      rounds: [{ ...value.rounds[0], closesAt: start }],
    }).success,
    false,
  );
});

test("smart competition drafts are 3x3 only and category labels distinguish tracked cubes from scans", async () => {
  const { competitionInputLabel } = await import("@cubers/core"),
    title = { en: "Smart competition", zh: "智能魔方比赛" },
    definition = {
      title,
      description: title,
      puzzle: "3x3",
      input: "smart",
      ranked: true,
      capacity: 100,
      registrationOpensAt: "2026-10-20T08:00:00.000Z",
      registrationClosesAt: "2026-10-20T09:00:00.000Z",
      rounds: [
        {
          title,
          format: "BEST1",
          opensAt: "2026-10-20T10:00:00.000Z",
          closesAt: "2026-10-20T11:00:00.000Z",
        },
      ],
    };
  assert.equal(CompetitionDefinition.safeParse(definition).success, true);
  for (const puzzle of ["2x2", "4x4", "pyraminx"])
    assert.equal(
      CompetitionDefinition.safeParse({ ...definition, puzzle }).success,
      false,
    );
  assert.equal(competitionInputLabel("smart", "en"), "Smart cube");
  assert.equal(competitionInputLabel("smart", "zh"), "智能魔方");
  assert.notEqual(
    competitionInputLabel("scan", "en"),
    competitionInputLabel("smart", "en"),
  );
});
