// Loopback-only test with synthetic accounts in a dedicated disposable database.
// Never target production or import production credentials.
import { ContainerLoadRuntime } from "./container-load-runtime";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import Redis from "ioredis";
import { spawn, execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdir, writeFile, open } from "node:fs/promises";
import { io, type Socket } from "socket.io-client";
import { inverse, Puzzle } from "@cubers/core";
import { opaque, hash, passwordHash } from "../apps/api/src/crypto";
import { WCA_PROGRAM, WCA_EVENTS } from "../apps/api/src/wca-scrambles";
const execFile = promisify(execFileCb);
const puzzle = Puzzle.parse(process.env.CUBERS_LOAD_PUZZLE || "3x3");
const region = process.env.CUBERS_LOAD_REGION || "INTL";
if (!["INTL", "CN"].includes(region))
  throw new Error("Invalid local load-test region");
const database = region === "CN" ? "cubers_cn_load_test" : "cubers_load_test",
  port = region === "CN" ? 3106 : 3105,
  base = `http://127.0.0.1:${port}`;
let databaseUrl = `postgresql://cubers:cubers_dev_only@127.0.0.1:54329/${database}`;
let db = new PrismaClient({ datasourceUrl: databaseUrl });
const runtime = process.env.CUBERS_LOAD_RUNTIME || "host";
assert.ok(["host", "container"].includes(runtime), "Invalid load runtime");
let container: ContainerLoadRuntime | undefined;
const users: string[] = [],
  rooms: string[] = [],
  sockets: Socket[] = [],
  samples: number[] = [];
let server: ReturnType<typeof spawn> | undefined;
let serverExit:
    Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined,
  cache: Redis | undefined;
const shutdownAttempts: string[] = [];
let operations = 0,
  failures = 0;
