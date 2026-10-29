import type {
  OperationalSnapshot,
  OperationalSignal,
  OperationalCheck,
} from "@cubers/core";
import {
  OperationalSignal as Signal,
  OperationalState as State,
} from "@cubers/core";
import { z } from "zod";
const Checkpoint = z
  .array(
    z
      .object({
        region: z.enum(["INTL", "CN"]),
        signal: Signal,
        state: State,
        emittedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      })
      .strict(),
  )
  .max(40);
export type OperationalAlert = {
  event: "cubers.operational.alert" | "cubers.operational.recovery";
  region: "INTL" | "CN";
  signal: OperationalSignal;
  state: OperationalCheck["state"];
  sampledAt: string;
  count: number | null;
};
/** Repeated alerts every 15 minutes; transitions/recovery emit immediately. */
export class OperationalAlerts {
  private states = new Map<
    string,
    { state: OperationalCheck["state"]; emittedAt: number }
  >();
  restore(value: unknown) {
    const entries = Checkpoint.parse(value);
    const seen = new Set<string>();
    this.states.clear();
    for (const entry of entries) {
      const key = `${entry.region}:${entry.signal}`;
      if (seen.has(key)) throw Error("Duplicate alert checkpoint");
      seen.add(key);
      this.states.set(key, { state: entry.state, emittedAt: entry.emittedAt });
    }
  }
  checkpoint() {
    return [...this.states].map(([key, value]) => {
      const [region, signal] = key.split(":");
      return { region, signal, ...value };
    });
  }
  update(snapshot: OperationalSnapshot): OperationalAlert[] {
    const now = Date.parse(snapshot.sampledAt),
      events: OperationalAlert[] = [];
    for (const check of snapshot.checks) {
      const key = `${snapshot.region}:${check.signal}`;
      const previous = this.states.get(key);
      const recovery =
        check.state === "ok" &&
        previous !== undefined &&
        previous.state !== "ok";
      const alert =
        check.state !== "ok" &&
        (!previous ||
          previous.state !== check.state ||
          now - previous.emittedAt >= 900000);
      if (recovery || alert)
        events.push({
          event: recovery
            ? "cubers.operational.recovery"
            : "cubers.operational.alert",
          region: snapshot.region,
          signal: check.signal,
          state: check.state,
          sampledAt: snapshot.sampledAt,
          count: check.count,
        });
      this.states.set(key, {
        state: check.state,
        emittedAt: recovery || alert ? now : (previous?.emittedAt ?? now),
      });
    }
    return events;
  }
}
