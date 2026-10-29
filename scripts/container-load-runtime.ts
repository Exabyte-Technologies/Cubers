// Disposable Linux load runtime. Existing services, private configuration and databases are never targeted.
import assert from "node:assert/strict";
import { execFile as callback } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const exec = promisify(callback);
export class ContainerLoadRuntime {
  readonly id = randomUUID().slice(0, 8);
  readonly root = resolve(".data/container-load", this.id);
  private prefix = `cubers-load-${this.id}`;
  private containers: string[] = [];
  private volumes: string[] = [];
  private network?: string;
  private api?: string;
  private images: Record<string, string> = {};
  private stopped = false;
  databaseUrl = "";
  redisUrl = "";
  constructor(
    private region: string,
    private port: number,
  ) {
    assert.ok(["INTL", "CN"].includes(region));
    assert.equal(port, region === "CN" ? 3106 : 3105);
  }
  private async docker(args: string[], timeout = 60000) {
    return (
      await exec("docker", args, { timeout, maxBuffer: 4 * 1024 * 1024 })
    ).stdout.trim();
  }
  private async inspect(id: string) {
    return JSON.parse(await this.docker(["inspect", id]))[0];
  }
  private async run(role: string, args: string[]) {
    const name = `${this.prefix}-${role}`;
    // Track the exact name before creation so failures still enter cleanup.
    this.containers.push(name);
    const id = await this.docker([
      "run",
      "--detach",
      "--pull",
      "never",
      "--name",
      name,
      ...args,
    ]);
    assert.match(id, /^[a-f0-9]{64}$/);
    return name;
  }
  async start() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const [role, key] of Object.entries({
      api: "CUBERS_LOAD_API_IMAGE",
      migrations: "CUBERS_LOAD_MIGRATIONS_IMAGE",
      postgres: "CUBERS_LOAD_POSTGRES_IMAGE",
      redis: "CUBERS_LOAD_REDIS_IMAGE",
    })) {
      const image = process.env[key] || "";
      assert.match(
        image,
        /^sha256:[a-f0-9]{64}$/,
        `Supply the exact cached ${role} image ID`,
      );
      assert.equal(
        await this.docker(["image", "inspect", "--format", "{{.Id}}", image]),
        image,
      );
      this.images[role] = image;
    }
    this.network = await this.docker([
      "network",
      "create",
      `${this.prefix}-private`,
    ]);
    const password = randomBytes(24).toString("base64url"),
      database = "cubers_load_test";
    for (const role of ["postgres", "redis"]) {
      const name = `${this.prefix}-${role}-data`;
      this.volumes.push(name);
      await this.docker(["volume", "create", name]);
    }
    const pg = await this.run("postgres", [
      "--network",
      this.network,
      "--network-alias",
      "postgres",
      "--publish",
      "127.0.0.1::5432",
      "--mount",
      `type=volume,source=${this.volumes[0]},target=/var/lib/postgresql/data`,
      "--env",
      `POSTGRES_DB=${database}`,
      "--env",
      "POSTGRES_USER=cubers",
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      this.images.postgres,
    ]);
    const redis = await this.run("redis", [
      "--network",
      this.network,
      "--network-alias",
      "redis",
      "--publish",
      "127.0.0.1::6379",
      "--mount",
      `type=volume,source=${this.volumes[1]},target=/data`,
      this.images.redis,
      "redis-server",
      "--maxmemory",
      "256mb",
      "--maxmemory-policy",
      "noeviction",
    ]);
    for (let i = 0; ; i++) {
      try {
        await this.docker([
          "exec",
          pg,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "cubers",
          "-d",
          database,
        ]);
        await this.docker(["exec", redis, "redis-cli", "ping"]);
        break;
      } catch (e) {
        if (i >= 60) throw e;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    const pgPort = (await this.inspect(pg)).NetworkSettings.Ports[
        "5432/tcp"
      ][0],
      redisPort = (await this.inspect(redis)).NetworkSettings.Ports[
        "6379/tcp"
      ][0];
    assert.ok(
      pgPort && redisPort,
      "Docker did not publish the loopback test ports",
    );
    assert.equal(pgPort.HostIp, "127.0.0.1");
    assert.equal(redisPort.HostIp, "127.0.0.1");
    this.databaseUrl = `postgresql://cubers:${password}@127.0.0.1:${pgPort.HostPort}/${database}`;
    this.redisUrl = `redis://127.0.0.1:${redisPort.HostPort}`;
    const privateDb = `postgresql://cubers:${password}@postgres:5432/${database}`;
    const migration = await this.run("migrate", [
      "--network",
      this.network,
      "--read-only",
      "--tmpfs",
      "/tmp:size=268435456,mode=1777",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--env",
      `DATABASE_URL=${privateDb}`,
      this.images.migrations,
      "node",
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      "apps/api/prisma/schema.prisma",
    ]);
    assert.equal(await this.docker(["wait", migration]), "0");
    const defaults = Object.fromEntries(
      (await readFile(".env.example", "utf8"))
        .split("\n")
        .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
    const env = {
      ...defaults,
      NODE_ENV: "test",
      HOST: "0.0.0.0",
      PORT: "3000",
      REGION: this.region,
      DATABASE_URL: privateDb,
      REDIS_URL: "redis://redis:6379",
      WORKER_ENABLED: "false",
      AI_MODE: "disabled",
      AI_API_KEY: "",
      OPENAI_API_KEY: "",
      QWEN_API_KEY: "",
      PUBLIC_RELEASE_APPROVED: "false",
      CN_GAMES_APPROVED: this.region === "CN" ? "true" : "false",
    };
    const envFile = resolve(this.root, "api.env");
    await writeFile(
      envFile,
      Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    this.api = await this.run("api", [
      "--network",
      this.network,
      "--publish",
      `127.0.0.1:${this.port}:3000`,
      "--init",
      "--read-only",
      "--tmpfs",
      "/tmp:size=268435456,mode=1777",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--pids-limit",
      "256",
      "--memory",
      "1536m",
      "--cpus",
      "2",
      "--env-file",
      envFile,
      this.images.api,
    ]);
    const actual = await this.inspect(this.api);
    assert.equal(actual.HostConfig.ReadonlyRootfs, true);
    assert.equal(actual.HostConfig.NanoCpus, 2e9);
    assert.equal(actual.HostConfig.Memory, 1536 * 1024 * 1024);
    assert.equal(actual.HostConfig.PidsLimit, 256);
    assert.notEqual(actual.Config.User, "root");
  }
  snapshot() {
    return {
      id: this.id,
      images: { ...this.images },
      api: { cpu: 2, memoryMiB: 1536, pids: 256, readOnly: true },
      network: "dedicated Docker bridge; published ports bind loopback only",
      aiMode: "disabled",
      syntheticEligibility: true,
      productionApproved: false,
    };
  }
  async stopApi() {
    if (!this.api || this.stopped) return;
    await writeFile(
      resolve(this.root, "api.log"),
      await this.docker(["logs", this.api]),
      { mode: 0o600 },
    );
    await this.docker(["stop", "--time", "20", this.api], 30000);
    this.stopped = true;
    const state = (await this.inspect(this.api)).State;
    assert.equal(state.Running, false);
    assert.equal(state.OOMKilled, false);
    assert.ok(
      [0, 143].includes(state.ExitCode),
      "API did not shut down gracefully",
    );
  }
  async cleanup() {
    const errors: unknown[] = [];
    for (const name of [...this.containers].reverse()) {
      const exists = await this.docker([
        "ps",
        "-a",
        "--filter",
        `name=^/${name}$`,
        "--format",
        "{{.Names}}",
      ]);
      if (exists) {
        assert.equal(exists, name);
        try {
          await this.docker(["rm", "--force", name]);
        } catch (e) {
          errors.push(e);
        }
      }
    }
    for (const name of this.volumes)
      try {
        await this.docker(["volume", "rm", name]);
      } catch (e) {
        errors.push(e);
      }
    if (this.network)
      try {
        await this.docker(["network", "rm", this.network]);
      } catch (e) {
        errors.push(e);
      }
    const remaining = {
      containers: (await this.docker(["ps", "-a", "--format", "{{.Names}}"]))
        .split("\n")
        .filter((n) => n.startsWith(this.prefix + "-")),
      volumes: (await this.docker(["volume", "ls", "--format", "{{.Name}}"]))
        .split("\n")
        .filter((n) => n.startsWith(this.prefix + "-")),
      networks: (await this.docker(["network", "ls", "--format", "{{.Name}}"]))
        .split("\n")
        .filter((n) => n.startsWith(this.prefix + "-")),
    };
    await writeFile(
      resolve(this.root, "cleanup.json"),
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          remaining,
          errors: errors.length,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    assert.equal(errors.length, 0, "Container load-test cleanup failed");
    for (const names of Object.values(remaining)) assert.equal(names.length, 0);
  }
}
