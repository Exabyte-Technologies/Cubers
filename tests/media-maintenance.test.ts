import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  maintenanceLoop,
  publishMaintenanceHealth,
  checkMaintenanceHealth,
  type Health,
} from "../apps/api/src/media-maintenance";
test("maintenance retries an outage without overlap and never reports a previous success as current health", async () => {
  const stop = new AbortController(),
    states: Health[] = [];
  let count = 0,
    active = false,
    clock = Date.now();
  await maintenanceLoop({
    region: "INTL",
    scope: "target",
    intervalMs: 1,
    signal: stop.signal,
    clock: () => clock,
    async pass() {
      assert.equal(active, false);
      active = true;
      await Promise.resolve();
      active = false;
      count++;
      if (count === 1) throw Error("synthetic private storage details");
      return { failures: 0, bundles: 1, targets: 1, purged: 2 };
    },
    async publish(s) {
      states.push({ ...s });
    },
    async wait() {
      clock += 10;
      if (count === 2) stop.abort();
    },
  });
  assert.equal(count, 2);
  assert.deepEqual(
    states.map((s) => s.phase),
    ["starting", "running", "degraded", "running", "healthy", "stopped"],
  );
  assert.equal(states[2].failures, 1);
  assert.equal(states[2].lastSuccessAt, null);
  assert.ok(states[4].lastSuccessAt);
  assert.equal(JSON.stringify(states).includes("private storage"), false);
});
test("health probes reject stale, future, degraded and stopped workers even with an earlier successful sweep", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "cubers-maintenance-")),
  );
  await chmod(root, 0o700);
  const now = Date.now(),
    s: Health = {
      version: 1,
      region: "CN",
      scope: "backups",
      phase: "healthy",
      updatedAt: new Date(now).toISOString(),
      completedAt: new Date(now).toISOString(),
      lastSuccessAt: new Date(now).toISOString(),
      intervalMs: 30000,
      failures: 0,
      bundles: 1,
      targets: 0,
      purged: 1,
    };
  try {
    await publishMaintenanceHealth(root, s);
    assert.equal((await checkMaintenanceHealth(root, now)).status, "healthy");
    await assert.rejects(checkMaintenanceHealth(root, now + 660001));
    await assert.rejects(checkMaintenanceHealth(root, now - 60001));
    await publishMaintenanceHealth(root, {
      ...s,
      phase: "degraded",
      failures: 1,
    });
    await assert.rejects(checkMaintenanceHealth(root, now));
    await publishMaintenanceHealth(root, { ...s, phase: "stopped" });
    await assert.rejects(checkMaintenanceHealth(root, now));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("a maintenance worker cannot proceed silently when its health publication fails", async () => {
  let work = false;
  await assert.rejects(
    maintenanceLoop({
      region: "INTL",
      scope: "backups",
      intervalMs: 1,
      signal: new AbortController().signal,
      pass: async () => {
        work = true;
        return { failures: 0, bundles: 0, targets: 0, purged: 0 };
      },
      publish: async () => {
        throw Error("health storage unavailable");
      },
    }),
  );
  assert.equal(work, false);
});
