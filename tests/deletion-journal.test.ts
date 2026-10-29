import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  realpath,
  chmod,
  readFile,
  readdir,
  writeFile,
  rm,
  symlink,
  link,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  FileDeletionJournal,
  deletionDigest,
} from "../apps/api/src/deletion-journal";
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cubers-journal-")));
  await chmod(root, 0o700);
  const directory = join(root, "journal");
  await mkdir(directory, { mode: 0o700 });
  return { root, directory, key: join(root, "key.json") };
}
async function records(j: FileDeletionJournal) {
  const result = [];
  for await (const row of j.records()) result.push(row);
  return result;
}
test("deletion journal encrypts account identifiers and authenticates region, installation and individual records", async () => {
  const f = await fixture();
  try {
    const journal = await FileDeletionJournal.initialize(
        f.directory,
        f.key,
        "INTL",
      ),
      id = randomUUID(),
      row = await journal.append([id.toUpperCase(), id]);
    assert.deepEqual(row.ids, [id]);
    const path = join(f.directory, `${row.id}.journal`),
      raw = await readFile(path, "utf8");
    assert.equal(raw.includes(id), false);
    assert.deepEqual(await records(journal), [row]);
    assert.equal(deletionDigest(row).length, 64);
    await assert.rejects(FileDeletionJournal.load(f.directory, f.key, "CN"));
    const key = JSON.parse(await readFile(f.key, "utf8"));
    key.installationId = randomUUID();
    await writeFile(f.key, JSON.stringify(key), { mode: 0o600 });
    await assert.rejects(FileDeletionJournal.load(f.directory, f.key, "INTL"));
    const box = JSON.parse(raw);
    const bytes = Buffer.from(box.ciphertext, "base64");
    bytes[3] ^= 1;
    box.ciphertext = bytes.toString("base64");
    await writeFile(path, JSON.stringify(box));
    await assert.rejects(records(journal));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("parallel journal writers preserve every durable record and never expose incomplete staging files as accepted requests", async () => {
  const f = await fixture();
  try {
    const journal = await FileDeletionJournal.initialize(
        f.directory,
        f.key,
        "CN",
      ),
      id = randomUUID();
    const rows = await Promise.all(
      Array.from({ length: 32 }, () => journal.append([id])),
    );
    assert.equal(new Set(rows.map((r) => r.id)).size, 32);
    assert.equal((await records(journal)).length, 32);
    const encrypted = await Promise.all(
      rows.map((r) => readFile(join(f.directory, `${r.id}.journal`), "utf8")),
    );
    assert.equal(new Set(encrypted).size, 32);
    await writeFile(
      join(f.directory, `.${randomUUID()}.pending`),
      "interrupted unacknowledged write",
      { mode: 0o600 },
    );
    assert.equal((await records(journal)).length, 32);
    await writeFile(
      join(f.directory, `${randomUUID()}.journal`),
      "damaged accepted record",
      { mode: 0o600 },
    );
    await assert.rejects(records(journal));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("journal loading and replay reject links, unsafe permissions, unknown files and renamed records", async () => {
  const f = await fixture();
  try {
    const journal = await FileDeletionJournal.initialize(
        f.directory,
        f.key,
        "INTL",
      ),
      row = await journal.append([randomUUID()]),
      path = join(f.directory, `${row.id}.journal`);
    await chmod(f.key, 0o644);
    await assert.rejects(FileDeletionJournal.load(f.directory, f.key, "INTL"));
    await chmod(f.key, 0o600);
    const shadow = join(f.root, "shadow");
    await link(f.key, shadow);
    await assert.rejects(FileDeletionJournal.load(f.directory, f.key, "INTL"));
    await unlink(shadow);
    await symlink(f.directory, shadow);
    await assert.rejects(FileDeletionJournal.load(shadow, f.key, "INTL"));
    await unlink(shadow);
    await link(path, shadow);
    await assert.rejects(records(journal));
    await unlink(shadow);
    await writeFile(
      join(f.directory, `${randomUUID()}.journal`),
      await readFile(path),
      { mode: 0o600 },
    );
    await assert.rejects(records(journal));
    await assert.rejects(journal.append([]));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("production cannot opt out of independent deletion recovery or omit its storage/key configuration", async () => {
  const { readConfig } = await import("../apps/api/src/config");
  const base = {
    NODE_ENV: "production",
    REGION: "INTL",
    DATABASE_URL: "postgresql://synthetic@127.0.0.1/recovery_test",
    REDIS_URL: "redis://127.0.0.1:6389",
    S3_ENDPOINT: "https://storage.example.invalid",
    S3_BUCKET: "synthetic",
    S3_ACCESS_KEY: "synthetic",
    S3_SECRET_KEY: "synthetic",
    SMTP_URL: "smtp://127.0.0.1:10259",
    APP_ORIGIN: "https://app.example.invalid",
    ADMIN_ORIGIN: "https://admin.example.invalid",
    PUBLIC_RELEASE_APPROVED: "true",
    AI_MODE: "disabled",
  };
  assert.throws(
    () => readConfig(base),
    /Production requires an independently stored deletion journal/,
  );
  assert.throws(
    () => readConfig({ ...base, DELETION_JOURNAL_MODE: "file" }),
    /directory and key file/,
  );
  assert.equal(
    readConfig({
      ...base,
      DELETION_JOURNAL_MODE: "file",
      DELETION_JOURNAL_DIRECTORY: "/private/synthetic-journal",
      DELETION_JOURNAL_KEY_FILE: "/private/synthetic-key.json",
    }).DELETION_JOURNAL_MODE,
    "file",
  );
});

test("mixed media privacy events retain legacy account digests and replay in authenticated append order", async () => {
  const f = await fixture();
  try {
    const j = await FileDeletionJournal.initialize(f.directory, f.key, "INTL"),
      owner = randomUUID(),
      mediaId = randomUUID(),
      attemptId = randomUUID(),
      created = new Date(Date.now() - 10000).toISOString();
    const account = await j.append([randomUUID()]);
    assert.equal(account.version, 1);
    const deadline = await j.appendMedia(owner, {
      kind: "EVIDENCE_DEADLINE",
      mediaId,
      attemptId,
      attemptCreatedAt: created,
      deadline: new Date(Date.parse(created) + 7 * 86400000).toISOString(),
    });
    const erase = await j.appendMedia(owner, {
      kind: "MEDIA_ERASE",
      mediaId,
      key: `INTL/${owner}/${mediaId}/clean`,
    });
    const withdrawal = await j.appendMedia(owner, {
      kind: "CONSENT_WITHDRAWAL",
      cutoff: new Date().toISOString(),
    });
    const rows = await records(j);
    assert.deepEqual(
      rows.map((r) => r.id),
      [account.id, deadline.id, erase.id, withdrawal.id],
    );
    assert.deepEqual(
      rows.slice(1).map((r) => (r.version === 2 ? r.sequence : 0)),
      [2, 3, 4],
    );
    assert.equal((await j.checkpoint(1)).count, 1);
    assert.equal(
      (
        await readFile(join(f.directory, `${erase.id}.journal`), "utf8")
      ).includes(mediaId),
      false,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("media events cannot erase another owner or region, escape an object prefix or extend evidence past thirty days", async () => {
  const f = await fixture();
  try {
    const j = await FileDeletionJournal.initialize(f.directory, f.key, "CN"),
      owner = randomUUID(),
      mediaId = randomUUID(),
      created = new Date().toISOString();
    for (const key of [
      `INTL/${owner}/${mediaId}/clean`,
      `CN/${randomUUID()}/${mediaId}/clean`,
      `CN/${owner}/../clean`,
      `CN/${owner}/${mediaId}/other`,
    ])
      await assert.rejects(
        j.appendMedia(owner, { kind: "MEDIA_ERASE", mediaId, key }),
      );
    await assert.rejects(
      j.appendMedia(owner, {
        kind: "EVIDENCE_DEADLINE",
        mediaId,
        attemptId: randomUUID(),
        attemptCreatedAt: created,
        deadline: new Date(Date.parse(created) + 31 * 86400000).toISOString(),
      }),
    );
    await assert.rejects(
      j.appendMedia(owner, {
        kind: "CONSENT_WITHDRAWAL",
        cutoff: new Date(Date.now() + 120000).toISOString(),
      }),
    );
    const victim = randomUUID();
    await assert.rejects(
      j.appendMedia(owner, {
        kind: "MEDIA_ERASE",
        mediaId,
        key: `CN/${victim}/${mediaId}/clean`,
        ids: [victim],
      } as any),
    );
    assert.equal((await records(j)).length, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("retirement preserves chain checkpoints and absolute numbering while removing old identifiers and denying history below the floor", async () => {
  const f = await fixture(),
    now = Date.now();
  let clock = now - 32 * 86400000;
  try {
    const j = await FileDeletionJournal.initialize(
        f.directory,
        f.key,
        "INTL",
        () => clock,
      ),
      old = await j.append([randomUUID()]),
      owner = randomUUID(),
      media = randomUUID();
    const second = await j.appendMedia(owner, {
        kind: "MEDIA_ERASE",
        mediaId: media,
        key: `INTL/${owner}/${media}/clean`,
      }),
      floor = await j.checkpoint();
    clock = now;
    const recent = await j.appendMedia(owner, {
        kind: "MEDIA_ERASE",
        mediaId: randomUUID(),
        key: `INTL/${owner}/${randomUUID()}/clean`,
      }),
      latest = await j.checkpoint();
    await assert.rejects(j.retireThrough(3, latest.digest));
    assert.equal((await records(j)).length, 3);
    assert.deepEqual(await j.retireThrough(2, floor.digest), {
      retired: 2,
      floor: 2,
    });
    assert.deepEqual(
      (await records(j)).map((r) => r.id),
      [recent.id],
    );
    assert.equal((await j.floor()).count, 2);
    assert.deepEqual(await j.checkpoint(3), latest);
    await assert.rejects(j.checkpoint(1));
    const inventory = await readFile(
      join(f.directory, "inventory.json"),
      "utf8",
    );
    assert.equal(inventory.includes(old.id), false);
    assert.equal(inventory.includes(second.id), false);
    await assert.rejects(readFile(join(f.directory, old.id + ".journal")));
    const loaded = await FileDeletionJournal.load(f.directory, f.key, "INTL"),
      next = await loaded.appendMedia(owner, {
        kind: "CONSENT_WITHDRAWAL",
        cutoff: new Date(now).toISOString(),
      });
    assert.equal(next.version === 2 ? next.sequence : 0, 4);
    assert.deepEqual(await loaded.checkpoint(3), latest);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("a retirement interrupted after floor publication keeps exact unlink retries and cannot replay the retired record", async () => {
  const f = await fixture(),
    now = Date.now();
  let clock = now - 32 * 86400000;
  try {
    const j = await FileDeletionJournal.initialize(
        f.directory,
        f.key,
        "CN",
        () => clock,
      ),
      row = await j.append([randomUUID()]),
      checkpoint = await j.checkpoint(),
      path = join(f.directory, row.id + ".journal"),
      alias = join(f.root, "held-alias");
    clock = now;
    const publish = (j as any).publishInventory.bind(j);
    let injected = false;
    (j as any).publishInventory = async (body: any, ...args: any[]) => {
      await publish(body, ...args);
      if (body.baseCount && body.pending.length && !injected) {
        injected = true;
        await link(path, alias);
      }
    };
    await assert.rejects(j.retireThrough(1, checkpoint.digest));
    assert.ok(injected);
    assert.equal((await records(j)).length, 0);
    assert.equal((await j.floor()).count, 1);
    assert.equal(
      JSON.parse(await readFile(join(f.directory, "inventory.json"), "utf8"))
        .pending.length,
      1,
    );
    await unlink(alias);
    assert.deepEqual(await j.retireThrough(1, checkpoint.digest), {
      retired: 0,
      floor: 1,
    });
    await assert.rejects(readFile(path));
    assert.equal(
      JSON.parse(await readFile(join(f.directory, "inventory.json"), "utf8"))
        .pending.length,
      0,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("the independently authenticated source binding cannot be silently reassigned to another database", async () => {
  const f = await fixture();
  try {
    const j = await FileDeletionJournal.initialize(f.directory, f.key, "INTL");
    await j.bindSource("a".repeat(64));
    await j.bindSource("a".repeat(64));
    assert.equal(await j.source(), "a".repeat(64));
    await assert.rejects(j.bindSource("b".repeat(64)));
    assert.equal((await records(j)).length, 0);
    const path = join(f.directory, "source.json"),
      value = JSON.parse(await readFile(path, "utf8"));
    value.source = "b".repeat(64);
    await writeFile(path, JSON.stringify(value));
    await assert.rejects(j.source());
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
