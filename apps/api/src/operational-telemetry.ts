import type Redis from "ioredis";
export type OperationalJob = "maintenance" | "media" | "smtp";
export const WORKER_FRESH_MS = 45000;
export const telemetryPrefix = (region: string) => `${region}:ops:v1`;

/** Fixed labels only: never put errors, jobs, addresses or user identifiers here. */
export class OperationalTelemetry {
  constructor(
    private redis: Redis,
    private region: "INTL" | "CN",
  ) {}
  async heartbeat(instance: string) {
    const key = `${telemetryPrefix(this.region)}:workers`;
    await this.redis.eval(
      "local t=redis.call('TIME'); local n=t[1]*1000+math.floor(t[2]/1000); redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',n-45000); redis.call('ZADD',KEYS[1],n,ARGV[1]); redis.call('EXPIRE',KEYS[1],120); return 1",
      1,
      key,
      instance,
    );
  }
  async stopped(instance: string) {
    await this.redis.zrem(`${telemetryPrefix(this.region)}:workers`, instance);
  }
  async outcome(job: OperationalJob, succeeded: boolean) {
    await this.redis.eval(
      "local t=redis.call('TIME'); local n=t[1]*1000+math.floor(t[2]/1000); redis.call('HSET',KEYS[1],ARGV[1],n,'state',ARGV[1]); redis.call('HINCRBY',KEYS[1],ARGV[1]..'Count',1); redis.call('EXPIRE',KEYS[1],172800); return 1",
      1,
      `${telemetryPrefix(this.region)}:job:${job}`,
      succeeded ? "success" : "failure",
    );
  }
  /** Observability failure must not turn a committed email or completed job into a retry. */
  async safely(job: OperationalJob, succeeded: boolean) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.outcome(job, succeeded),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error("Telemetry deadline")), 750);
        }),
      ]);
    } catch {
      console.error(
        "Operational telemetry unavailable; inspect Redis and worker health",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