async function timed<T>(work: () => Promise<T>) {
  const started = performance.now();
  try {
    const result = await work();
    operations++;
    return result;
  } catch (error) {
    failures++;
    throw error;
  } finally {
    samples.push(performance.now() - started);
  }
}
async function api(path: string, token: string, body?: unknown) {
  return timed(async () => {
    const r = await fetch(`${base}/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(`Load request failed: ${r.status} ${path}`);
    return result;
  });
}
async function event(socket: Socket, name: string, body?: unknown) {
  return timed(async () => {
    const result = await socket.timeout(15000).emitWithAck(name, body);
    if (!result?.ok) throw new Error(`Realtime request rejected: ${name}`);
    return result;
  });
}
async function main() {
  // Refuse an occupied port: never accidentally measure or stop another API.
  const probe = createServer();
  probe.listen(port, "127.0.0.1");
  await once(probe, "listening");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  if (runtime === "container") {
    container = new ContainerLoadRuntime(region, port);
    await container.start();
    databaseUrl = container.databaseUrl;
    await db.$disconnect();
    db = new PrismaClient({ datasourceUrl: databaseUrl });
  } else {
    const master = new PrismaClient({
      datasourceUrl: databaseUrl.replace(database, "cubers"),
    });
    try {
      const [found] = await master.$queryRaw<
        { exists: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${database})`;
      if (!found.exists)
        await master.$executeRawUnsafe(`CREATE DATABASE ${database}`);
    } finally {
      await master.$disconnect();
    }
  }
  const raw = await readFile(".env.example", "utf8"),
    defaults = Object.fromEntries(
      raw
        .split("\n")
        .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
  const env = {
    ...process.env,
    ...defaults,
    DATABASE_URL: databaseUrl,
    REDIS_URL: defaults.REDIS_URL,
    NODE_ENV: "test",
    REGION: region,
    PORT: String(port),
    CN_GAMES_APPROVED: region === "CN" ? "true" : "false",
    PUBLIC_RELEASE_APPROVED: "false",
    WORKER_ENABLED: "false",
    AI_MODE: "disabled",
    AI_API_KEY: "",
    OPENAI_API_KEY: "",
    QWEN_API_KEY: "",
  };
  assert.ok(
    ["127.0.0.1", "localhost"].includes(new URL(env.REDIS_URL).hostname),
    "Use the local test cache only",
  );
  cache = new Redis(container?.redisUrl ?? env.REDIS_URL, {
    maxRetriesPerRequest: 2,
  });
  if (!container) {
    await execFile(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        "apps/api/prisma/schema.prisma",
      ],
      { env },
    );
    await mkdir(".data/load-tests", { recursive: true, mode: 0o700 });
    const log = await open(
      `.data/load-tests/${region}-${puzzle}.api.log`,
      "w",
      0o600,
    );
    server = spawn(process.execPath, ["apps/api/dist/main.js"], {
      env,
      stdio: ["ignore", log.fd, log.fd],
    });
    serverExit = new Promise((resolve) => {
      server!.once("exit", (code, signal) => resolve({ code, signal }));
      server!.once("error", () => resolve({ code: 1, signal: null }));
    });
    await log.close();
  }
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    if (server && (server.exitCode !== null || server.signalCode !== null))
      throw new Error("The owned load-test API exited during startup");
    try {
      const response = await fetch(`${base}/v1/health`),
        health = await response.json();
      if (
        response.ok &&
        health.region === region &&
        health.aiMode === "disabled"
      ) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!healthy) throw new Error("Load-test API did not become ready");
  const run = opaque().slice(0, 10),
    password = await passwordHash(opaque());
  const players: {
    id: string;
    token: string;
    room?: any;
    attempt?: any;
    start?: number;
    sequence: number;
    socket?: Socket;
  }[] = [];
  for (let i = 0; i < 100; i++) {
    const u = await db.user.create({
        data: {
          email: `load-${run}-${i}@cubers.test`,
          displayName: "Synthetic load player",
          passwordHash: password,
          birthDate: "1990-01-01",
          emailVerified: true,
          region,
          adultVerified: true,
          identityVerified: true,
        },
      }),
      token = opaque();
    users.push(u.id);
    await db.session.create({
      data: {
        userId: u.id,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    players.push({ id: u.id, token, sequence: 0 });
  }
  for (let i = 0; i < 100; i += 8) {
    const group = players.slice(i, i + 8),
      room = await api("rooms", group[0].token, {
        puzzle,
        input: "virtual",
        mode: "race",
        ranked: true,
        private: true,
      });
    rooms.push(room.id);
    await Promise.all(
      group.map(async (p, index) => {
        p.room = room;
        if (index) await api("rooms/join", p.token, { code: room.code });
      }),
    );
  }
  await Promise.all(
    players.map(async (p) => {
      const socket = io(`${base}/play`, {
        transports: ["websocket"],
        auth: { token: p.token },
        reconnection: false,
        timeout: 10000,
      });
      sockets.push(socket);
      p.socket = socket;
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      await event(socket, "room.join", { roomId: p.room.id });
    }),
  );
  console.log(
    "100 concurrent local sockets connected across 13 rooms. Starting sustained move traffic.",
  );
  await Promise.all(
    players
      .filter((_, i) => i % 8 === 0)
      .map((p) => api(`rooms/${p.room.id}/start`, p.token, {})),
  );
  await Promise.all(
    players.map(async (p) => {
      p.attempt = await api(`rooms/${p.room.id}/attempts`, p.token, {});
      assert.deepEqual(p.attempt.scrambleSource, {
        ...WCA_PROGRAM,
        event: WCA_EVENTS[puzzle],
      });
      await api(`attempts/${p.attempt.id}/inspect`, p.token, {
        nonce: p.attempt.nonce,
      });
      await api(`attempts/${p.attempt.id}/start`, p.token, {
        nonce: p.attempt.nonce,
      });
      p.start = Date.now();
    }),
  );
  const began = performance.now();
  async function move(p: (typeof players)[number], move: string) {
    await event(p.socket!, "attempt.moves", {
      attemptId: p.attempt.id,
      nonce: p.attempt.nonce,
      events: [
        { sequence: p.sequence++, move, elapsedMs: Date.now() - p.start! },
      ],
    });
  }
  await Promise.all(
    players.map(async (p) => {
      for (const m of inverse(p.attempt.scramble)) await move(p, m);
    }),
  );
  for (let turn = 0; turn < 120; turn++) {
    const tick = performance.now();
    await Promise.all(players.map((p) => move(p, turn % 2 ? "R'" : "R")));
    if (turn % 6 === 0)
      await Promise.all(players.map((p) => event(p.socket!, "room.refresh")));
    if (turn % 30 === 0)
      console.log(
        `Sustained traffic: ${turn / 2} seconds of paced moves completed.`,
      );
    await new Promise((r) =>
      setTimeout(r, Math.max(0, 500 - (performance.now() - tick))),
    );
  }
  const results = await Promise.all(
    players.map((p) =>
      api(`attempts/${p.attempt.id}/finish`, p.token, {
        nonce: p.attempt.nonce,
      }),
    ),
  );
  if (results.some((r) => r.status !== "APPROVED"))
    throw new Error("A reconstructed solve did not approve");
  const seconds = (performance.now() - began) / 1000,
    sorted = samples.sort((a, b) => a - b);
  const percentile = (p: number) =>
    Number(
      sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * p))
      ].toFixed(2),
    );
  const report = {
    timestamp: new Date().toISOString(),
    puzzle,
    region,
    scrambleProgram: WCA_PROGRAM,
    mainlandGameFlag:
      region === "CN"
        ? "Synthetic local testing only; no production approval"
        : "off",
    environment: container
      ? "Packaged Linux API in Docker Desktop with production CPU/memory/PID limits, disposable PostgreSQL/Redis and host load clients; not a regional production capacity certification"
      : "Loopback macOS development host, embedded PostgreSQL, local Redis, one API process; not a production capacity certification",
    ...(container ? { container: container.snapshot() } : {}),
    concurrentPlayers: 100,
    rooms: 13,
    sustainedSeconds: Number(seconds.toFixed(2)),
    operations,
    failures,
    approvedSolves: results.length,
    latencyMs: {
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: percentile(1),
    },
    caveats: [
      "No camera uploads, video transcoding, TLS, internet latency or regional production hardware measured",
      "Each game room is limited to eight players",
      "Multi-instance websocket fanout and sticky routing are not implemented; this result applies to one API process",
      "CN test accounts have synthetic identity flags and local game access; this does not approve mainland operation or enable a production service",
    ],
  };
  // A clean result also needs real server-owned shutdown while 100 further
  // attempts are solving, with interruption persisted before database closure.
  const prepare = performance.now();
  for (let i = 0; i < players.length; i += 8) {
    const group = players.slice(i, i + 8),
      room = await api("rooms", group[0].token, {
        puzzle,
        input: "virtual",
        mode: "race",
        ranked: true,
        private: true,
      });
    rooms.push(room.id);
    await Promise.all(
      group.map(async (p, index) => {
        if (index) await api("rooms/join", p.token, { code: room.code });
      }),
    );
    await api(`rooms/${room.id}/start`, group[0].token, {});
    await Promise.all(
      group.map(async (p) => {
        await event(p.socket!, "room.join", { roomId: room.id });
        const a = await api(`rooms/${room.id}/attempts`, p.token, {});
        assert.deepEqual(a.scrambleSource, {
          ...WCA_PROGRAM,
          event: WCA_EVENTS[puzzle],
        });
        await api(`attempts/${a.id}/inspect`, p.token, { nonce: a.nonce });
        await api(`attempts/${a.id}/start`, p.token, { nonce: a.nonce });
        shutdownAttempts.push(a.id);
      }),
    );
  }
  assert.equal(shutdownAttempts.length, 100);
  return {
    ...report,
    shutdownProbePreparationMs: Math.round(performance.now() - prepare),
  };
}
async function stopOwnedServer() {
  if (container) return container.stopApi();
  if (!server || !serverExit) return;
  server.kill("SIGTERM");
  let timer: ReturnType<typeof setTimeout>;
  const result = await Promise.race([
    serverExit,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), 20000);
    }),
  ]);
  clearTimeout(timer!);
  if (!result) {
    server.kill("SIGKILL");
    await serverExit;
    throw new Error(
      "The owned API failed graceful shutdown; forced test cleanup was required",
    );
  }
  if (result.code !== 0 && result.signal !== "SIGTERM")
    throw new Error("The owned API exited unsuccessfully");
}
async function run() {
  let report: Awaited<ReturnType<typeof main>> | undefined,
    failed: unknown,
    cleanupMs = 0,
    interrupted = 0,
    leases = 0;
  try {
    report = await main();
  } catch (error) {
    failed = error;
  } finally {
    const began = performance.now();
    try {
      await stopOwnedServer();
      if (shutdownAttempts.length) {
        interrupted = await db.attempt.count({
          where: { id: { in: shutdownAttempts }, status: "INTERRUPTED" },
        });
        assert.equal(interrupted, shutdownAttempts.length);
      }
      if (cache) {
        for (const id of users)
          leases += await cache.zcard(`ws-connections:${id}`);
        assert.equal(
          leases,
          0,
          "Every disconnected socket lease must be removed",
        );
      }
    } catch (error) {
      failed ??= error;
    } finally {
      for (const socket of sockets) socket.disconnect();
      try {
        if (rooms.length) {
          await db.roomMember.deleteMany({ where: { roomId: { in: rooms } } });
          await db.room.deleteMany({ where: { id: { in: rooms } } });
        }
        if (users.length)
          await db.user.deleteMany({ where: { id: { in: users } } });
      } catch (error) {
        failed ??= error;
      } finally {
        await db.$disconnect();
        cache?.disconnect();
      }
    }
    if (container) {
      try {
        await container.cleanup();
      } catch (error) {
        failed ??= error;
      }
    }
    cleanupMs = Math.round(performance.now() - began);
  }
  if (failed) throw failed;
  assert.ok(report);
  const final = {
    ...report,
    status: "passed",
    shutdown: {
      unfinishedSolves: shutdownAttempts.length,
      interrupted,
      remainingLeases: leases,
      cleanupMs,
      gracefulExit: true,
      syntheticRowsRemoved: true,
    },
  };
  await mkdir("artifacts", { recursive: true });
  const path = container
    ? `artifacts/load-test-container-${region.toLowerCase()}-${container.id}.json`
    : region === "CN"
      ? `artifacts/load-test-cn-${puzzle}.json`
      : puzzle === "3x3"
        ? "artifacts/load-test.json"
        : `artifacts/load-test-${puzzle}.json`;
  await writeFile(path, JSON.stringify(final, null, 2));
  console.log(JSON.stringify(final, null, 2));
}
void run().catch(async (error) => {
  await mkdir(".data/load-tests", { recursive: true, mode: 0o700 });
  await writeFile(
    container
      ? `${container.root}/failure.json`
      : `.data/load-tests/${region}-${puzzle}-failure.json`,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        region,
        puzzle,
        error: error instanceof Error ? error.stack : String(error),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.error(
    "Local load/shutdown verification failed; inspect its private .data/load-tests diagnostic. No passed report was written.",
  );
  process.exitCode = 1;
});
