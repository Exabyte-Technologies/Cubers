import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  realpath,
  chmod,
  rm,
  readFile,
  writeFile,
  unlink,
  readdir,
  symlink,
  link,
  rename,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { FileDeletionJournal } from "../apps/api/src/deletion-journal";
import {
  captureSnapshot,
  initializeSnapshotKey,
  verifySnapshot,
  databaseFingerprint,
  pgEnvironment,
} from "../apps/api/src/database-snapshot";
async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "cubers-snapshot-")),
  );
  await chmod(root, 0o700);
  const journalPath = join(root, "journal"),
    directory = join(root, "snapshots"),
    keys = join(root, "keys");
  for (const p of [journalPath, directory, keys])
    await mkdir(p, { mode: 0o700 });
  const journal = await FileDeletionJournal.initialize(
      journalPath,
      join(keys, "journal.json"),
      "INTL",
    ),
    key = join(keys, "backup.json"),
    source = "postgresql://synthetic:private@localhost/fixture?sslmode=disable";
  await initializeSnapshotKey(key, journal);
  return { root, directory, keys, journal, key, source };
}
const payload = Buffer.from(
  "PGDMP synthetic private account record ".repeat(1000),
);
test("snapshot encryption authenticates complete bounded streams, distinct key custody, regional installation and 30-day expiry", async () => {
  const f = await fixture();
  try {
    const m = await captureSnapshot(
        Readable.from([payload]),
        f.directory,
        f.key,
        f.journal,
        f.source,
      ),
      folder = join(f.directory, m.id);
    assert.equal(m.kind, "DATABASE_ONLY_SEALED");
    const encrypted = await readFile(join(folder, "database.enc"));
    assert.equal(encrypted.includes(Buffer.from("private account")), false);
    assert.equal(
      (await verifySnapshot(folder, f.key, f.journal)).manifest.id,
      m.id,
    );
    await assert.rejects(
      verifySnapshot(folder, f.key, f.journal, Date.parse(m.expiresAt)),
    );
    await initializeSnapshotKey(join(f.keys, "other.json"), f.journal);
    await assert.rejects(
      verifySnapshot(folder, join(f.keys, "other.json"), f.journal),
    );
    const otherDir = join(f.root, "other-journal");
    await mkdir(otherDir, { mode: 0o700 });
    const other = await FileDeletionJournal.initialize(
      otherDir,
      join(f.keys, "other-journal.json"),
      "CN",
    );
    await assert.rejects(verifySnapshot(folder, f.key, other));
    encrypted[20] ^= 1;
    await writeFile(join(folder, "database.enc"), encrypted);
    await assert.rejects(verifySnapshot(folder, f.key, f.journal));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("snapshot manifests and accepted deletion inventories reject truncation, forgery, missing files and snapshot rollback of current deletions", async () => {
  const f = await fixture();
  try {
    const first = await f.journal.append([randomUUID()]);
    const m = await captureSnapshot(
        Readable.from([payload]),
        f.directory,
        f.key,
        f.journal,
        f.source,
      ),
      folder = join(f.directory, m.id);
    await f.journal.append([randomUUID()]);
    assert.equal(
      (await verifySnapshot(folder, f.key, f.journal)).manifest.journal.count,
      1,
    );
    const manifestPath = join(folder, "manifest.json"),
      original = await readFile(manifestPath);
    const forged = JSON.parse(original.toString());
    forged.expiresAt = new Date(Date.now() + 31 * 86400000).toISOString();
    await writeFile(manifestPath, JSON.stringify(forged));
    await assert.rejects(verifySnapshot(folder, f.key, f.journal));
    await writeFile(manifestPath, original);
    const recordPath = join(f.journal.directory, `${first.id}.journal`),
      record = await readFile(recordPath);
    await unlink(recordPath);
    await assert.rejects(verifySnapshot(folder, f.key, f.journal));
    await writeFile(recordPath, record, { mode: 0o600 });
    await writeFile(join(folder, "database.enc"), Buffer.from("truncated"));
    await assert.rejects(verifySnapshot(folder, f.key, f.journal));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("failed producers remove their exact incomplete capture; unsafe/link destinations and overwritten keys are rejected", async () => {
  const f = await fixture();
  try {
    await assert.rejects(initializeSnapshotKey(f.key, f.journal));
    await assert.rejects(
      captureSnapshot(
        Readable.from([payload]),
        f.directory,
        f.key,
        f.journal,
        f.source,
        undefined,
        async () => {
          throw Error("dump failed after stdout");
        },
      ),
    );
    assert.deepEqual(await readdir(f.directory), []);
    const shortcut = join(f.root, "shortcut");
    await symlink(f.directory, shortcut);
    await assert.rejects(
      captureSnapshot(
        Readable.from([payload]),
        shortcut,
        f.key,
        f.journal,
        f.source,
      ),
    );
    await chmod(f.key, 0o644);
    await assert.rejects(
      captureSnapshot(
        Readable.from([payload]),
        f.directory,
        f.key,
        f.journal,
        f.source,
      ),
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("stream, empty-dump and journal failures remove incomplete outputs while preserving completed snapshots and key custody", async () => {
  const f = await fixture();
  try {
    const accepted = await captureSnapshot(
      Readable.from([payload]),
      f.directory,
      f.key,
      f.journal,
      f.source,
    );
    const originalKey = await readFile(f.key),
      acceptedBytes = await readFile(
        join(f.directory, accepted.id, "database.enc"),
      );
    await assert.rejects(
      captureSnapshot(
        Readable.from(
          (async function* () {
            yield payload;
            await new Promise((resolve) => setImmediate(resolve));
            throw Error("interrupted output");
          })(),
        ),
        f.directory,
        f.key,
        f.journal,
        f.source,
      ),
      /interrupted output/,
    );
    await assert.rejects(
      captureSnapshot(
        Readable.from([]),
        f.directory,
        f.key,
        f.journal,
        f.source,
      ),
    );
    const checkpoint = f.journal.checkpoint.bind(f.journal);
    f.journal.checkpoint = async () => {
      throw Error("unavailable inventory");
    };
    await assert.rejects(
      captureSnapshot(
        Readable.from([payload]),
        f.directory,
        f.key,
        f.journal,
        f.source,
      ),
      /unavailable inventory/,
    );
    f.journal.checkpoint = checkpoint;
    assert.deepEqual(await readdir(f.directory), [accepted.id]);
    assert.deepEqual(await readFile(f.key), originalKey);
    assert.deepEqual(
      await readFile(join(f.directory, accepted.id, "database.enc")),
      acceptedBytes,
    );
    assert.equal(
      (await verifySnapshot(join(f.directory, accepted.id), f.key, f.journal))
        .manifest.id,
      accepted.id,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("failed-capture cleanup refuses unexpected files, symlink/hardlink outputs and replacement directories without deleting unrelated data", async () => {
  for (const kind of [
    "unexpected",
    "symlink",
    "hardlink",
    "replacement",
  ] as const) {
    const f = await fixture();
    try {
      const sentinel = join(f.root, "unrelated-private-file");
      await writeFile(sentinel, "preserve unrelated data", { mode: 0o600 });
      let folder = "";
      await assert.rejects(
        captureSnapshot(
          Readable.from([payload]),
          f.directory,
          f.key,
          f.journal,
          f.source,
          undefined,
          async () => {
            folder = join(f.directory, (await readdir(f.directory))[0]);
            if (kind === "unexpected") {
              await writeFile(
                join(folder, "operator-note"),
                "preserve this too",
                { mode: 0o600 },
              );
            } else if (kind === "symlink") {
              await unlink(join(folder, "database.enc"));
              await symlink(sentinel, join(folder, "database.enc"));
            } else if (kind === "hardlink") {
              await link(sentinel, join(folder, "manifest.json"));
            } else {
              await rename(folder, folder + ".moved");
              await mkdir(folder, { mode: 0o700 });
              await writeFile(
                join(folder, "database.enc"),
                "replacement directory",
                { mode: 0o600 },
              );
            }
            throw Error("producer failed");
          },
        ),
        (error: unknown) =>
          error instanceof AggregateError &&
          /cleanup is incomplete/.test(error.message) &&
          error.errors[0].message === "producer failed",
      );
      assert.equal(await readFile(sentinel, "utf8"), "preserve unrelated data");
      if (kind === "unexpected") {
        assert.equal(
          await readFile(join(folder, "operator-note"), "utf8"),
          "preserve this too",
        );
        assert.ok((await readFile(join(folder, "database.enc"))).length);
      } else if (kind === "replacement") {
        assert.equal(
          await readFile(join(folder, "database.enc"), "utf8"),
          "replacement directory",
        );
        assert.ok(
          (await readFile(join(folder + ".moved", "database.enc"))).length,
        );
      } else {
        assert.ok((await readdir(folder)).includes("database.enc"));
      }
      await assert.rejects(verifySnapshot(folder, f.key, f.journal));
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  }
});
test("PostgreSQL clients receive credentials through isolated environment fields and target fingerprints ignore passwords", () => {
  const u =
      "postgresql://a%40b:private%24%28value%29@localhost:5544/recovery?schema=public&sslmode=disable",
    env = pgEnvironment(u);
  assert.equal(env.PGPASSWORD, "private$(value)");
  assert.equal(env.PGUSER, "a@b");
  assert.equal(env.PGAPPNAME, "cubers-offline-snapshot");
  assert.equal((env as any).AI_API_KEY, undefined);
  assert.equal(
    databaseFingerprint(u),
    databaseFingerprint(u.replace("private%24%28value%29", "different")),
  );
  assert.throws(() =>
    pgEnvironment("postgresql://a@localhost/x?options=-cwhatever"),
  );
  assert.throws(() =>
    pgEnvironment("postgresql://a@localhost/x?sslmode=prefer"),
  );
});

test("a snapshot with a replay marker below retired history is refused while a fully applied checkpoint remains verifiable", async () => {
  const f = await fixture();
  try {
    // The independent event is old, but both archives are captured now.
    const old = await FileDeletionJournal.initialize(
      await (async () => {
        const p = join(f.root, "old-journal");
        await mkdir(p, { mode: 0o700 });
        return p;
      })(),
      join(f.root, "old-journal-key.json"),
      "INTL",
      () => Date.now() - 32 * 86400000,
    );
    const key = join(f.root, "applied-key.json");
    await initializeSnapshotKey(key, old);
    const before = await old.checkpoint();
    await old.append([randomUUID()]);
    const applied = await old.checkpoint();
    const stale = await captureSnapshot(
        Readable.from([payload]),
        f.directory,
        key,
        old,
        f.source,
        undefined,
        undefined,
        before,
      ),
      fresh = await captureSnapshot(
        Readable.from([payload]),
        f.directory,
        key,
        old,
        f.source,
        undefined,
        undefined,
        applied,
      );
    await old.retireThrough(1, applied.digest, Date.now());
    await assert.rejects(verifySnapshot(join(f.directory, stale.id), key, old));
    assert.equal(
      (await verifySnapshot(join(f.directory, fresh.id), key, old)).manifest
        .applied.count,
      1,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
