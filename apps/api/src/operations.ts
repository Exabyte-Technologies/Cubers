import { Injectable, Inject, OnApplicationShutdown } from "@nestjs/common";
import Redis from "ioredis";
import { Queue } from "bullmq";
import {
  OperationalSnapshot,
  type OperationalCheck,
  type OperationalSignal,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { telemetryPrefix, WORKER_FRESH_MS } from "./operational-telemetry";

type Backlog = {
  signal: OperationalSignal;
  count: bigint;
  oldestAt: Date | null;
};
const policies: Partial<
  Record<OperationalSignal, [number, "warning" | "critical"]>
> = {
  "media-processing": [300, "warning"],
  "media-failed": [0, "warning"],
  reports: [86400, "warning"],
  posts: [172800, "warning"],
  consents: [172800, "warning"],
  "evidence-review": [86400, "warning"],
  "evidence-retention": [120, "critical"],
  "attempt-expiry": [120, "critical"],
  "account-erasure": [300, "critical"],
  "object-erasure": [300, "critical"],
};
export function backlogCheck(row: Backlog, now: number): OperationalCheck {
  const [limit, severity] = policies[row.signal]!;
  const oldest = row.oldestAt?.getTime() ?? null;
  return {
    signal: row.signal,
    state:
      row.count > 0 &&
      (limit === 0 || (oldest !== null && now - oldest >= limit * 1000))
        ? severity
        : "ok",
    count: Math.min(Number(row.count), Number.MAX_SAFE_INTEGER),
    oldestAt: row.oldestAt?.toISOString() ?? null,
    thresholdSeconds: limit,
  };
}
export function operationalState(checks: OperationalCheck[]) {
  return (
    (["critical", "warning", "unknown", "ok"] as const).find((state) =>
      checks.some((c) => c.state === state),
    ) ?? "unknown"
  );
}
export function jobCheck(
  job: "maintenance" | "media" | "smtp",
  value: Record<string, string>,
  now: number,
): OperationalCheck {
  const thresholdSeconds =
    job === "maintenance" ? 180 : job === "media" ? 300 : null;
  const success = Number(value.success),
    failure = Number(value.failure);
  const valid = (n: number) =>
    Number.isSafeInteger(n) && n > 0 && n <= now + 5000;
  const successAt = valid(success) ? success : null,
    failureAt = valid(failure) ? failure : null;
  return {
    signal: job,
    state:
      value.state === "failure" && failureAt !== null
        ? job === "maintenance"
          ? "critical"
          : "warning"
        : successAt === null
          ? "unknown"
          : thresholdSeconds !== null &&
              now - successAt >= thresholdSeconds * 1000
            ? "critical"
            : "ok",
    count: null,
    oldestAt: successAt === null ? null : new Date(successAt).toISOString(),
    thresholdSeconds,
  };
}

@Injectable()
export class Operations implements OnApplicationShutdown {
  private redis!: Redis;
  private queue!: Queue;
  private pending?: Promise<OperationalSnapshot>;
  private cached?: { at: number; snapshot: OperationalSnapshot };
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure)
    private infra: Pick<Infrastructure, "config"> &
      Partial<Pick<Infrastructure, "playIntegrityUnavailable">>,
  ) {
    this.connect();
  }
  private connect() {
    this.redis = new Redis(this.infra.config.REDIS_URL, {
      commandTimeout: 2500,
      connectTimeout: 1000,
      retryStrategy: (times) => (times > 1 ? null : 250),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    // Connection failures become fixed operational states, never raw URLs/errors.
    this.redis.on("error", () => {});
    this.queue = new Queue(`cubers-${this.infra.config.REGION}`, {
      connection: this.redis,
    });
    this.queue.on("error", () => {});
  }
  snapshot(): Promise<OperationalSnapshot> {
    if (this.cached && Date.now() - this.cached.at < 10000)
      return Promise.resolve(this.cached.snapshot);
    if (!this.pending) {
      this.pending = this.collect()
        .then((snapshot) => {
          this.cached = { at: Date.now(), snapshot };
          return snapshot;
        })
        .finally(() => {
          this.pending = undefined;
        });
    }
    return this.pending;
  }
  private async collect(): Promise<OperationalSnapshot> {
    const now = Date.now();
    const checks: OperationalCheck[] = [];
    const dependency = (
      signal: OperationalSignal,
      state: OperationalCheck["state"],
      count: number | null = null,
    ): OperationalCheck => ({
      signal,
      state,
      count,
      oldestAt: null,
      thresholdSeconds: null,
    });
    let queue: OperationalSnapshot["queue"] = null;
    await Promise.all([
      (async () => {
        try {
          const rows = await this.db.$transaction(
            async (tx) => {
              await tx.$executeRaw`SET LOCAL statement_timeout = '2500ms'`;
              return tx.$queryRaw<Backlog[]>`
              SELECT 'media-processing' AS signal, count(*) AS count, min("createdAt") AS "oldestAt" FROM "Media" WHERE status='PROCESSING'
              UNION ALL SELECT 'media-failed',count(*),min("createdAt") FROM "Media" WHERE status='REJECTED'
              UNION ALL SELECT 'reports',count(*),min("createdAt") FROM "Report" WHERE status='OPEN'
              UNION ALL SELECT 'posts',count(*),min("createdAt") FROM "Post" WHERE status='PENDING'
              UNION ALL SELECT 'consents',count(*),min("createdAt") FROM "Consent" WHERE status='PENDING'
              UNION ALL SELECT 'evidence-review',count(*),min("createdAt") FROM "Attempt" WHERE status='PROVISIONAL' OR (status='REJECTED' AND appealed)
              UNION ALL SELECT 'evidence-retention',count(*),min("evidenceDeleteAt") FROM "Attempt" WHERE "evidenceId" IS NOT NULL AND "evidenceDeleteAt" <= CURRENT_TIMESTAMP
              UNION ALL SELECT 'attempt-expiry',count(*),min("createdAt" + interval '30 days') FROM "Attempt" WHERE status IN ('CREATED','INSPECTION','SOLVING','AWAITING_EVIDENCE','PROVISIONAL') AND "createdAt" <= CURRENT_TIMESTAMP - interval '30 days'
              UNION ALL SELECT 'account-erasure',count(*),min(due) FROM (SELECT "retryAt" AS due FROM "AccountRemoval" WHERE "retryAt" <= CURRENT_TIMESTAMP UNION ALL SELECT "deletedAt" FROM "User" WHERE "deletedAt" IS NOT NULL) pending_erasure
              UNION ALL SELECT 'object-erasure',count(*),min("retryAt") FROM "ObjectRemoval" WHERE "retryAt" <= CURRENT_TIMESTAMP
            `;
            },
            { maxWait: 1000, timeout: 5000 },
          );
          checks.push(
            dependency("database", "ok"),
            ...rows.map((row) => backlogCheck(row, now)),
          );
        } catch {
          checks.push(dependency("database", "critical"));
          for (const signal of Object.keys(policies) as OperationalSignal[])
            checks.push(dependency(signal, "unknown"));
        }
      })(),
      (async () => {
        try {
          if (this.redis.status === "end") {
            void this.queue.close().catch(() => {});
            this.connect();
          }
          await this.queue.waitUntilReady();
          const prefix = telemetryPrefix(this.infra.config.REGION);
          const [time, counts, paused] = await Promise.all([
            this.redis.time(),
            this.queue.getJobCounts("waiting", "active", "delayed", "failed"),
            this.queue.isPaused(),
          ]);
          const redisNow =
            Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
          const [workers, ...jobs] = await Promise.all([
            this.redis.zcount(
              `${prefix}:workers`,
              redisNow - WORKER_FRESH_MS + 1,
              redisNow + 5000,
            ),
            ...(["maintenance", "media", "smtp"] as const).map((job) =>
              this.redis.hgetall(`${prefix}:job:${job}`),
            ),
          ]);
          queue = {
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            delayed: counts.delayed ?? 0,
            failedRetained: counts.failed ?? 0,
            paused,
          };
          checks.push(
            dependency("redis", "ok"),
            dependency(
              "worker",
              Number(workers) > 0 && !paused ? "ok" : "critical",
              Number(workers),
            ),
          );
          (["maintenance", "media", "smtp"] as const).forEach((job, i) =>
            checks.push(
              jobCheck(job, jobs[i] as Record<string, string>, redisNow),
            ),
          );
        } catch {
          checks.push(dependency("redis", "critical"));
          for (const signal of [
            "worker",
            "maintenance",
            "media",
            "smtp",
          ] as const)
            checks.push(dependency(signal, "unknown"));
        }
      })(),
    ]);
    if (this.infra.playIntegrityUnavailable !== undefined)
      checks.push(
        dependency(
          "play-reconciliation",
          this.infra.playIntegrityUnavailable ? "critical" : "ok",
        ),
      );
    checks.sort((a, b) => a.signal.localeCompare(b.signal));
    return OperationalSnapshot.parse({
      region: this.infra.config.REGION,
      sampledAt: new Date(now).toISOString(),
      state: operationalState(checks),
      checks,
      queue,
    });
  }
  async onApplicationShutdown() {
    await this.queue.close();
    this.redis.disconnect();
  }
}
