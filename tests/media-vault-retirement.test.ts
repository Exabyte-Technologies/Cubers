import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  realpath,
  mkdir,
  chmod,
  rm,
  writeFile,
  readFile,
  unlink,
  readdir,
  link,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes, createHash, createHmac } from "node:crypto";
import { FileDeletionJournal } from "../apps/api/src/deletion-journal";
import { canonicalSnapshotJson } from "../apps/api/src/database-snapshot";
import {
  initializeMediaVault,
  pruneMediaVault,
} from "../apps/api/src/media-vault";
import {
  signTargetRetirement,
  readTargetRetirement,
  RetiredMediaTarget,
} from "../apps/api/src/media-vault-retirement";
async function fixture(age = 31) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "cubers-vault-retirement-")),
  );
  await chmod(root, 0o700);
  const history = join(root, "journal"),
    keys = join(root, "keys"),
    directory = join(root, "artifacts"),
    secretDirectory = join(root, "bundles");
  for (const p of [history, keys, directory, secretDirectory])
    await mkdir(p, { mode: 0o700 });
  const j = await FileDeletionJournal.initialize(
      history,
      join(keys, "journal.json"),
      "INTL",
    ),
    paths = {
      directory,
      secretDirectory,
      masterKeyFile: join(keys, "master.json"),
    };
  await initializeMediaVault(paths, j);
  const master = Buffer.from(
      JSON.parse(await readFile(paths.masterKeyFile, "utf8")).key,
      "base64",
    ),
    id = randomUUID(),
    batchId = randomUUID(),
    folder = join(secretDirectory, id),
    source = createHash("sha256").update("synthetic-source").digest("hex"),
    createdAt = new Date(Date.now() - age * 86400000).toISOString(),
    expiresAt = new Date(Date.parse(createdAt) + 30 * 86400000).toISOString();
  await mkdir(folder, { mode: 0o700 });
  await j.bindSource(source);
  const body = {
    region: j.region,
    installationId: j.installationId,
    journalKeyId: j.keyId,
    bundleId: id,
    version: 2,
    createdAt,
    expiresAt,
    source,
    status: "PURGED",
    indexDigest: randomBytes(32).toString("hex"),
    journal: await j.checkpoint(),
    objects: [randomUUID()],
    purged: [],
  };
  await writeFile(
    join(folder, "control.json"),
    JSON.stringify({
      ...body,
      authentication: createHmac("sha256", master)
        .update("cubers-media-vault-control-v1")
        .update(canonicalSnapshotJson(body))
        .digest("hex"),
    }),
    { mode: 0o600 },
  );
  const proof = signTargetRetirement(
      {
        version: 1,
        kind: "RETIRED_MEDIA_TARGET",
        region: j.region,
        installationId: j.installationId,
        journalKeyId: j.keyId,
        bundleId: id,
        batchId,
        source,
        snapshotId: randomUUID(),
        indexDigest: body.indexDigest,
        target: randomBytes(32).toString("hex"),
        storage: randomBytes(32).toString("hex"),
        bucket: "synthetic-private-target",
        expiresAt,
        completedAt: new Date().toISOString(),
        objects: 1,
      },
      master,
    ),
    binding = {
      region: j.region,
      installationId: j.installationId,
      journalKeyId: j.keyId,
      bundleId: id,
      batchId,
      source,
      expiresAt,
      indexDigest: body.indexDigest,
    };
  async function target(terminal = false) {
    const parent = join(folder, "restores");
    await mkdir(parent, { mode: 0o700 });
    const path = join(parent, batchId);
    await mkdir(path, { mode: 0o700 });
    if (terminal)
      await writeFile(join(path, "retired.json"), JSON.stringify(proof), {
        mode: 0o600,
      });
    return path;
  }
  return {
    root,
    j,
    paths,
    master,
    id,
    batchId,
    folder,
    proof,
    binding,
    target,
  };
}
test("terminal target receipts contain only bounded destination identity and aggregate counts", async () => {
  const f = await fixture();
  try {
    const path = await f.target(true),
      proof = await readTargetRetirement(
        join(path, "retired.json"),
        f.binding,
        f.master,
      );
    assert.deepEqual(proof, f.proof);
    for (const name of [
      "userId",
      "mediaId",
      "key",
      "sha256",
      "purged",
      "objectsList",
    ])
      assert.equal(Object.hasOwn(proof!, name), false);
    assert.equal(
      RetiredMediaTarget.safeParse({ ...proof, userId: randomUUID() }).success,
      false,
    );
    assert.equal(
      RetiredMediaTarget.safeParse({ ...proof, objects: 10001 }).success,
      false,
    );
  } finally {
    f.master.fill(0);
    await rm(f.root, { recursive: true, force: true });
  }
});
test("terminal receipts reject substitutions, changed counts, wrong keys and hard links", async () => {
  const f = await fixture();
  try {
    const folder = await f.target(true),
      path = join(folder, "retired.json");
    await assert.rejects(
      readTargetRetirement(path, { ...f.binding, region: "CN" }, f.master),
    );
    await assert.rejects(
      readTargetRetirement(
        path,
        { ...f.binding, source: randomBytes(32).toString("hex") },
        f.master,
      ),
    );
    await assert.rejects(
      readTargetRetirement(path, f.binding, randomBytes(32)),
    );
    await writeFile(path, JSON.stringify({ ...f.proof, objects: 2 }));
    await assert.rejects(readTargetRetirement(path, f.binding, f.master));
    await writeFile(path, JSON.stringify(f.proof));
    await link(path, join(f.root, "alias"));
    await assert.rejects(readTargetRetirement(path, f.binding, f.master));
  } finally {
    f.master.fill(0);
    await rm(f.root, { recursive: true, force: true });
  }
});
test("expired purged controls drop per-object references while retaining a signed terminal installation marker", async () => {
  const f = await fixture();
  try {
    const key = await readFile(f.paths.masterKeyFile);
    await pruneMediaVault(f.paths, f.j, f.id);
    const c = JSON.parse(
      await readFile(join(f.folder, "control.json"), "utf8"),
    );
    assert.equal(c.version, 3);
    assert.equal(c.status, "PURGED");
    assert.deepEqual(c.purged, []);
    for (const name of ["objects", "journal", "indexDigest"])
      assert.equal(Object.hasOwn(c, name), false);
    assert.deepEqual(await readFile(f.paths.masterKeyFile), key);
    await pruneMediaVault(f.paths, f.j, f.id);
    assert.deepEqual(
      JSON.parse(await readFile(join(f.folder, "control.json"), "utf8")),
      c,
    );
  } finally {
    f.master.fill(0);
    await rm(f.root, { recursive: true, force: true });
  }
});
test("live controls and unfinished target inventories retain the references still needed for cleanup", async () => {
  const live = await fixture(1),
    pending = await fixture();
  try {
    await pruneMediaVault(live.paths, live.j, live.id);
    assert.equal(
      JSON.parse(await readFile(join(live.folder, "control.json"), "utf8"))
        .version,
      2,
    );
    const target = await pending.target();
    await writeFile(
      join(target, "inventory.json"),
      "synthetic unfinished custody",
      { mode: 0o600 },
    );
    await pruneMediaVault(pending.paths, pending.j, pending.id);
    assert.equal(
      JSON.parse(await readFile(join(pending.folder, "control.json"), "utf8"))
        .version,
      2,
    );
    assert.equal(
      await readFile(join(target, "inventory.json"), "utf8"),
      "synthetic unfinished custody",
    );
  } finally {
    for (const f of [live, pending]) {
      f.master.fill(0);
      await rm(f.root, { recursive: true, force: true });
    }
  }
});
test("source compaction waits for completed target metadata removal and verifies every terminal signature", async () => {
  const f = await fixture();
  try {
    const folder = await f.target(true),
      inventory = join(folder, "inventory.json");
    await writeFile(inventory, "synthetic private inventory", { mode: 0o600 });
    await pruneMediaVault(f.paths, f.j, f.id);
    assert.equal(
      JSON.parse(await readFile(join(f.folder, "control.json"), "utf8"))
        .version,
      2,
    );
    await unlink(inventory);
    await writeFile(
      join(folder, "retired.json"),
      JSON.stringify({ ...f.proof, objects: 2 }),
    );
    await assert.rejects(pruneMediaVault(f.paths, f.j, f.id));
    assert.equal(
      JSON.parse(await readFile(join(f.folder, "control.json"), "utf8"))
        .version,
      2,
    );
    await writeFile(join(folder, "retired.json"), JSON.stringify(f.proof));
    await pruneMediaVault(f.paths, f.j, f.id);
    assert.equal(
      JSON.parse(await readFile(join(f.folder, "control.json"), "utf8"))
        .version,
      3,
    );
    assert.deepEqual(await readdir(folder), ["retired.json"]);
    assert.ok(
      await readTargetRetirement(
        join(folder, "retired.json"),
        { ...f.binding, indexDigest: undefined },
        f.master,
      ),
    );
  } finally {
    f.master.fill(0);
    await rm(f.root, { recursive: true, force: true });
  }
});
test("unknown private custody files are preserved for operator investigation", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.folder, "unrelated.json"), "preserve", {
      mode: 0o600,
    });
    await assert.rejects(pruneMediaVault(f.paths, f.j, f.id));
    assert.equal(
      await readFile(join(f.folder, "unrelated.json"), "utf8"),
      "preserve",
    );
    assert.equal(
      JSON.parse(await readFile(join(f.folder, "control.json"), "utf8"))
        .version,
      2,
    );
  } finally {
    f.master.fill(0);
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a pending target cannot hide a later damaged terminal marker from the source worker", async () => {
  const f = await fixture();
  try {
    const parent = join(f.folder, "restores"),
      pending = "00000000-0000-4000-8000-000000000001",
      terminal = "ffffffff-ffff-4fff-8fff-fffffffffff2";
    await mkdir(parent, { mode: 0o700 });
    for (const id of [pending, terminal])
      await mkdir(join(parent, id), { mode: 0o700 });
    await writeFile(
      join(parent, pending, "inventory.json"),
      "synthetic pending custody",
      { mode: 0o600 },
    );
    const { authentication, ...body } = f.proof;
    const proof = signTargetRetirement(
      { ...body, batchId: terminal },
      f.master,
    );
    await writeFile(
      join(parent, terminal, "retired.json"),
      JSON.stringify({ ...proof, objects: 2 }),
      { mode: 0o600 },
    );
    await assert.rejects(pruneMediaVault(f.paths, f.j, f.id));
    assert.equal(
      JSON.parse(await readFile(join(f.folder, "control.json"), "utf8"))
        .version,
      2,
    );
    assert.equal(
      await readFile(join(parent, pending, "inventory.json"), "utf8"),
      "synthetic pending custody",
    );
  } finally {
    f.master.fill(0);
    await rm(f.root, { recursive: true, force: true });
  }
});
