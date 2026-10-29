/** Encrypted database-only recovery stage. Never commissions or opens a restore. */
import { constants } from "node:fs";
import {
  open,
  mkdir,
  readdir,
  realpath,
  stat,
  lstat,
  statfs,
  unlink,
  rmdir,
  link,
  rename,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { resolve, dirname, join, isAbsolute } from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { Transform, Writable, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { z } from "zod";
import { PrismaClient, type Prisma } from "@prisma/client";
import { FileDeletionJournal } from "./deletion-journal";
import type { Config } from "./config";
import type { Db } from "./services";
const DAY = 86400000,
  MAX = 1024 * 1024 * 1024;
const Hex = z.string().regex(/^[a-f0-9]{64}$/);
const Identity = z
  .object({
    region: z.enum(["CN", "INTL"]),
    installationId: z.string().uuid(),
    journalKeyId: Hex,
  })
  .strict();
const Secret = Identity.extend({
  version: z.literal(1),
  key: z.string().max(64),
}).strict();
const Manifest = Identity.extend({
  version: z.literal(2),
  kind: z.literal("DATABASE_ONLY_SEALED"),
  id: z.string().uuid(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  source: Hex,
  keyId: Hex,
  bytes: z.number().int().min(1).max(MAX),
  sha256: Hex,
  iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
  tag: z.string().max(24),
  journal: z
    .object({ count: z.number().int().min(0).max(2147483647), digest: Hex })
    .strict(),
  applied: z
    .object({ count: z.number().int().min(0).max(2147483647), digest: Hex })
    .strict(),
  authentication: Hex,
}).strict();
export type SnapshotManifest = z.infer<typeof Manifest>;
function fail(): never {
  throw Error(
    "Snapshot operation failed; preserve the sealed target and consult the private recovery runbook",
  );
}
export async function privateDirectory(path: string) {
  const s = await stat(path);
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    (await realpath(path)) !== path ||
    !s.isDirectory() ||
    s.uid !== process.getuid?.() ||
    s.mode & 0o077
  )
    fail();
}
/** Bind mounts can give the same directory different canonical path strings. */
export async function privatePathContains(parent: string, child: string) {
  const original = await stat(parent, { bigint: true });
  for (let path = resolve(child); ; path = dirname(path)) {
    const current = await stat(path, { bigint: true });
    if (current.dev === original.dev && current.ino === original.ino)
      return true;
    if (dirname(path) === path) return false;
  }
}
async function safeOpen(path: string, max = MAX) {
  await privateDirectory(dirname(path));
  const f = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  const s = await f.stat();
  if (
    !s.isFile() ||
    s.nlink !== 1 ||
    ![0, process.getuid?.()].includes(s.uid) ||
    s.mode & 0o077 ||
    s.size > max
  ) {
    await f.close();
    fail();
  }
  return f;
}
async function json(path: string, max = 16384) {
  const f = await safeOpen(path, max);
  try {
    return JSON.parse(await f.readFile("utf8"));
  } finally {
    await f.close();
  }
}
async function syncDir(path: string) {
  const d = await open(path, constants.O_RDONLY);
  try {
    await d.sync();
  } finally {
    await d.close();
  }
}
async function publishJson(path: string, value: unknown, replace = false) {
  await privateDirectory(dirname(path));
  const pending = join(dirname(path), `.${randomUUID()}.pending`),
    f = await open(pending, "wx", 0o600);
  try {
    await f.writeFile(JSON.stringify(value));
    await f.sync();
    await f.close();
    if (replace) await rename(pending, path);
    else {
      await link(pending, path);
      await unlink(pending);
    }
    await syncDir(dirname(path));
  } catch (e) {
    await f.close().catch(() => {});
    await unlink(pending).catch(() => {});
    throw e;
  }
}
function bytesKey(encoded: string) {
  const k = Buffer.from(encoded, "base64");
  if (k.length !== 32 || k.toString("base64") !== encoded) fail();
  return k;
}
function identity(j: FileDeletionJournal) {
  return {
    region: j.region,
    installationId: j.installationId,
    journalKeyId: j.keyId,
  };
}
function sameIdentity(a: z.infer<typeof Identity>, j: FileDeletionJournal) {
  return (
    a.region === j.region &&
    a.installationId === j.installationId &&
    a.journalKeyId === j.keyId
  );
}
export async function initializeSnapshotKey(
  path: string,
  journal: FileDeletionJournal,
) {
  if (path.startsWith(journal.directory + "/")) fail();
  await publishJson(path, {
    ...identity(journal),
    version: 1,
    key: randomBytes(32).toString("base64"),
  });
}
async function key(path: string, journal: FileDeletionJournal) {
  const s = Secret.parse(await json(path)),
    k = bytesKey(s.key);
  if (
    !sameIdentity(s, journal) ||
    createHash("sha256").update(k).digest("hex") === journal.keyId
  )
    fail();
  return k;
}
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, value) =>
    value && !Array.isArray(value) && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, value[k]]),
        )
      : value,
  );
}
function auth(manifest: Omit<SnapshotManifest, "authentication">, k: Buffer) {
  return createHmac("sha256", k)
    .update("cubers-database-snapshot-v1")
    .update(canonical(manifest))
    .digest("hex");
}
function aad(
  m: Pick<
    SnapshotManifest,
    "id" | "region" | "installationId" | "journalKeyId"
  >,
) {
  return Buffer.from(
    JSON.stringify({
      format: "cubers-database-snapshot-v1",
      id: m.id,
      region: m.region,
      installationId: m.installationId,
      journalKeyId: m.journalKeyId,
    }),
  );
}
export function pgEnvironment(databaseUrl: string) {
  const u = new URL(databaseUrl),
    mode = u.searchParams.get("sslmode") || "verify-full";
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    !u.hostname ||
    !/^\/[^/]+$/.test(u.pathname) ||
    !["disable", "require", "verify-full"].includes(mode) ||
    [...u.searchParams.keys()].some(
      (k) => !["schema", "sslmode"].includes(k),
    ) ||
    (u.searchParams.has("schema") && u.searchParams.get("schema") !== "public")
  )
    fail();
  return {
    PATH: process.env.PATH,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGSSLMODE: mode,
    PGCONNECT_TIMEOUT: "10",
    PGAPPNAME: "cubers-offline-snapshot",
    ...(process.env.PGSSLROOTCERT
      ? { PGSSLROOTCERT: process.env.PGSSLROOTCERT }
      : {}),
  };
}
export function databaseFingerprint(url: string) {
  const e = pgEnvironment(url);
  return createHash("sha256")
    .update(JSON.stringify([e.PGHOST, e.PGPORT, e.PGDATABASE]))
    .digest("hex");
}
function pg(
  command: "pg_dump" | "pg_restore" | "psql",
  args: string[],
  url: string,
) {
  const child = spawn(command, args, {
    env: pgEnvironment(url),
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 300000,
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    if (stderr.length < 16384)
      stderr += String(chunk).slice(0, 16384 - stderr.length);
  });
  const done = new Promise<void>((yes, no) => {
    child.once("error", () => no(Error("PostgreSQL client unavailable")));
    child.once("close", (code) =>
      code === 0 && !stderr
        ? yes()
        : no(
            Object.assign(
              Error(
                `PostgreSQL ${command} failed or reported warnings (exit ${code})`,
              ),
              { privateDiagnostic: stderr },
            ),
          ),
    );
  });
  void done.catch(() => {});
  return { child, done };
}
function meter(max: number, hash?: ReturnType<typeof createHash>) {
  let size = 0;
  return new Transform({
    transform(chunk, _encoding, cb) {
      size += chunk.length;
      if (size > max) return cb(Error("Snapshot size limit exceeded"));
      hash?.update(chunk);
      cb(null, chunk);
    },
  });
}
// Bounded adapters retain caller ownership of the unlinked staging descriptor.
function readHandle(f: FileHandle) {
  return require("node:stream").Readable.from(
    (async function* () {
      let position = 0;
      for (;;) {
        const chunk = Buffer.alloc(65536),
          { bytesRead } = await f.read(chunk, 0, chunk.length, position);
        if (!bytesRead) return;
        position += bytesRead;
        yield chunk.subarray(0, bytesRead);
      }
    })(),
  ) as Readable;
}
function writeHandle(f: FileHandle) {
  let position = 0;
  return new Writable({
    write(chunk: Buffer, _encoding, cb) {
      void (async () => {
        for (let offset = 0; offset < chunk.length;) {
          const { bytesWritten } = await f.write(
            chunk,
            offset,
            chunk.length - offset,
            position,
          );
          if (!bytesWritten) throw Error("Snapshot staging write interrupted");
          offset += bytesWritten;
          position += bytesWritten;
        }
      })().then(() => cb(), cb);
    },
  });
}
async function encrypt(
  input: Readable,
  path: string,
  k: Buffer,
  header: Parameters<typeof aad>[0],
) {
  const out = await open(path, "wx", 0o600),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", k, iv),
    hash = createHash("sha256");
  const output = writeHandle(out);
  cipher.setAAD(aad(header));
  try {
    await pipeline(input, meter(MAX), cipher, meter(MAX, hash), output);
    await out.sync();
    return {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      bytes: (await out.stat()).size,
      sha256: hash.digest("hex"),
    };
  } finally {
    output.destroy();
    await out.close();
  }
}
/** Also used by crypto regression tests; input is never persisted as plaintext. */
export async function captureSnapshot(
  input: Readable,
  directory: string,
  keyFile: string,
  journal: FileDeletionJournal,
  source: string,
  startedAt = new Date().toISOString(),
  producerComplete: () => Promise<void> = async () => {},
  databaseApplied?: { count: number; digest: string },
) {
  await privateDirectory(directory);
  if (
    (await privatePathContains(directory, dirname(keyFile))) ||
    directory === journal.directory ||
    directory.startsWith(journal.directory + "/")
  )
    fail();
  const k = await key(keyFile, journal),
    id = randomUUID(),
    folder = join(directory, id);
  try {
    await mkdir(folder, { mode: 0o700 });
    const created = await lstat(folder, { bigint: true });
    try {
      const header = { ...identity(journal), id },
        checkpoint = await journal.checkpoint();
      const encrypted = await encrypt(
        input,
        join(folder, "database.enc"),
        k,
        header,
      );
      await producerComplete();
      const completedAt = new Date().toISOString();
      const body = {
        ...header,
        version: 2 as const,
        kind: "DATABASE_ONLY_SEALED" as const,
        startedAt,
        completedAt,
        expiresAt: new Date(Date.parse(startedAt) + 30 * DAY).toISOString(),
        source: databaseFingerprint(source),
        keyId: createHash("sha256").update(k).digest("hex"),
        ...encrypted,
        journal: checkpoint,
        applied: databaseApplied ?? checkpoint,
      };
      const manifest = Manifest.parse({
        ...body,
        authentication: auth(body, k),
      });
      await publishJson(join(folder, "manifest.json"), manifest);
      await syncDir(directory);
      return manifest;
    } catch (error) {
      try {
        // Never recursively remove a caller-supplied tree. Only our new inode
        // and the two exact output names are eligible for failure cleanup.
        await privateDirectory(folder);
        const current = await lstat(folder, { bigint: true });
        if (current.dev !== created.dev || current.ino !== created.ino) fail();
        const names = await readdir(folder);
        if (
          names.some(
            (name) => !["database.enc", "manifest.json"].includes(name),
          )
        )
          fail();
        // Validate every entry before removing any, including aliases/links.
        for (const name of names) {
          const file = await safeOpen(join(folder, name));
          await file.close();
        }
        for (const name of names) await unlink(join(folder, name));
        await rmdir(folder);
        await syncDir(directory);
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "Snapshot capture failed and local cleanup is incomplete; preserve private diagnostics for operator review",
        );
      }
      throw error;
    }
  } finally {
    k.fill(0);
  }
}
export async function verifySnapshot(
  folder: string,
  keyFile: string,
  journal: FileDeletionJournal,
  now = Date.now(),
) {
  await privateDirectory(folder);
  if (await privatePathContains(dirname(folder), dirname(keyFile))) fail();
  if ((await readdir(folder)).sort().join(",") !== "database.enc,manifest.json")
    fail();
  const m = Manifest.parse(await json(join(folder, "manifest.json"))),
    k = await key(keyFile, journal),
    { authentication, ...body } = m;
  if (
    m.id !== folder.split("/").at(-1) ||
    !sameIdentity(m, journal) ||
    m.keyId !== createHash("sha256").update(k).digest("hex") ||
    authentication !== auth(body, k) ||
    Date.parse(m.startedAt) > now + 60000 ||
    Date.parse(m.completedAt) < Date.parse(m.startedAt) ||
    Date.parse(m.completedAt) > now + 60000 ||
    Date.parse(m.expiresAt) !== Date.parse(m.startedAt) + 30 * DAY ||
    Date.parse(m.expiresAt) <= now ||
    Buffer.from(m.tag, "base64").length !== 16
  )
    fail();
  const checkpoint = await journal.checkpoint(m.journal.count);
  if (
    (await journal.checkpoint(m.applied.count)).digest !== m.applied.digest ||
    m.applied.count > m.journal.count
  )
    fail();
  if (checkpoint.digest !== m.journal.digest) fail();
  const encrypted = await safeOpen(join(folder, "database.enc"));
  try {
    await decrypt(
      encrypted,
      m,
      k,
      new Writable({
        write(_chunk, _encoding, cb) {
          cb();
        },
      }),
    );
  } finally {
    await encrypted.close();
  }
  return { manifest: m, key: k };
}
/** Retention-only admission: authenticates expired metadata without decrypting it.
 * It intentionally needs no retired journal records and never admits a restore. */
