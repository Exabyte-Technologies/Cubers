import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  realpath,
  chmod,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as run } from "node:child_process";
import { promisify } from "node:util";
import { FileDeletionJournal } from "../../apps/api/src/deletion-journal";
import {
  bindJournal,
  reconcileDeletionJournal,
} from "../../apps/api/src/recovery";
import { retireDeletionHistory } from "../../apps/api/src/journal-retention";
import { readConfig } from "../../apps/api/src/config";
import type { Db } from "../../apps/api/src/services";
const exec = promisify(run),
  DAY = 86400000,
  masterUrl = "postgresql://cubers:cubers_dev_only@127.0.0.1:54329/cubers";
async function fixture() {
  const name = "cubers_floor_" + randomUUID().replaceAll("-", ""),
    master = new PrismaClient({ datasourceUrl: masterUrl }),
    url = masterUrl.replace(/\/cubers$/, "/" + name);
  await master.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const root = await realpath(await mkdtemp(join(tmpdir(), "cubers-floor-")));
  await chmod(root, 0o700);
  const directory = join(root, "journal"),
    key = join(root, "key.json");
  await mkdir(directory, { mode: 0o700 });
  const base = Object.fromEntries(
    (await readFile(".env.example", "utf8"))
      .split("\n")
      .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  const env = {
    ...process.env,
    ...base,
    DATABASE_URL: url,
    NODE_ENV: "test",
    REGION: "INTL",
    PORT: "0",
    WORKER_ENABLED: "false",
    AI_MODE: "disabled",
    AI_API_KEY: "",
    OPENAI_API_KEY: "",
    QWEN_API_KEY: "",
    S3_ACCESS_KEY: "S3RVER",
    S3_SECRET_KEY: "S3RVER",
    DELETION_JOURNAL_MODE: "file",
    DELETION_JOURNAL_DIRECTORY: directory,
    DELETION_JOURNAL_KEY_FILE: key,
  };
  await exec(
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
  const db = new PrismaClient({ datasourceUrl: url }) as Db;
  let clock = Date.now() - 32 * DAY;
  const journal = await FileDeletionJournal.initialize(
    directory,
    key,
    "INTL",
    () => clock,
  );
  await bindJournal(db, journal, url);
  return {
    db,
    journal,
    env,
    config: readConfig(env),
    setNow() {
      clock = Date.now();
    },
    async cleanup() {
      await db.$disconnect();
      await master.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      await master.$disconnect();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test(
  "31-day retirement waits for applied decisions and physical erasure jobs, then a stale active database cannot start the API",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const user = await f.db.user.create({
          data: {
            email: "synthetic-floor@cubers.invalid",
            displayName: "Synthetic floor",
            birthDate: "1990-01-01",
            region: "INTL",
            passwordHash: "!disabled",
          },
        }),
        genesis = await f.journal.checkpoint(0),
        record = await f.journal.append([user.id]);
      f.setNow();
      assert.equal((await retireDeletionHistory(f.db, f.config)).floor, 0);
      await reconcileDeletionJournal(f.db, f.config);
      assert.equal((await retireDeletionHistory(f.db, f.config)).floor, 0);
      assert.equal(
        (
          await f.db.recoveryBinding.findUniqueOrThrow({
            where: { id: "installation" },
          })
        ).journalCount,
        1,
      );
      await f.db.user.delete({ where: { id: user.id } });
      assert.equal((await retireDeletionHistory(f.db, f.config)).floor, 0);
      await f.db.accountRemoval.deleteMany({ where: { id: user.id } });
      assert.equal((await retireDeletionHistory(f.db, f.config)).floor, 1);
      assert.equal(
        await f.db.deletionReceipt.count({ where: { id: record.id } }),
        0,
      );
      assert.equal((await f.journal.view()).records.length, 0);
      await reconcileDeletionJournal(f.db, f.config);
      assert.equal(
        await f.db.accountRemoval.count({ where: { id: user.id } }),
        0,
      );
      await f.db.recoveryBinding.update({
        where: { id: "installation" },
        data: {
          journalCount: 0,
          journalDigest: genesis.digest,
          journalFloor: 0,
        },
      });
      await assert.rejects(
        reconcileDeletionJournal(f.db, f.config),
        /predates retired/,
      );
      await assert.rejects(
        exec(process.execPath, ["apps/api/dist/main.js"], {
          env: f.env,
          timeout: 10000,
          killSignal: "SIGKILL",
          maxBuffer: 256000,
        }),
        (e: any) =>
          e.code === 1 &&
          String(e.stderr).includes("predates retired privacy history"),
      );
    } finally {
      await f.cleanup();
    }
  },
);
test(
  "retirement removes old media and withdrawal recovery metadata only after their object deletion retries finish; new absolute events replay normally",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const owner = randomUUID(),
        mediaId = randomUUID();
      await f.journal.appendMedia(owner, {
        kind: "MEDIA_ERASE",
        mediaId,
        key: `INTL/${owner}/${mediaId}/clean`,
      });
      await f.journal.appendMedia(owner, {
        kind: "CONSENT_WITHDRAWAL",
        cutoff: new Date(Date.now() - 32 * DAY).toISOString(),
      });
      f.setNow();
      await reconcileDeletionJournal(f.db, f.config);
      assert.equal((await retireDeletionHistory(f.db, f.config)).floor, 0);
      assert.equal(await f.db.mediaRecoveryState.count(), 1);
      assert.equal(await f.db.consentWithdrawalRecovery.count(), 1);
      await f.db.objectRemoval.deleteMany({});
      assert.equal((await retireDeletionHistory(f.db, f.config)).floor, 2);
      assert.equal(await f.db.mediaRecoveryState.count(), 0);
      assert.equal(await f.db.consentWithdrawalRecovery.count(), 0);
      assert.equal(await f.db.deletionReceipt.count(), 0);
      await f.db.recoveryBinding.update({
        where: { id: "installation" },
        data: { journalFloor: 4 },
      });
      await assert.rejects(
        reconcileDeletionJournal(f.db, f.config),
        /floor exceeds/,
      );
      await f.db.recoveryBinding.update({
        where: { id: "installation" },
        data: { journalFloor: 2 },
      });
      const next = await f.journal.appendMedia(owner, {
        kind: "CONSENT_WITHDRAWAL",
        cutoff: new Date().toISOString(),
      });
      assert.equal(next.version === 2 ? next.sequence : 0, 3);
      await reconcileDeletionJournal(f.db, f.config);
      assert.equal(
        (
          await f.db.recoveryBinding.findUniqueOrThrow({
            where: { id: "installation" },
          })
        ).journalCount,
        3,
      );
      assert.equal(
        (
          await f.db.consentWithdrawalRecovery.findUniqueOrThrow({
            where: { id: owner },
          })
        ).sequence,
        3,
      );
      assert.equal((await retireDeletionHistory(f.db, f.config)).floor, 2);
      assert.equal(await f.db.deletionReceipt.count(), 1);
    } finally {
      await f.cleanup();
    }
  },
);
