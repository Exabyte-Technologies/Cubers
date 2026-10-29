import { z } from "zod";

export const OperationalSignal = z.enum([
  "database",
  "redis",
  "worker",
  "maintenance",
  "media",
  "smtp",
  "media-processing",
  "media-failed",
  "reports",
  "posts",
  "consents",
  "evidence-review",
  "evidence-retention",
  "attempt-expiry",
  "account-erasure",
  "object-erasure",
  "play-reconciliation",
]);
export const OperationalState = z.enum([
  "ok",
  "warning",
  "critical",
  "unknown",
]);
export const OperationalCheck = z
  .object({
    signal: OperationalSignal,
    state: OperationalState,
    count: z.number().int().nonnegative().nullable(),
    oldestAt: z.string().datetime().nullable(),
    thresholdSeconds: z.number().int().nonnegative().nullable(),
  })
  .strict();
export const OperationalSnapshot = z
  .object({
    region: z.enum(["INTL", "CN"]),
    sampledAt: z.string().datetime(),
    state: OperationalState,
    checks: z.array(OperationalCheck).max(20),
    queue: z
      .object({
        waiting: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
        delayed: z.number().int().nonnegative(),
        failedRetained: z.number().int().nonnegative(),
        paused: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type OperationalSnapshot = z.infer<typeof OperationalSnapshot>;
export type OperationalCheck = z.infer<typeof OperationalCheck>;
export type OperationalSignal = z.infer<typeof OperationalSignal>;