export async function authenticateSnapshotExpiry(
  folder: string,
  keyFile: string,
  journal: FileDeletionJournal,
  source: string,
  now = Date.now(),
) {
  await privateDirectory(folder);
  const m = Manifest.parse(await json(join(folder, "manifest.json")));
  const k = await key(keyFile, journal);
  try {
    const { authentication, ...body } = m;
    if (
      m.id !== folder.split("/").at(-1) ||
      !sameIdentity(m, journal) ||
      m.source !== source ||
      m.keyId !== createHash("sha256").update(k).digest("hex") ||
      authentication !== auth(body, k) ||
      Date.parse(m.startedAt) > now + 60000 ||
      Date.parse(m.completedAt) < Date.parse(m.startedAt) ||
      Date.parse(m.completedAt) > now + 60000 ||
      Date.parse(m.expiresAt) !== Date.parse(m.startedAt) + 30 * DAY ||
      Buffer.from(m.tag, "base64").length !== 16
    )
      fail();
    return m;
  } finally {
    k.fill(0);
  }
}
async function decrypt(
  f: FileHandle,
  m: SnapshotManifest,
  k: Buffer,
  output: NodeJS.WritableStream,
) {
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(m.iv, "base64")),
    hash = createHash("sha256");
  d.setAAD(aad(m));
  d.setAuthTag(Buffer.from(m.tag, "base64"));
  if ((await f.stat()).size !== m.bytes) fail();
  const input = readHandle(f);
  try {
    await pipeline(input, meter(m.bytes, hash), d, meter(MAX), output);
  } finally {
    input.destroy();
  }
  if (hash.digest("hex") !== m.sha256) fail();
}
export async function captureDatabase(
  config: Config,
  directory: string,
  keyFile: string,
  journal: FileDeletionJournal,
  snapshot?: { id: string; tx: Prisma.TransactionClient },
) {
  const { checkJournalBinding } = await import("./recovery");
  if (snapshot && !/^[A-Fa-f0-9-]{1,100}$/.test(snapshot.id)) fail();
  const owned = snapshot
    ? undefined
    : new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  const db = snapshot?.tx || owned!;
  try {
    await checkJournalBinding(db, journal);
    if ((await journal.source()) !== databaseFingerprint(config.DATABASE_URL))
      fail();
    const binding = await db.recoveryBinding.findUniqueOrThrow({
      where: { id: "installation" },
    });
    if (
      binding.journalFloor > (await journal.floor()).count ||
      !binding.journalDigest ||
      (await journal.checkpoint(binding.journalCount)).digest !==
        binding.journalDigest
    )
      fail();
    const applied = {
      count: binding.journalCount,
      digest: binding.journalDigest,
    };
    if (await db.user.count({ where: { region: { not: config.REGION } } }))
      fail();
    const dump = pg(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        '--exclude-table-data=public."RecoveryBinding"',
        '--exclude-table-data=public."DeletionReceipt"',
        '--exclude-table-data=public."MediaRecoveryState"',
        '--exclude-table-data=public."ConsentWithdrawalRecovery"',
        '--exclude-table-data=public."MediaRestoreBatch"',
        '--exclude-table-data=public."MediaRestoreFile"',
        "--lock-wait-timeout=10000",
        "--no-password",
        ...(snapshot ? [`--snapshot=${snapshot.id}`] : []),
      ],
      config.DATABASE_URL,
    );
    dump.child.stdin.end();
    try {
      // Delay publication until the producer exits successfully, including warnings.
      return await captureSnapshot(
        dump.child.stdout,
        directory,
        keyFile,
        journal,
        config.DATABASE_URL,
        new Date().toISOString(),
        () => dump.done,
        applied,
      );
    } catch (e) {
      dump.child.kill("SIGKILL");
      await dump.done.catch(() => {});
      throw e;
    }
  } finally {
    await owned?.$disconnect();
  }
}
export async function restoreSealedDatabase(
  config: Config,
  folder: string,
  keyFile: string,
  journal: FileDeletionJournal,
  temporaryDirectory: string,
) {
  const { checkJournalBinding, reconcileDeletionJournal } =
    await import("./recovery");
  const { manifest: m, key: k } = await verifySnapshot(
    folder,
    keyFile,
    journal,
  );
  if (databaseFingerprint(config.DATABASE_URL) === m.source) fail();
  await privateDirectory(temporaryDirectory);
  if (
    process.platform !== "linux" ||
    Number((await statfs(temporaryDirectory)).type) !== 0x01021994
  )
    throw Error("Authenticated restore requires private Linux tmpfs staging");
  const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  let stage: FileHandle | undefined;
  try {
    const tables = await db.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')`;
    if (Number(tables[0].count) !== 0)
      throw Error("Restore target must be an isolated empty database");
    const lockPath = join(temporaryDirectory, ".restore-lock");
    await mkdir(lockPath, { mode: 0o700 });
    try {
      const path = join(temporaryDirectory, `${randomUUID()}.dump`);
      stage = await open(path, "wx+", 0o600);
      await unlink(path);
      const encrypted = await safeOpen(join(folder, "database.enc"));
      const plaintext = writeHandle(stage);
      try {
        await decrypt(encrypted, m, k, plaintext);
      } finally {
        plaintext.destroy();
        await encrypted.close();
      }
      // Authentication completes BEFORE any archived SQL reaches PostgreSQL. Both
      // the restore and the SEALED binding commit together; failed pipes roll back.
      const restore = pg(
          "pg_restore",
          ["--file=-", "--no-owner", "--no-acl", "--exit-on-error"],
          config.DATABASE_URL,
        ),
        sql = pg(
          "psql",
          ["-X", "--no-password", "--set=ON_ERROR_STOP=1", "--quiet"],
          config.DATABASE_URL,
        );
      sql.child.stdout.resume();
      sql.child.stdin.write("BEGIN;\n");
      const input = readHandle(stage);
      try {
        await Promise.all([
          pipeline(input, restore.child.stdin),
          pipeline(restore.child.stdout, sql.child.stdin, { end: false }),
          restore.done,
        ]);
        sql.child.stdin.end(
          `\nINSERT INTO public."RecoveryBinding" ("id","region","installationId","journalKeyId","state","restoredSnapshotId","restoredSource","journalCount","journalDigest","createdAt") VALUES ('installation','${m.region}','${m.installationId}','${m.journalKeyId}','SEALED','${m.id}','${m.source}',${m.applied.count},'${m.applied.digest}',NOW());\nDELETE FROM public."Session";\nDELETE FROM public."AuthToken";\nDO $$ BEGIN IF to_regclass('public."ReplayShare"') IS NOT NULL THEN UPDATE public."ReplayShare" SET "tokenHash"=NULL,"revision"="revision"+1 WHERE "tokenHash" IS NOT NULL; END IF; END $$;\nDO $$ BEGIN IF to_regclass('public."AppAttestationKey"') IS NOT NULL THEN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AppAttestationKey' AND column_name='receiptAutoRefresh') THEN UPDATE public."AppAttestationKey" SET "status"='REVOKED',"publicKeyPem"=NULL,"receiptCiphertext"=NULL,"receiptAutoRefresh"=false,"receiptRefreshAt"=NULL,"receiptRefreshLease"=NULL,"receiptRefreshLeaseUntil"=NULL,"receiptRefreshFailures"=0,"version"="version"+1,"updatedAt"=NOW() WHERE "status"='ACTIVE'; ELSE UPDATE public."AppAttestationKey" SET "status"='REVOKED',"publicKeyPem"=NULL,"receiptCiphertext"=NULL,"version"="version"+1,"updatedAt"=NOW() WHERE "status"='ACTIVE'; END IF; END IF; END $$;\nCOMMIT;\n`,
        );
        await sql.done;
      } catch (e) {
        restore.child.kill("SIGKILL");
        sql.child.kill("SIGKILL");
        await Promise.allSettled([restore.done, sql.done]);
        throw e;
      } finally {
        input.destroy();
      }
      await checkJournalBinding(db, journal, true);
      await reconcileDeletionJournal(db as Db, config, true);
      return {
        status: "restored-sealed",
        region: m.region,
        snapshotId: m.id,
        expiresAt: m.expiresAt,
      };
    } finally {
      await stage?.close();
      await rmdir(lockPath);
    }
  } finally {
    await db.$disconnect();
  }
}

// Shared private-file and bounded-stream primitives for the media vault. These
// remain operator-library functions; no HTTP route exposes keys or local paths.
export {
  key as readSnapshotKey,
  json as readPrivateJson,
  safeOpen as openPrivateFile,
  publishJson as publishPrivateJson,
  syncDir as syncPrivateDirectory,
  readHandle as privateReadStream,
  writeHandle as privateWriteStream,
  canonical as canonicalSnapshotJson,
};
