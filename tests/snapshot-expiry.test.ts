import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  realpath,
  mkdir,
  chmod,
  rm,
  readFile,
  writeFile,
  readdir,
  unlink,
  symlink,
  link,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { FileDeletionJournal } from "../apps/api/src/deletion-journal";
import {
  captureSnapshot,
  initializeSnapshotKey,
  databaseFingerprint,
  verifySnapshot,
} from "../apps/api/src/database-snapshot";
import { sweepSnapshotExpiry } from "../apps/api/src/snapshot-expiry";
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cubers-expiry-")));
  await chmod(root, 0o700);
  const directory = join(root, "archives"),
    keys = join(root, "keys"),
    history = join(root, "history");
  for (const p of [directory, keys, history]) await mkdir(p, { mode: 0o700 });
  const journal = await FileDeletionJournal.initialize(
      history,
      join(keys, "journal.json"),
      "INTL",
    ),
    keyFile = join(keys, "snapshot.json"),
    databaseUrl =
      "postgresql://synthetic:private@localhost/fixture?sslmode=disable";
  await journal.bindSource(databaseFingerprint(databaseUrl));
  await initializeSnapshotKey(keyFile, journal);
  const options = { directory, keyFile, journal, databaseUrl };
  async function capture(age = 31, source = databaseUrl) {
    return captureSnapshot(
      Readable.from(["PGDMP synthetic archive"]),
      directory,
      keyFile,
      journal,
      source,
      new Date(Date.now() - age * 86400000).toISOString(),
    );
  }
  return { root, keys, ...options, options, capture };
}
test("standalone expiry removes authenticated 30-day archives and preserves live archives and shared keys", async () => {
  const f = await fixture();
  try {
    const old = await f.capture(),
      fresh = await f.capture(0),
      key = await readFile(f.keyFile),
      folder = join(f.directory, old.id);
    await assert.rejects(verifySnapshot(folder, f.keyFile, f.journal));
    assert.deepEqual(await sweepSnapshotExpiry(f.options), {
      failures: 0,
      bundles: 2,
      targets: 0,
      purged: 1,
    });
    assert.deepEqual(await readdir(f.directory), [fresh.id]);
    assert.deepEqual(await readFile(f.keyFile), key);
    const checked = await verifySnapshot(
      join(f.directory, fresh.id),
      f.keyFile,
      f.journal,
    );
    checked.key.fill(0);
    assert.equal(
      (
        await sweepSnapshotExpiry({
          ...f.options,
          now: Date.parse(fresh.expiresAt) - 1,
        })
      ).purged,
      0,
    );
    assert.equal(
      (
        await sweepSnapshotExpiry({
          ...f.options,
          now: Date.parse(fresh.expiresAt),
        })
      ).purged,
      1,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("expiry rejects source and credential substitutions, altered manifests and foreign archives", async () => {
  const f = await fixture();
  try {
    const old = await f.capture(),
      foreign = await f.capture(31, "postgresql://synthetic@elsewhere/other"),
      folder = join(f.directory, old.id),
      manifest = join(folder, "manifest.json"),
      original = await readFile(manifest);
    await assert.rejects(
      sweepSnapshotExpiry({
        ...f.options,
        databaseUrl: "postgresql://synthetic@elsewhere/other",
      }),
    );
    const changed = JSON.parse(original.toString());
    changed.expiresAt = new Date(0).toISOString();
    await writeFile(manifest, JSON.stringify(changed));
    assert.equal((await sweepSnapshotExpiry(f.options)).failures, 2);
    assert.ok((await readdir(f.directory)).includes(foreign.id));
    await writeFile(manifest, original);
    const other = join(f.keys, "other.json");
    await initializeSnapshotKey(other, f.journal);
    assert.equal(
      (await sweepSnapshotExpiry({ ...f.options, keyFile: other })).failures,
      2,
    );
    assert.equal((await sweepSnapshotExpiry(f.options)).purged, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("expiry resumes after durable archive unlink or final manifest unlink and refuses incomplete captures", async () => {
  const f = await fixture();
  try {
    const a = await f.capture(),
      b = await f.capture(),
      c = await f.capture();
    await unlink(join(f.directory, a.id, "database.enc"));
    for (const name of ["database.enc", "manifest.json"])
      await unlink(join(f.directory, b.id, name));
    await unlink(join(f.directory, c.id, "manifest.json"));
    assert.deepEqual(await sweepSnapshotExpiry(f.options), {
      failures: 1,
      bundles: 3,
      targets: 0,
      purged: 2,
    });
    assert.deepEqual(await readdir(f.directory), [c.id]);
    assert.ok((await readFile(join(f.directory, c.id, "database.enc"))).length);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("expiry refuses aliases, extra files and content corruption while continuing other owned archives", async () => {
  const f = await fixture();
  try {
    const archives = await Promise.all([
      f.capture(),
      f.capture(),
      f.capture(),
      f.capture(),
    ]);
    const [a, b, c] = archives.map((m) => join(f.directory, m.id));
    await writeFile(join(a, "unrelated.txt"), "preserve", { mode: 0o600 });
    const original = await readFile(join(b, "database.enc"));
    await unlink(join(b, "database.enc"));
    await symlink(join(c, "database.enc"), join(b, "database.enc"));
    const corrupt = Buffer.from(original);
    corrupt[0] ^= 1;
    await writeFile(join(c, "database.enc"), corrupt);
    const result = await sweepSnapshotExpiry(f.options);
    assert.equal(result.failures, 3);
    assert.equal(result.purged, 1);
    assert.equal(await readFile(join(a, "unrelated.txt"), "utf8"), "preserve");
    assert.deepEqual(await readFile(join(c, "database.enc")), corrupt);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("expiry fails closed on unsafe roots, hard links, FIFO metadata, stale locks and oversized inventories", async () => {
  const f = await fixture();
  try {
    await f.capture();
    await mkdir(join(f.directory, ".snapshot-expiry-lock"), { mode: 0o700 });
    await assert.rejects(sweepSnapshotExpiry(f.options));
    await rm(join(f.directory, ".snapshot-expiry-lock"), { recursive: true });
    const name = (await readdir(f.directory))[0],
      folder = join(f.directory, name);
    await link(join(folder, "manifest.json"), join(f.root, "alias"));
    assert.equal((await sweepSnapshotExpiry(f.options)).failures, 1);
    await unlink(join(f.root, "alias"));
    await chmod(f.directory, 0o755);
    await assert.rejects(sweepSnapshotExpiry(f.options));
    await chmod(f.directory, 0o700);
    for (let i = 0; i < 1000; i++)
      await mkdir(join(f.directory, randomUUID()), { mode: 0o700 });
    await assert.rejects(sweepSnapshotExpiry(f.options));
    assert.ok((await readdir(folder)).includes("database.enc"));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("expiry cancellation admits no archive deletion and retains independent regional custody", async () => {
  const f = await fixture();
  try {
    await f.capture();
    const stop = new AbortController();
    stop.abort();
    assert.deepEqual(
      await sweepSnapshotExpiry({ ...f.options, signal: stop.signal }),
      { failures: 0, bundles: 0, targets: 0, purged: 0 },
    );
    const alias = join(f.root, "alias");
    await symlink(f.directory, alias);
    await assert.rejects(
      sweepSnapshotExpiry({ ...f.options, directory: alias }),
    );
    assert.equal((await readdir(f.directory)).length, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("FIFO metadata is rejected promptly instead of blocking a cleanup pass", async () => {
  const f = await fixture();
  try {
    const m = await f.capture(),
      path = join(f.directory, m.id, "manifest.json");
    await unlink(path);
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)("mkfifo", ["-m", "600", path]);
    const result = await sweepSnapshotExpiry(f.options);
    assert.equal(result.failures, 1);
    assert.equal(result.purged, 0);
    assert.ok((await readFile(join(f.directory, m.id, "database.enc"))).length);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("expired archives remain removable after authenticated retirement of their historical journal checkpoint", async () => {
  const f = await fixture();
  try {
    const path = join(f.root, "old-history");
    await mkdir(path, { mode: 0o700 });
    const j = await FileDeletionJournal.initialize(
      path,
      join(f.keys, "old-journal.json"),
      "INTL",
      () => Date.now() - 40 * 86400000,
    );
    await j.bindSource(databaseFingerprint(f.databaseUrl));
    await j.append([randomUUID()]);
    const checkpoint = await j.checkpoint(),
      keyFile = join(f.keys, "old-snapshot.json");
    await initializeSnapshotKey(keyFile, j);
    await captureSnapshot(
      Readable.from(["PGDMP retired synthetic record"]),
      f.directory,
      keyFile,
      j,
      f.databaseUrl,
      new Date(Date.now() - 35 * 86400000).toISOString(),
    );
    await j.retireThrough(checkpoint.count, checkpoint.digest, Date.now());
    assert.equal((await j.view()).records.length, 0);
    assert.equal(
      (await sweepSnapshotExpiry({ ...f.options, journal: j, keyFile })).purged,
      1,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
