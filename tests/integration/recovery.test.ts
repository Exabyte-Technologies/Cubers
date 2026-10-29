import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  realpath,
  chmod,
  readFile,
  writeFile,
  rm,
  readdir,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFile as run, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import {
  FileDeletionJournal,
  deletionDigest,
} from "../../apps/api/src/deletion-journal";
import {
  bindJournal,
  reconcileDeletionJournal,
} from "../../apps/api/src/recovery";
import { readConfig } from "../../apps/api/src/config";
import { passwordHash, opaque, hash } from "../../apps/api/src/crypto";
import { Db, Infrastructure } from "../../apps/api/src/services";
import { Background } from "../../apps/api/src/worker";
import { PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
const exec = promisify(run),
  runId = randomUUID().slice(0, 8),
  database = `cubers_recovery_test_${runId}`,
  masterUrl = "postgresql://cubers:cubers_dev_only@127.0.0.1:54329/cubers",
  url = masterUrl.replace(/\/cubers$/, `/${database}`),
  db = new PrismaClient({ datasourceUrl: url }),
  origin = "http://127.0.0.1:3103";
let root: string,
  directory: string,
  keyPath: string,
  env: NodeJS.ProcessEnv,
  journal: FileDeletionJournal,
  infra: Infrastructure,
  server: ChildProcess | undefined;
async function stop() {
  if (!server) return;
  const child = server;
  server = undefined;
  if (child.exitCode === null && child.signalCode === null) {
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    await ended;
  }
}
async function start(expectFailure = false) {
  assert.equal(server, undefined);
  const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
    env,
    stdio: "ignore",
  });
  server = child;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      if (expectFailure) {
        assert.notEqual(child.exitCode, 0);
        return;
      }
      throw Error("Recovery test API exited unexpectedly");
    }
    if (!expectFailure) {
      try {
        if ((await fetch(`${origin}/v1/health`)).ok) return;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error(
    "Recovery test API did not reach its expected live/terminal state",
  );
}
async function call(
  path: string,
  token: string,
  body?: unknown,
  method?: string,
) {
  const response = await fetch(`${origin}/v1/${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
async function person(name: string) {
  const user = await db.user.create({
      data: {
        email: `${name}-${runId}@cubers.test`,
        displayName: "Synthetic recovery account",
        birthDate: "1990-01-01",
        region: "INTL",
        emailVerified: true,
        adultVerified: true,
        passwordHash: await passwordHash("synthetic-recovery-password"),
      },
    }),
    token = opaque(),
    session = await db.session.create({
      data: {
        userId: user.id,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  return { user, token, session };
}
async function allRecords() {
  const rows = [];
  for await (const row of journal.records()) rows.push(row);
  return rows;
}
before(
  async () => {
    const master = new PrismaClient({ datasourceUrl: masterUrl });
    await master.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    await master.$disconnect();
    root = await realpath(
      await mkdtemp(join(tmpdir(), "cubers-recovery-integration-")),
    );
    await chmod(root, 0o700);
    directory = join(root, "journal");
    keyPath = join(root, "key.json");
    await mkdir(directory, { mode: 0o700 });
    const base = Object.fromEntries(
      (await readFile(".env.example", "utf8"))
        .split("\n")
        .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
    env = {
      ...process.env,
      ...base,
      DATABASE_URL: url,
      NODE_ENV: "test",
      REGION: "INTL",
      PORT: "3103",
      WORKER_ENABLED: "false",
      AI_MODE: "disabled",
      AI_API_KEY: "",
      OPENAI_API_KEY: "",
      QWEN_API_KEY: "",
      S3_ACCESS_KEY: "S3RVER",
      S3_SECRET_KEY: "S3RVER",
      S3_BUCKET: "cubers-intl",
      DELETION_JOURNAL_MODE: "file",
      DELETION_JOURNAL_DIRECTORY: directory,
      DELETION_JOURNAL_KEY_FILE: keyPath,
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
    journal = await FileDeletionJournal.initialize(directory, keyPath, "INTL");
    await bindJournal(db as Db, journal, url);
    infra = new Infrastructure(readConfig(env));
    await start();
  },
  { timeout: 30000 },
);
after(async () => {
  await stop();
  await infra?.close();
  await db.$disconnect();
  const master = new PrismaClient({ datasourceUrl: masterUrl });
  if (!/^cubers_recovery_test_[a-f0-9]{8}$/.test(database))
    throw Error("Refusing cleanup outside the reserved test database");
  await master.$executeRawUnsafe(`DROP DATABASE "${database}"`);
  await master.$disconnect();
  if (root) await rm(root, { recursive: true, force: true });
});

test("confirmed HTTP account deletion is durably encrypted before acknowledgement and before database-only cleanup", async () => {
  const a = await person("accepted");
  assert.equal(
    (await call("me", a.token, { confirmation: "DELETE" }, "DELETE")).status,
    200,
  );
  const row = (await allRecords()).find((r) => r.ids.includes(a.user.id));
  assert.ok(row);
  assert.equal(
    (await db.deletionReceipt.findUniqueOrThrow({ where: { id: row.id } }))
      .digest,
    deletionDigest(row),
  );
  assert.ok(
    (await db.user.findUniqueOrThrow({ where: { id: a.user.id } })).deletedAt,
  );
  assert.equal((await call("me", a.token)).status, 401);
  assert.equal(
    (await readFile(join(directory, `${row.id}.journal`), "utf8")).includes(
      a.user.id,
    ),
    false,
  );
  assert.equal(await db.accountRemoval.count({ where: { id: a.user.id } }), 1);
});

test("journal storage failure cannot acknowledge deletion, mutate the account or revoke a still-valid session", async () => {
  const a = await person("storage-failure"),
    before = (await readdir(directory)).length;
  await chmod(directory, 0o500);
  try {
    assert.equal(
      (await call("me", a.token, { confirmation: "DELETE" }, "DELETE")).status,
      503,
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: a.user.id } })).deletedAt,
      null,
    );
    assert.equal((await call("me", a.token)).status, 200);
    assert.equal((await readdir(directory)).length, before);
  } finally {
    await chmod(directory, 0o700);
  }
  assert.equal(
    (await call("me", a.token, { confirmation: "DELETE" }, "DELETE")).status,
    200,
  );
});

test("startup replay disables a reconstructed older database state before HTTP, then removes orphaned account-prefix media", async () => {
  const a = await person("older-state"),
    other = await person("preserved"),
    ownKey = `INTL/${a.user.id}/${randomUUID()}/clean`,
    otherKey = `INTL/${other.user.id}/${randomUUID()}/clean`;
  for (const Key of [ownKey, otherKey])
    await infra.storage.send(
      new PutObjectCommand({
        Bucket: infra.config.S3_BUCKET,
        Key,
        Body: "private synthetic recovery media",
      }),
    );
  try {
    assert.equal(
      (await call("me", a.token, { confirmation: "DELETE" }, "DELETE")).status,
      200,
    );
    const row = (await allRecords()).find((r) => r.ids.includes(a.user.id))!;
    await stop();
    // This reconstructs pre-request database rows only. It is not a pg_dump/
    // pg_restore drill; that separate backup-tool acceptance remains required.
    await db.$transaction([
      db.deletionReceipt.delete({ where: { id: row.id } }),
      db.setting.deleteMany({ where: { key: `delete:${a.user.id}` } }),
      db.accountRemoval.deleteMany({ where: { id: a.user.id } }),
      db.user.update({ where: { id: a.user.id }, data: { deletedAt: null } }),
      db.session.create({ data: a.session }),
    ]);
    await start();
    assert.equal((await call("me", a.token)).status, 401);
    assert.equal((await call("me", other.token)).status, 200);
    assert.ok(
      (await db.user.findUniqueOrThrow({ where: { id: a.user.id } })).deletedAt,
    );
    await new Background(db as Db, infra).maintenance();
    assert.equal(await db.user.count({ where: { id: a.user.id } }), 0);
    await assert.rejects(
      infra.storage.send(
        new HeadObjectCommand({ Bucket: infra.config.S3_BUCKET, Key: ownKey }),
      ),
    );
    assert.equal(
      (
        await infra.storage.send(
          new HeadObjectCommand({
            Bucket: infra.config.S3_BUCKET,
            Key: otherKey,
          }),
        )
      ).ContentLength,
      32,
    );
    assert.equal(
      (await reconcileDeletionJournal(db as Db, readConfig(env))).applied,
      0,
    );
  } finally {
    await infra.delete(ownKey);
    await infra.delete(otherKey);
  }
});

test("a damaged accepted journal record prevents API startup even if its database receipt exists", async () => {
  const rows = await allRecords(),
    path = join(directory, `${rows[0].id}.journal`),
    original = await readFile(path);
  await stop();
  try {
    const box = JSON.parse(original.toString()),
      bytes = Buffer.from(box.ciphertext, "base64");
    bytes[0] ^= 1;
    box.ciphertext = bytes.toString("base64");
    await writeFile(path, JSON.stringify(box), { mode: 0o600 });
    await start(true);
    assert.ok(server?.exitCode !== null);
    await stop();
  } finally {
    await writeFile(path, original, { mode: 0o600 });
  }
  await start();
});

test("an externally recorded deletion survives a failed database transaction and is reapplied without acknowledging success", async () => {
  const { requestAccountDeletion } =
    await import("../../apps/api/src/recovery");
  const a = await person("transaction-rollback");
  const failing = {
    user: db.user,
    consent: db.consent,
    $transaction: (callback: any, options: any) =>
      db.$transaction(
        (tx) =>
          callback(
            new Proxy(tx, {
              get(target, property) {
                if (property === "deletionReceipt")
                  return {
                    findUnique: target.deletionReceipt.findUnique.bind(
                      target.deletionReceipt,
                    ),
                    create: async () => {
                      throw Error("Simulated database commit interruption");
                    },
                  };
                return Reflect.get(target, property);
              },
            }),
          ),
        options,
      ),
  } as unknown as Db;
  await assert.rejects(
    requestAccountDeletion(failing, readConfig(env), {
      user: a.user,
      sessionId: a.session.id,
    } as any),
    /Simulated database commit interruption/,
  );
  const record = (await allRecords()).find((row) =>
    row.ids.includes(a.user.id),
  );
  assert.ok(record);
  assert.equal(await db.deletionReceipt.count({ where: { id: record.id } }), 0);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: a.user.id } })).deletedAt,
    null,
  );
  assert.equal((await call("me", a.token)).status, 200);
  assert.equal(
    (await reconcileDeletionJournal(db as Db, readConfig(env))).applied,
    1,
  );
  assert.equal((await call("me", a.token)).status, 401);
  assert.equal(await db.deletionReceipt.count({ where: { id: record.id } }), 1);
});

test("account-prefix erasure pages through unknown restored objects and catches a late previously signed upload", async () => {
  const { ListObjectsV2Command, DeleteObjectsCommand } =
    await import("@aws-sdk/client-s3");
  const a = await person("prefix-pagination"),
    prefix = `INTL/${a.user.id}/`,
    keys = Array.from(
      { length: 205 },
      (_, i) =>
        `${prefix}restored/item-${i < 200 ? String(i).padStart(3, "0") : i === 200 ? "199-more" : String(i - 1).padStart(3, "0")}`,
    ),
    lateKey = `${prefix}${randomUUID()}/upload`,
    signed = await infra.uploadUrl(lateKey, "image/jpeg", 1);
  try {
    for (let i = 0; i < keys.length; i += 20)
      await Promise.all(
        keys.slice(i, i + 20).map((Key) =>
          infra.storage.send(
            new PutObjectCommand({
              Bucket: infra.config.S3_BUCKET,
              Key,
              Body: "x",
            }),
          ),
        ),
      );
    assert.equal(
      (await call("me", a.token, { confirmation: "DELETE" }, "DELETE")).status,
      200,
    );
    await new Background(db as Db, infra).maintenance();
    assert.equal(
      (
        await infra.storage.send(
          new ListObjectsV2Command({
            Bucket: infra.config.S3_BUCKET,
            Prefix: prefix,
            MaxKeys: 1000,
          }),
        )
      ).Contents?.length,
      5,
    );
    await db.accountRemoval.update({
      where: { id: a.user.id },
      data: { retryAt: new Date(0) },
    });
    await new Background(db as Db, infra).maintenance();
    assert.equal(
      (
        await infra.storage.send(
          new ListObjectsV2Command({
            Bucket: infra.config.S3_BUCKET,
            Prefix: prefix,
          }),
        )
      ).Contents?.length ?? 0,
      0,
    );
    const uploaded = await fetch(signed, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: Buffer.from("x"),
    });
    assert.equal(uploaded.status, 200);
    await db.accountRemoval.update({
      where: { id: a.user.id },
      data: { retryAt: new Date(0) },
    });
    await new Background(db as Db, infra).maintenance();
    await assert.rejects(
      infra.storage.send(
        new HeadObjectCommand({ Bucket: infra.config.S3_BUCKET, Key: lateKey }),
      ),
      (error: any) => error.$metadata?.httpStatusCode === 404,
    );
  } finally {
    for (let i = 0; i < keys.length; i += 200)
      await infra.storage.send(
        new DeleteObjectsCommand({
          Bucket: infra.config.S3_BUCKET,
          Delete: {
            Objects: [
              ...keys.slice(i, i + 200),
              ...(i === 0 ? [lateKey] : []),
            ].map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
  }
});

test("a removed accepted file is detected by the authenticated inventory before HTTP opens", async () => {
  const rows = await allRecords(),
    path = join(directory, `${rows[0].id}.journal`),
    original = await readFile(path);
  await stop();
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(path);
    await start(true);
    await stop();
  } finally {
    await writeFile(path, original, { mode: 0o600 });
  }
  await start();
});

test("a sealed restore cannot start the API, including when an operator selects development journaling off", async () => {
  await stop();
  await db.recoveryBinding.update({
    where: { id: "installation" },
    data: { state: "SEALED" },
  });
  try {
    await start(true);
    await stop();
    env.DELETION_JOURNAL_MODE = "disabled";
    await start(true);
    await stop();
  } finally {
    env.DELETION_JOURNAL_MODE = "file";
    await db.recoveryBinding.update({
      where: { id: "installation" },
      data: { state: "ACTIVE" },
    });
  }
  await start();
});

async function privateMedia(
  owner: string,
  purpose = "post",
  attemptId?: string,
) {
  const id = randomUUID(),
    key = `INTL/${owner}/${id}/clean`;
  const media = await db.media.create({
    data: {
      id,
      userId: owner,
      key,
      type: purpose === "evidence" ? "video/mp4" : "image/png",
      purpose,
      size: 1,
      status: "READY",
      attemptId,
      durationMs: 31000,
    },
  });
  await infra.storage.send(
    new PutObjectCommand({
      Bucket: infra.config.S3_BUCKET,
      Key: key,
      Body: "x",
    }),
  );
  return media;
}
async function recordedAttempt(owner: string, ageMs = 60000) {
  const room = await db.room.create({
    data: {
      code: randomUUID(),
      ownerId: owner,
      puzzle: "3x3",
      input: "scan",
      mode: "race",
      ranked: true,
      private: true,
    },
  });
  await db.roomMember.create({ data: { roomId: room.id, userId: owner } });
  const a = await db.attempt.create({
    data: {
      userId: owner,
      roomId: room.id,
      nonce: randomUUID(),
      scramble: [],
      status: "PROVISIONAL",
      recordingAt: new Date(Date.now() - 30000),
      finishedAt: new Date(),
      durationMs: 1000,
      createdAt: new Date(Date.now() - ageMs),
    },
  });
  const m = await privateMedia(owner, "evidence", a.id);
  return {
    a: await db.attempt.update({
      where: { id: a.id },
      data: {
        evidenceId: m.id,
        evidenceDeleteAt: new Date(a.createdAt.getTime() + 30 * 86400000),
      },
    }),
    m,
  };
}
test("individual media deletion is durable before HTTP acknowledgement and replay removes only its exact upload variants", async () => {
  const p = await person("media-erase"),
    m = await privateMedia(p.user.id),
    kept = await privateMedia(p.user.id);
  assert.equal(
    (await call(`media/${m.id}`, p.token, undefined, "DELETE")).status,
    200,
  );
  const record = (await allRecords()).find(
    (r) => r.version === 2 && r.kind === "MEDIA_ERASE" && r.mediaId === m.id,
  )!;
  assert.ok(record);
  assert.equal(record.version, 2);
  await db.$transaction([
    db.deletionReceipt.delete({ where: { id: record.id } }),
    db.mediaRecoveryState.delete({ where: { id: m.id } }),
    db.objectRemoval.deleteMany({ where: { id: m.id } }),
    db.media.update({ where: { id: m.id }, data: { status: "READY" } }),
  ]);
  await reconcileDeletionJournal(db as Db, readConfig(env));
  assert.equal(
    (await db.media.findUniqueOrThrow({ where: { id: m.id } })).status,
    "DELETING",
  );
  await new Background(db as Db, infra).maintenance();
  assert.equal(await db.media.count({ where: { id: m.id } }), 0);
  await assert.rejects(
    infra.storage.send(
      new HeadObjectCommand({ Bucket: infra.config.S3_BUCKET, Key: m.key }),
    ),
  );
  assert.equal(
    (
      await infra.storage.send(
        new HeadObjectCommand({
          Bucket: infra.config.S3_BUCKET,
          Key: kept.key,
        }),
      )
    ).ContentLength,
    1,
  );
  assert.equal((await call("me", p.token)).status, 200);
  await infra.delete(kept.key);
});
test("unavailable independent media journal cannot acknowledge or apply a file deletion", async () => {
  const p = await person("media-store-failure"),
    m = await privateMedia(p.user.id);
  await chmod(directory, 0o500);
  try {
    assert.equal(
      (await call(`media/${m.id}`, p.token, undefined, "DELETE")).status,
      503,
    );
    assert.equal(
      (await db.media.findUniqueOrThrow({ where: { id: m.id } })).status,
      "READY",
    );
    assert.equal(await db.mediaRecoveryState.count({ where: { id: m.id } }), 0);
  } finally {
    await chmod(directory, 0o700);
    await infra.delete(m.key);
  }
});
test("review and appeal retention changes are independently ordered; expiry and final erasure cannot be revived", async () => {
  const owner = await person("evidence-retention"),
    reviewer = await person("evidence-reviewer"),
    { a, m } = await recordedAttempt(owner.user.id, 10 * 86400000);
  const { authenticator } = await import("otplib");
  await db.user.update({
    where: { id: reviewer.user.id },
    data: { role: "ADMIN", mfaSecret: authenticator.generateSecret() },
  });
  await db.session.update({
    where: { id: reviewer.session.id },
    data: { mfaVerified: true },
  });
  const review = await call(`admin/attempts/${a.id}/review`, reviewer.token, {
    approve: false,
    reason: "Synthetic independent evidence review",
    evidenceChecked: true,
    uninterrupted: true,
    scrambleMatches: true,
    cubeAndHandsVisible: true,
    finalStateSolved: true,
  });
  assert.equal(review.status, 201);
  const finalized = await db.attempt.findUniqueOrThrow({ where: { id: a.id } });
  assert.ok(finalized.evidenceDeleteAt!.getTime() <= Date.now() + 7 * 86400000);
  const appeal = await call(`attempts/${a.id}/appeal`, owner.token, {
    reason: "Synthetic appeal with available evidence",
  });
  assert.equal(appeal.status, 201);
  const decisions = (await allRecords()).filter(
    (r) =>
      r.version === 2 && r.kind === "EVIDENCE_DEADLINE" && r.mediaId === m.id,
  );
  assert.equal(decisions.length, 2);
  await db.$transaction([
    db.deletionReceipt.deleteMany({
      where: { id: { in: decisions.map((r) => r.id) } },
    }),
    db.mediaRecoveryState.delete({ where: { id: m.id } }),
    db.attempt.update({
      where: { id: a.id },
      data: {
        evidenceDeleteAt: new Date(a.createdAt.getTime() + 30 * 86400000),
      },
    }),
  ]);
  await reconcileDeletionJournal(db as Db, readConfig(env));
  assert.equal(
    (
      await db.mediaRecoveryState.findUniqueOrThrow({ where: { id: m.id } })
    ).deadline!.getTime(),
    a.createdAt.getTime() + 30 * 86400000,
  );
  // An expired intermediate review must not destroy a valid later appeal.
  await journal.appendMedia(owner.user.id, {
    kind: "EVIDENCE_DEADLINE",
    mediaId: m.id,
    attemptId: a.id,
    attemptCreatedAt: a.createdAt.toISOString(),
    deadline: new Date(Date.now() - 1000).toISOString(),
  });
  await journal.appendMedia(owner.user.id, {
    kind: "EVIDENCE_DEADLINE",
    mediaId: m.id,
    attemptId: a.id,
    attemptCreatedAt: a.createdAt.toISOString(),
    deadline: new Date(a.createdAt.getTime() + 30 * 86400000).toISOString(),
  });
  await reconcileDeletionJournal(db as Db, readConfig(env));
  assert.equal(
    (await db.media.findUniqueOrThrow({ where: { id: m.id } })).status,
    "READY",
  );
  assert.equal((await call(`media/${m.id}`, owner.token)).status, 200);
  await db.attempt.update({
    where: { id: a.id },
    data: { evidenceDeleteAt: new Date(Date.now() + 4500) },
  });
  const capped = await call(`media/${m.id}`, owner.token);
  assert.equal(capped.status, 200);
  const signedSeconds = Number(
    new URL(capped.body.url).searchParams.get("X-Amz-Expires"),
  );
  assert.ok(signedSeconds >= 1 && signedSeconds <= 4);
  await db.attempt.update({
    where: { id: a.id },
    data: { evidenceDeleteAt: new Date(a.createdAt.getTime() + 30 * 86400000) },
  });

  await journal.appendMedia(owner.user.id, {
    kind: "MEDIA_ERASE",
    mediaId: m.id,
    key: m.key,
  });
  await journal.appendMedia(owner.user.id, {
    kind: "EVIDENCE_DEADLINE",
    mediaId: m.id,
    attemptId: a.id,
    attemptCreatedAt: a.createdAt.toISOString(),
    deadline: new Date(a.createdAt.getTime() + 30 * 86400000).toISOString(),
  });
  await reconcileDeletionJournal(db as Db, readConfig(env));
  assert.ok(
    (await db.mediaRecoveryState.findUniqueOrThrow({ where: { id: m.id } }))
      .erasedAt,
  );
  assert.equal((await call(`media/${m.id}`, owner.token)).status, 403);
  assert.equal(
    (
      await call(`attempts/${a.id}/appeal`, owner.token, {
        reason: "Cannot revive an erased recording",
      })
    ).status,
    400,
  );
  const expiredOwner = await person("expired-retention"),
    expired = await recordedAttempt(expiredOwner.user.id, 10 * 86400000);
  await db.attempt.update({
    where: { id: expired.a.id },
    data: { status: "REJECTED", evidenceDeleteAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (
      await call(`attempts/${expired.a.id}/appeal`, expiredOwner.token, {
        reason: "Expired footage cannot be appealed",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`admin/attempts/${expired.a.id}/review`, reviewer.token, {
        approve: false,
        reason: "Expired footage cannot be reviewed again",
        evidenceChecked: true,
        uninterrupted: true,
        scrambleMatches: true,
        cubeAndHandsVisible: true,
        finalStateSolved: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(`media/${expired.m.id}`, expiredOwner.token)).status,
    403,
  );
  await infra.delete(expired.m.key);
  await infra.delete(m.key);
});
test("guardian consent withdrawal is durable before acknowledgement and an older state cannot revive child recordings", async () => {
  const guardian = await person("withdraw-guardian"),
    child = await person("withdraw-child");
  await db.user.update({
    where: { id: child.user.id },
    data: { birthDate: "2020-01-01", adultVerified: false },
  });
  const c = await db.consent.create({
      data: {
        childId: child.user.id,
        guardianId: guardian.user.id,
        documentId: randomUUID(),
        status: "APPROVED",
        publicPosting: true,
        recording: true,
        reviewedAt: new Date(),
      },
    }),
    { a, m } = await recordedAttempt(child.user.id);
  assert.equal(
    (
      await call(
        `guardian/children/${child.user.id}/consent`,
        guardian.token,
        undefined,
        "DELETE",
      )
    ).status,
    200,
  );
  const record = (await allRecords()).find(
    (r) =>
      r.version === 2 &&
      r.kind === "CONSENT_WITHDRAWAL" &&
      r.ids[0] === child.user.id,
  )!;
  assert.ok(record);
  await db.$transaction([
    db.deletionReceipt.delete({ where: { id: record.id } }),
    db.consentWithdrawalRecovery.delete({ where: { id: child.user.id } }),
    db.consent.update({
      where: { id: c.id },
      data: { status: "APPROVED", recording: true, publicPosting: true },
    }),
    db.media.update({ where: { id: m.id }, data: { status: "READY" } }),
    db.attempt.update({
      where: { id: a.id },
      data: {
        status: "PROVISIONAL",
        evidenceDeleteAt: new Date(a.createdAt.getTime() + 30 * 86400000),
      },
    }),
    db.session.create({ data: child.session }),
  ]);
  await reconcileDeletionJournal(db as Db, readConfig(env));
  assert.equal(
    (await db.consent.findUniqueOrThrow({ where: { id: c.id } })).status,
    "REVOKED",
  );
  assert.equal(
    (await db.media.findUniqueOrThrow({ where: { id: m.id } })).status,
    "DELETING",
  );
  assert.equal(await db.session.count({ where: { userId: child.user.id } }), 0);
  assert.equal((await call("me", guardian.token)).status, 200);
  await infra.delete(m.key);
});

test("a media decision survives database rollback and object-store failure without duplicate durable erasure events", async () => {
  const p = await person("media-rollback"),
    m = await privateMedia(p.user.id),
    { recordMediaRecovery } = await import("../../apps/api/src/media-recovery");
  await assert.rejects(
    db.$transaction((tx) =>
      recordMediaRecovery(
        new Proxy(tx, {
          get(target, key) {
            if (key === "mediaRecoveryState")
              return {
                ...target.mediaRecoveryState,
                upsert: async () => {
                  throw Error("Synthetic commit interruption");
                },
              };
            return Reflect.get(target, key);
          },
        }),
        readConfig(env),
        p.user.id,
        { kind: "MEDIA_ERASE", mediaId: m.id, key: m.key },
      ),
    ),
    /durably recorded/,
  );
  assert.equal(
    (await db.media.findUniqueOrThrow({ where: { id: m.id } })).status,
    "READY",
  );
  const event = (await allRecords()).find(
    (r) => r.version === 2 && r.kind === "MEDIA_ERASE" && r.mediaId === m.id,
  )!;
  assert.ok(event);
  assert.equal(await db.deletionReceipt.count({ where: { id: event.id } }), 0);
  await reconcileDeletionJournal(db as Db, readConfig(env));
  const original = infra.delete;
  try {
    infra.delete = async () => {
      throw Error("Synthetic object storage failure");
    };
    await assert.rejects(
      new Background(db as Db, infra).maintenance(),
      /Synthetic object storage failure/,
    );
  } finally {
    infra.delete = original;
  }
  assert.ok(
    (await db.mediaRecoveryState.findUniqueOrThrow({ where: { id: m.id } }))
      .erasedAt,
  );
  await new Background(db as Db, infra).maintenance();
  assert.equal(await db.media.count({ where: { id: m.id } }), 0);
  assert.equal(
    (await allRecords()).filter(
      (r) => r.version === 2 && r.kind === "MEDIA_ERASE" && r.mediaId === m.id,
    ).length,
    1,
  );
});
