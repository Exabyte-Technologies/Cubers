// Development and automated tests only. Uses a real PostgreSQL 17 process and Redis.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const databaseDir = resolve(".data/postgres");
await mkdir(".data", { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "cubers",
  password: "cubers_dev_only",
  port: 54329,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1", "-k", resolve(".data")],
  onLog: () => {},
  onError: (message) =>
    console.error(
      String(message).replace(/password[^\n]*/gi, "password [redacted]"),
    ),
});
if (!existsSync(`${databaseDir}/PG_VERSION`)) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname='cubers'",
);
if (!result.rowCount) await client.query("CREATE DATABASE cubers");
await client.end();
const redis = spawn(
  "redis-server",
  [
    "--bind",
    "127.0.0.1",
    "--port",
    "6389",
    "--dir",
    resolve(".data"),
    "--appendonly",
    "yes",
  ],
  { stdio: "ignore" },
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  redis.kill("SIGTERM");
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
console.log(
  "Cubers local PostgreSQL and Redis are running on loopback only. Stop this process to shut them down.",
);
