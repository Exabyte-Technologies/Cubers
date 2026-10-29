import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backlogCheck,
  operationalState,
  jobCheck,
} from "../apps/api/src/operations";
import { OperationalAlerts } from "../apps/api/src/operational-alerts";
import { OperationalSnapshot } from "@cubers/core";
import { OperationalTelemetry } from "../apps/api/src/operational-telemetry";
import type Redis from "ioredis";

const now = Date.parse("2026-10-21T05:00:00Z");
test("telemetry cannot hold a completed email or job indefinitely and never retries it", async () => {
  let calls = 0,
    finish!: () => void;
  const redis = {
    eval: () => {
      calls++;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
  };
  const telemetry = new OperationalTelemetry(redis as unknown as Redis, "INTL");
  const began = Date.now();
  await telemetry.safely("smtp", true);
  assert.ok(Date.now() - began < 2000);
  assert.equal(calls, 1);
  finish();
  await Promise.resolve();
  const failed = new OperationalTelemetry(
    {
      eval: async () => {
        throw Error("private transport detail");
      },
    } as unknown as Redis,
    "INTL",
  );
  await failed.safely("maintenance", false);
});
test("operational backlog thresholds distinguish due retries from overdue erasure", () => {
  const check = (
    signal: "object-erasure" | "evidence-retention" | "posts",
    seconds: number,
    count = 1n,
  ) =>
    backlogCheck(
      { signal, count, oldestAt: new Date(now - seconds * 1000) },
      now,
    );
  assert.equal(check("object-erasure", 299).state, "ok");
  assert.equal(check("object-erasure", 300).state, "critical");
  assert.equal(check("evidence-retention", 119).state, "ok");
  assert.equal(check("evidence-retention", 120).state, "critical");
  assert.equal(check("posts", 172800).state, "warning");
  assert.equal(check("posts", 180000, 0n).state, "ok");
});
test("job observations distinguish missing success, stale success, failure and recovery", () => {
  assert.equal(jobCheck("maintenance", {}, now).state, "unknown");
  assert.equal(
    jobCheck(
      "maintenance",
      { success: String(now - 180000), state: "success" },
      now,
    ).state,
    "critical",
  );
  assert.equal(
    jobCheck("media", { failure: String(now), state: "failure" }, now).state,
    "warning",
  );
  assert.equal(
    jobCheck(
      "maintenance",
      { success: String(now), failure: String(now - 1000), state: "success" },
      now,
    ).state,
    "ok",
  );
  assert.equal(jobCheck("smtp", {}, now).state, "unknown");
  assert.equal(
    jobCheck("smtp", { success: String(now - 86400000), state: "success" }, now)
      .state,
    "ok",
  );
  assert.equal(
    jobCheck("maintenance", { success: String(now + 6000) }, now).state,
    "unknown",
  );
});
test("unknown checks cannot create a healthy overall result", () => {
  const check = (state: "ok" | "unknown" | "warning" | "critical") => ({
    signal: "database" as const,
    state,
    count: null,
    oldestAt: null,
    thresholdSeconds: null,
  });
  assert.equal(operationalState([check("ok"), check("unknown")]), "unknown");
  assert.equal(
    operationalState([check("unknown"), check("critical")]),
    "critical",
  );
  assert.equal(
    operationalState([check("warning"), check("unknown")]),
    "warning",
  );
});
test("local operational alerts emit transitions, fifteen-minute reminders and recovery without cross-region suppression", () => {
  const alerts = new OperationalAlerts();
  const sample = (state: "ok" | "critical", seconds: number, region = "INTL") =>
    OperationalSnapshot.parse({
      region,
      sampledAt: new Date(now + seconds * 1000).toISOString(),
      state,
      queue: null,
      checks: [
        {
          signal: "worker",
          state,
          count: 0,
          oldestAt: null,
          thresholdSeconds: null,
        },
      ],
    });
  assert.equal(alerts.update(sample("ok", 0)).length, 0);
  assert.equal(
    alerts.update(sample("critical", 30))[0].event,
    "cubers.operational.alert",
  );
  assert.equal(alerts.update(sample("critical", 60)).length, 0);
  assert.equal(alerts.update(sample("critical", 930)).length, 1);
  assert.equal(alerts.update(sample("critical", 930, "CN")).length, 1);
  const recovery = alerts.update(sample("ok", 960));
  assert.equal(recovery[0].event, "cubers.operational.recovery");
  assert.equal(alerts.update(sample("ok", 990)).length, 0);
  assert.deepEqual(Object.keys(recovery[0]).sort(), [
    "count",
    "event",
    "region",
    "sampledAt",
    "signal",
    "state",
  ]);
});
test("operational contracts reject content-bearing fields and invented metric labels", () => {
  const packet = {
    region: "INTL",
    sampledAt: new Date(now).toISOString(),
    state: "unknown",
    queue: null,
    checks: [
      {
        signal: "worker",
        state: "unknown",
        count: null,
        oldestAt: null,
        thresholdSeconds: null,
      },
    ],
  };
  assert.ok(OperationalSnapshot.safeParse(packet).success);
  assert.ok(
    !OperationalSnapshot.safeParse({
      ...packet,
      error: "private provider message",
    }).success,
  );
  assert.ok(
    !OperationalSnapshot.safeParse({
      ...packet,
      checks: [{ ...packet.checks[0], signal: "user@example.test" }],
    }).success,
  );
});
