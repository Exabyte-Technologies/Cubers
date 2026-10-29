/** Private background scheduling and observable health; no HTTP or notifications. */
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  privateDirectory,
  publishPrivateJson,
  readPrivateJson,
} from "./database-snapshot";
import { join } from "node:path";
export const MaintenanceHealth = z
  .object({
    version: z.literal(1),
    region: z.enum(["CN", "INTL"]),
    scope: z.enum(["backups", "target", "snapshots"]),
    phase: z.enum(["starting", "running", "healthy", "degraded", "stopped"]),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    lastSuccessAt: z.string().datetime().nullable(),
    intervalMs: z.number().int().min(1).max(300000),
    failures: z.number().int().min(0),
    bundles: z.number().int().min(0),
    targets: z.number().int().min(0),
    purged: z.number().int().min(0),
  })
  .strict();
export type Health = z.infer<typeof MaintenanceHealth>;
export type Sweep = {
  failures: number;
  bundles: number;
  targets: number;
  purged: number;
};
export async function maintenanceLoop(options: {
  region: "CN" | "INTL";
  scope: "backups" | "target" | "snapshots";
  intervalMs: number;
  signal: AbortSignal;
  pass: () => Promise<Sweep>;
  publish: (state: Health) => Promise<void>;
  clock?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}) {
  const clock = options.clock ?? Date.now,
    wait =
      options.wait ??
      (async (ms, signal) => {
        await delay(ms, undefined, { signal });
      });
  let state: Health = {
    version: 1,
    region: options.region,
    scope: options.scope,
    phase: "starting",
    updatedAt: new Date(clock()).toISOString(),
    completedAt: null,
    lastSuccessAt: null,
    intervalMs: options.intervalMs,
    failures: 0,
    bundles: 0,
    targets: 0,
    purged: 0,
  };
  async function publish(phase: Health["phase"]) {
    state = { ...state, phase, updatedAt: new Date(clock()).toISOString() };
    await options.publish(MaintenanceHealth.parse(state));
  }
  await publish("starting");
  while (!options.signal.aborted) {
    await publish("running");
    let result: Sweep;
    try {
      result = await options.pass();
    } catch {
      result = { failures: 1, bundles: 0, targets: 0, purged: 0 };
    }
    const finished = new Date(clock()).toISOString();
    state = {
      ...state,
      ...result,
      completedAt: finished,
      lastSuccessAt: result.failures ? state.lastSuccessAt : finished,
    };
    await publish(result.failures ? "degraded" : "healthy");
    if (options.signal.aborted) break;
    try {
      await wait(options.intervalMs, options.signal);
    } catch (e) {
      if (!options.signal.aborted) throw e;
    }
  }
  await publish("stopped");
}
export async function publishMaintenanceHealth(
  directory: string,
  state: Health,
) {
  await privateDirectory(directory);
  await publishPrivateJson(
    join(directory, "status.json"),
    MaintenanceHealth.parse(state),
    true,
  );
}
export async function checkMaintenanceHealth(
  directory: string,
  now = Date.now(),
) {
  const state = MaintenanceHealth.parse(
    await readPrivateJson(join(directory, "status.json"), 8192),
  );
  const age = now - Date.parse(state.updatedAt),
    completed = state.completedAt
      ? now - Date.parse(state.completedAt)
      : Infinity;
  if (
    age < -60000 ||
    state.failures ||
    !["healthy", "running"].includes(state.phase) ||
    age > 600000 + state.intervalMs * 2 ||
    completed > 600000 + state.intervalMs * 2
  )
    throw Error("Media maintenance is unavailable, stale or degraded");
  return { status: "healthy", region: state.region, scope: state.scope };
}
