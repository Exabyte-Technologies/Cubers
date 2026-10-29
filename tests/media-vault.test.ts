import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, chmod, realpath, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  FileDeletionJournal,
  DeletionRecord,
} from "../apps/api/src/deletion-journal";
import {
  backupPrivacy,
  mediaBackupExpiry,
} from "../apps/api/src/media-vault-policy";
import { initializeMediaVault } from "../apps/api/src/media-vault";
const DAY = 86400000;
async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "cubers-media-vault-")),
  );
  await chmod(root, 0o700);
  const journalPath = join(root, "journal"),
    keys = join(root, "keys"),
    directory = join(root, "artifacts"),
    secretDirectory = join(root, "vault-keys");
  for (const p of [journalPath, keys, directory, secretDirectory])
    await mkdir(p, { mode: 0o700 });
  const journal = await FileDeletionJournal.initialize(
    journalPath,
    join(keys, "journal.json"),
    "INTL",
  );
  return {
    root,
    journal,
    paths: {
      directory,
      secretDirectory,
      masterKeyFile: join(keys, "master.json"),
    },
  };
}
test("backup policy honors terminal erasure, owner deletion, recording withdrawal and bounded newer appeals", () => {
  const owner = randomUUID(),
    mediaId = randomUUID(),
    attemptId = randomUUID(),
    installationId = randomUUID(),
    now = Date.now(),
    entry = {
      mediaId,
      userId: owner,
      purpose: "evidence",
      createdAt: new Date(now - DAY).toISOString(),
      hardExpiresAt: new Date(now + 20 * DAY).toISOString(),
      initialDeadline: new Date(now + 6 * DAY).toISOString(),
      policySequence: 1,
    };
  const record = (kind: string, sequence: number, extra: any) =>
    DeletionRecord.parse({
      version: 2,
      id: randomUUID(),
      region: "INTL",
      installationId,
      requestedAt: new Date(now).toISOString(),
      ids: [owner],
      sequence,
      kind,
      ...extra,
    });
  const extended = record("EVIDENCE_DEADLINE", 2, {
    mediaId,
    attemptId,
    attemptCreatedAt: new Date(now - DAY).toISOString(),
    deadline: new Date(now + 29 * DAY).toISOString(),
  });
  assert.equal(
    mediaBackupExpiry(entry, backupPrivacy([extended])),
    now + 20 * DAY,
  );
  const erased = record("MEDIA_ERASE", 3, {
    mediaId,
    key: `INTL/${owner}/${mediaId}/clean`,
  });
  assert.equal(mediaBackupExpiry(entry, backupPrivacy([erased, extended])), 0);
  const withdrawn = record("CONSENT_WITHDRAWAL", 4, {
    cutoff: new Date(now).toISOString(),
  });
  assert.equal(mediaBackupExpiry(entry, backupPrivacy([withdrawn])), 0);
  assert.equal(
    mediaBackupExpiry(
      { ...entry, purpose: "post" },
      backupPrivacy([withdrawn]),
    ),
    now + 6 * DAY,
  );
  const account = DeletionRecord.parse({
    version: 1,
    id: randomUUID(),
    region: "INTL",
    installationId,
    requestedAt: new Date(now).toISOString(),
    ids: [owner],
  });
  assert.equal(mediaBackupExpiry(entry, backupPrivacy([account])), 0);
});
test("destructive vault maintenance serializes with an appeal and expired admission cannot append after waiting", async () => {
  const f = await fixture();
  try {
    let release!: () => void, held!: () => void;
    const ready = new Promise<void>((r) => (held = r)),
      gate = new Promise<void>((r) => (release = r));
    const lock = f.journal.exclusive(async (rows) => {
      assert.equal(rows.length, 0);
      held();
      await gate;
    });
    await ready;
    const pending = f.journal.appendMedia(
      randomUUID(),
      { kind: "CONSENT_WITHDRAWAL", cutoff: new Date().toISOString() },
      new Date(Date.now() + 30),
    );
    const rejected = assert.rejects(pending);
    await new Promise((r) => setTimeout(r, 60));
    release();
    await lock;
    await rejected;
    let count = 0;
    for await (const ignored of f.journal.records()) {
      void ignored;
      count++;
    }
    assert.equal(count, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("media vault master keys stay separate from ciphertext and cannot be overwritten or initialized through aliases", async () => {
  const f = await fixture();
  try {
    await initializeMediaVault(f.paths, f.journal);
    await assert.rejects(initializeMediaVault(f.paths, f.journal));
    const alias = join(f.root, "alias");
    await symlink(f.paths.directory, alias);
    await assert.rejects(
      initializeMediaVault({ ...f.paths, directory: alias }, f.journal),
    );
    await assert.rejects(
      initializeMediaVault(
        { ...f.paths, secretDirectory: f.paths.directory },
        f.journal,
      ),
    );
    await assert.rejects(
      initializeMediaVault(
        { ...f.paths, masterKeyFile: join(f.paths.directory, "unsafe.json") },
        f.journal,
      ),
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
