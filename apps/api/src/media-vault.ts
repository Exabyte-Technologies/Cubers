/** Offline encrypted capture, sealed restoration and key expiry. Never opens services. */
import {
  open,
  mkdir,
  readdir,
  unlink,
  rm,
  rmdir,
  statfs,
  type FileHandle,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import type { Config } from "./config";
import type { Db } from "./services";
import { FileDeletionJournal, type DeletionRecord } from "./deletion-journal";
import { backupPrivacy, mediaBackupExpiry } from "./media-vault-policy";
import {
  readTargetRetirement,
  signTargetRetirement,
  type RetiredMediaTarget,
} from "./media-vault-retirement";
import {
  privateDirectory,
  privatePathContains,
  initializeSnapshotKey,
  readSnapshotKey,
  readPrivateJson,
  publishPrivateJson,
  syncPrivateDirectory,
  openPrivateFile,
  privateReadStream,
  privateWriteStream,
  canonicalSnapshotJson,
  captureDatabase,
  verifySnapshot,
  databaseFingerprint,
} from "./database-snapshot";
const DAY = 86400000,
  MAX_OBJECT = 256 * 1024 * 1024,
  MAX_OBJECTS = 10000,
  MAX_INDEX = 16 * 1024 * 1024,
  MAX_TOTAL = 64 * 1024 ** 3;
const Uuid = z.string().uuid(),
  Hex = z.string().regex(/^[a-f0-9]{64}$/),
  Iso = z.string().datetime();
const Identity = z
  .object({
    region: z.enum(["CN", "INTL"]),
    installationId: Uuid,
    journalKeyId: Hex,
    bundleId: Uuid,
  })
  .strict();
const Control = Identity.extend({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  createdAt: Iso,
  expiresAt: Iso,
  source: Hex,
  status: z.enum(["CAPTURING", "READY", "PURGED"]),
  indexDigest: Hex.optional(),
  journal: z
    .object({ count: z.number().int().min(0).max(2147483647), digest: Hex })
    .strict()
    .optional(),
  objects: z.array(Uuid).max(MAX_OBJECTS).optional(),
  purged: z.array(Uuid).max(MAX_OBJECTS),
  authentication: Hex,
}).strict();
const Entry = z
  .object({
    objectId: Uuid,
    mediaId: Uuid,
    userId: Uuid,
    key: z.string().max(256),
    purpose: z.enum(["post", "evidence", "consent"]),
    type: z.enum(["image/png", "image/jpeg", "video/mp4", "application/pdf"]),
    createdAt: Iso,
    attemptId: Uuid.optional(),
    attemptCreatedAt: Iso.optional(),
    hardExpiresAt: Iso,
    initialDeadline: Iso,
    policySequence: z.number().int().min(0).max(2147483647),
    size: z.number().int().min(1).max(MAX_OBJECT),
    sha256: Hex,
    keyId: Hex,
    iv: z.string().max(32),
    tag: z.string().max(32),
  })
  .strict();
const Index = Identity.extend({
  version: z.literal(2),
  kind: z.literal("SEALED_WITH_MEDIA"),
  databaseId: Uuid,
  sourceBucket: z.string().min(1).max(255),
  createdAt: Iso,
  expiresAt: Iso,
  journal: z
    .object({ count: z.number().int().min(0).max(2147483647), digest: Hex })
    .strict(),
  objects: z.array(Entry).max(MAX_OBJECTS),
}).strict();
const Box = z
  .object({
    version: z.literal(1),
    iv: z.string().max(32),
    tag: z.string().max(32),
    ciphertext: z.string().max(MAX_INDEX * 2),
  })
  .strict();
const ObjectKey = Identity.extend({
  version: z.literal(2),
  objectId: Uuid,
  key: z.string().max(64),
  keyId: Hex,
  entry: Entry,
  authentication: Hex,
}).strict();
// Independent of the database/index data key: target cleanup must still work
// after the encrypted bundle and every file key have expired.
const TargetInventory = Identity.extend({
  version: z.literal(1),
  batchId: Uuid,
  snapshotId: Uuid,
  indexDigest: Hex,
  target: Hex,
  storage: Hex,
  bucket: z.string().min(3).max(63),
  createdAt: Iso,
  expiresAt: Iso,
  journal: z
    .object({ count: z.number().int().min(0).max(2147483647), digest: Hex })
    .strict(),
  objects: z.array(Entry).max(MAX_OBJECTS),
  authentication: Hex,
}).strict();
const TargetState = Identity.extend({
  version: z.literal(1),
  batchId: Uuid,
  inventoryDigest: Hex,
  purged: z.array(Uuid).max(MAX_OBJECTS),
  authentication: Hex,
}).strict();
type TargetPlan = z.infer<typeof TargetInventory>;
type TargetCustody = {
  plan: TargetPlan;
  state: z.infer<typeof TargetState>;
  folder: string;
  master: Buffer;
};
export type MediaVaultEntry = z.infer<typeof Entry>;
export type MediaVaultPaths = {
  directory: string;
  secretDirectory: string;
  masterKeyFile: string;
};
class VaultIntegrityError extends Error {}
function fail(): never {
  throw new VaultIntegrityError(
    "Media vault integrity, ownership, retention or snapshot check failed; keep recovery sealed",
  );
}
const digest = (v: unknown) =>
  createHash("sha256").update(canonicalSnapshotJson(v)).digest("hex");
function identity(j: FileDeletionJournal, bundleId: string) {
  return {
    region: j.region,
    installationId: j.installationId,
    journalKeyId: j.keyId,
    bundleId,
  };
}
function same(v: z.infer<typeof Identity>, j: FileDeletionJournal, id: string) {
  return (
    v.region === j.region &&
    v.installationId === j.installationId &&
    v.journalKeyId === j.keyId &&
    v.bundleId === id
  );
}
function keyBytes(s: string) {
  const b = Buffer.from(s, "base64");
  if (b.length !== 32 || b.toString("base64") !== s) fail();
  return b;
}
function auth(v: Omit<z.infer<typeof Control>, "authentication">, k: Buffer) {
  return createHmac("sha256", k)
    .update("cubers-media-vault-control-v1")
    .update(canonicalSnapshotJson(v))
    .digest("hex");
}
function aead(context: unknown) {
  return Buffer.from(canonicalSnapshotJson(context));
}
function sealIndex(value: unknown, key: Buffer, context: unknown) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aead(context));
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > MAX_INDEX) fail();
  const ciphertext = Buffer.concat([c.update(bytes), c.final()]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}
function unseal(value: unknown, key: Buffer, context: unknown) {
  const b = Box.parse(value),
    iv = Buffer.from(b.iv, "base64"),
    tag = Buffer.from(b.tag, "base64");
  if (iv.length !== 12 || tag.length !== 16) fail();
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(aead(context));
  d.setAuthTag(tag);
  const plain = Buffer.concat([
    d.update(Buffer.from(b.ciphertext, "base64")),
    d.final(),
  ]);
  if (plain.length > MAX_INDEX) fail();
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
}
function indexContext(j: FileDeletionJournal, id: string) {
  return { format: "cubers-media-vault-index-v1", ...identity(j, id) };
}
function objectContext(
  e: Pick<
    MediaVaultEntry,
    "objectId" | "mediaId" | "userId" | "key" | "purpose" | "type"
  >,
  j: FileDeletionJournal,
  id: string,
) {
  return { format: "cubers-media-vault-object-v1", ...identity(j, id), ...e };
}
async function roots(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  initialize = false,
) {
  await privateDirectory(paths.directory);
  await privateDirectory(paths.secretDirectory);
  const all = [paths.directory, paths.secretDirectory, j.directory];
  for (let a = 0; a < all.length; a++)
    for (let b = a + 1; b < all.length; b++)
      if (
        (await privatePathContains(all[a], all[b])) ||
        (await privatePathContains(all[b], all[a]))
      )
        fail();
  if (
    (await privatePathContains(
      paths.directory,
      dirname(paths.masterKeyFile),
    )) ||
    (await privatePathContains(j.directory, dirname(paths.masterKeyFile)))
  )
    fail();
  if (initialize) await initializeSnapshotKey(paths.masterKeyFile, j);
  return readSnapshotKey(paths.masterKeyFile, j);
}
export async function initializeMediaVault(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
) {
  await roots(paths, j, true);
}
async function writeControl(
  path: string,
  value: Omit<z.infer<typeof Control>, "authentication">,
  master: Buffer,
  replace = false,
) {
  await publishPrivateJson(
    path,
    { ...value, authentication: auth(value, master) },
    replace,
  );
}
async function readControl(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  master: Buffer,
) {
  Uuid.parse(id);
  const c = Control.parse(
    await readPrivateJson(
      join(paths.secretDirectory, id, "control.json"),
      MAX_INDEX,
    ),
  );
  const { authentication, ...body } = c;
  if (
    !same(c, j, id) ||
    authentication !== auth(body, master) ||
    Date.parse(c.expiresAt) !== Date.parse(c.createdAt) + 30 * DAY ||
    Date.parse(c.createdAt) > Date.now() + 60000 ||
    new Set(c.purged).size !== c.purged.length ||
    (c.version === 3 &&
      (c.status !== "PURGED" ||
        c.purged.length ||
        c.objects !== undefined ||
        c.journal !== undefined ||
        c.indexDigest !== undefined))
  )
    fail();
  return c;
}
async function vaultLock(paths: MediaVaultPaths, id: string) {
  const path = join(paths.secretDirectory, id, ".vault-lock");
  await mkdir(path, { mode: 0o700 });
  return async () => {
    await rmdir(path);
  };
}
async function removePrivate(path: string) {
  try {
    const f = await openPrivateFile(path);
    await f.close();
    await unlink(path);
    await syncPrivateDirectory(dirname(path));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
function client(config: Config) {
  return new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
    },
  });
}
async function objectKey(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  e: MediaVaultEntry,
  master: Buffer,
) {
  const s = await signedObjectKey(paths, j, id, e.objectId, master);
  const k = keyBytes(s.key);
  if (
    !same(s, j, id) ||
    s.objectId !== e.objectId ||
    s.keyId !== e.keyId ||
    createHash("sha256").update(k).digest("hex") !== e.keyId ||
    digest(s.entry) !== digest(e)
  )
    fail();
  return k;
}
function objectKeyAuth(
  value: Omit<z.infer<typeof ObjectKey>, "authentication">,
  master: Buffer,
) {
  return createHmac("sha256", master)
    .update("cubers-media-vault-key-record-v1")
    .update(canonicalSnapshotJson(value))
    .digest("hex");
}
async function signedObjectKey(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  objectId: string,
  master: Buffer,
) {
  const s = ObjectKey.parse(
      await readPrivateJson(
        join(paths.secretDirectory, id, "media", objectId + ".json"),
      ),
    ),
    { authentication, ...body } = s,
    k = keyBytes(s.key);
  if (
    !same(s, j, id) ||
    s.objectId !== objectId ||
    s.entry.objectId !== objectId ||
    s.entry.keyId !== s.keyId ||
    createHash("sha256").update(k).digest("hex") !== s.keyId ||
    authentication !== objectKeyAuth(body, master)
  )
    fail();
  return s;
}
function checkEntry(
  e: MediaVaultEntry,
  index: Pick<z.infer<typeof Index>, "journal" | "expiresAt">,
  region: "CN" | "INTL",
) {
  const prefix = `${region}/${e.userId}/`,
    tail = e.key.slice(prefix.length);
  if (
    !e.key.startsWith(prefix) ||
    !tail.endsWith("/clean") ||
    !Uuid.safeParse(tail.slice(0, -6)).success ||
    e.policySequence !== index.journal.count ||
    Date.parse(e.hardExpiresAt) > Date.parse(index.expiresAt) ||
    Date.parse(e.hardExpiresAt) <= Date.parse(e.createdAt) ||
    Date.parse(e.initialDeadline) > Date.parse(e.hardExpiresAt)
  )
    fail();
  if (e.purpose === "evidence") {
    if (
      !e.attemptId ||
      !e.attemptCreatedAt ||
      Date.parse(e.hardExpiresAt) > Date.parse(e.attemptCreatedAt) + 30 * DAY ||
      e.type !== "video/mp4"
    )
      fail();
  } else if (
    e.attemptId ||
    e.attemptCreatedAt ||
    (e.purpose === "consent" && e.type !== "application/pdf") ||
    (e.purpose === "post" && e.type === "application/pdf")
  )
    fail();
}
async function readIndex(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  c: z.infer<typeof Control>,
) {
  if (c.version !== 2 || c.status !== "READY" || !c.indexDigest) fail();
  const k = await readSnapshotKey(
      join(paths.secretDirectory, id, "database.json"),
      j,
    ),
    raw = await readPrivateJson(
      join(paths.directory, id, "bundle.json"),
      MAX_INDEX * 2,
    );
  if (digest(raw) !== c.indexDigest) fail();
  const index = Index.parse(unseal(raw, k, indexContext(j, id)));
  if (
    !same(index, j, id) ||
    index.createdAt !== c.createdAt ||
    index.expiresAt !== c.expiresAt ||
    new Set(index.objects.map((e) => e.objectId)).size !==
      index.objects.length ||
    new Set(index.objects.map((e) => e.mediaId)).size !==
      index.objects.length ||
    !c.objects ||
    !c.journal ||
    JSON.stringify(c.objects) !==
      JSON.stringify(index.objects.map((e) => e.objectId)) ||
    digest(c.journal) !== digest(index.journal)
  )
    fail();
  for (const e of index.objects) checkEntry(e, index, j.region);
  const checkpoint = await j.checkpoint(index.journal.count);
  if (checkpoint.digest !== index.journal.digest) fail();
  return index;
}
async function encryptObject(
  body: Readable,
  path: string,
  k: Buffer,
  context: unknown,
  size: number,
  signal: AbortSignal,
) {
  const f = await open(path, "wx", 0o600),
    out = privateWriteStream(f),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", k, iv),
    hash = createHash("sha256");
  let count = 0;
  cipher.setAAD(aead(context));
  try {
    await pipeline(
      body,
      new Transform({
        transform(chunk, _enc, cb) {
          count += chunk.length;
          if (count > size) return cb(Error("Media size mismatch"));
          hash.update(chunk);
          cb(null, chunk);
        },
      }),
      cipher,
      out,
      { signal },
    );
    if (count !== size) fail();
    await f.sync();
    return {
      sha256: hash.digest("hex"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    };
  } finally {
    out.destroy();
    await f.close();
  }
}
async function verifyObject(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  e: MediaVaultEntry,
  master: Buffer,
  destination?: Writable,
) {
  const k = await objectKey(paths, j, id, e, master),
    f = await openPrivateFile(
      join(paths.directory, id, "media", e.objectId + ".enc"),
      MAX_OBJECT,
    ),
    iv = Buffer.from(e.iv, "base64"),
    tag = Buffer.from(e.tag, "base64");
  if (iv.length !== 12 || tag.length !== 16) {
    await f.close();
    fail();
  }
  const d = createDecipheriv("aes-256-gcm", k, iv),
    hash = createHash("sha256");
  d.setAAD(
    aead(
      objectContext(
        {
          objectId: e.objectId,
          mediaId: e.mediaId,
          userId: e.userId,
          key: e.key,
          purpose: e.purpose,
          type: e.type,
        },
        j,
        id,
      ),
    ),
  );
  d.setAuthTag(tag);
  let count = 0;
  try {
    if ((await f.stat()).size !== e.size) fail();
    await pipeline(
      privateReadStream(f),
      d,
      new Transform({
        transform(chunk, _enc, cb) {
          count += chunk.length;
          if (count > e.size) return cb(Error("Media size mismatch"));
          hash.update(chunk);
          cb(null, chunk);
        },
      }),
      destination ??
        new Writable({
          write(_chunk, _enc, cb) {
            cb();
          },
        }),
    );
    if (count !== e.size || hash.digest("hex") !== e.sha256) fail();
  } finally {
    await f.close();
  }
}
async function collect(
  tx: Prisma.TransactionClient,
  config: Config,
  index: z.infer<typeof Index>,
  privacy: ReturnType<typeof backupPrivacy>,
) {
  const result: Array<
    Omit<MediaVaultEntry, "sha256" | "iv" | "tag" | "keyId">
  > = [];
  let cursor: string | undefined,
    total = 0;
  for (;;) {
    const rows = await tx.media.findMany({
      where: { status: "READY" },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    for (const m of rows) {
      cursor = m.id;
      const user = await tx.user.findUnique({ where: { id: m.userId } });
      if (!user || user.region !== config.REGION) fail();
      if (
        user.deletedAt ||
        privacy.deletedAccounts.has(m.userId) ||
        privacy.erasedMedia.has(m.id)
      )
        continue;
      const state = await tx.mediaRecoveryState.findUnique({
        where: { id: m.id },
      });
      if (state?.erasedAt) continue;
      let hard = Date.parse(index.expiresAt),
        deadline = hard,
        attemptId: string | undefined,
        attemptCreatedAt: string | undefined;
      if (m.purpose === "evidence") {
        const a = m.attemptId
          ? await tx.attempt.findUnique({
              where: { id: m.attemptId },
              include: { room: true },
            })
          : null;
        if (
          !a ||
          a.userId !== m.userId ||
          !a.room.ranked ||
          a.room.input === "virtual"
        )
          fail();
        const withdrawn = await tx.consentWithdrawalRecovery.findUnique({
          where: { id: m.userId },
        });
        if (
          (withdrawn?.cutoff.getTime() || 0) >= m.createdAt.getTime() ||
          (privacy.withdrawals.get(m.userId) || 0) >= m.createdAt.getTime()
        )
          continue;
        hard = Math.min(hard, a.createdAt.getTime() + 30 * DAY);
        deadline = Math.min(
          hard,
          privacy.deadlines.get(m.id)?.deadline ??
            Math.min(
              a.evidenceDeleteAt?.getTime() ?? Infinity,
              state?.deadline?.getTime() ?? Infinity,
            ),
        );
        attemptId = a.id;
        attemptCreatedAt = a.createdAt.toISOString();
      } else {
        const referenced =
          m.purpose === "post"
            ? await tx.post.count({
                where: { authorId: m.userId, mediaIds: { has: m.id } },
              })
            : m.purpose === "consent"
              ? await tx.consent.count({
                  where: { guardianId: m.userId, documentId: m.id },
                })
              : 0;
        if (!referenced) hard = Math.min(hard, m.createdAt.getTime() + DAY);
        deadline = hard;
      }
      const e = Entry.omit({
        sha256: true,
        iv: true,
        tag: true,
        keyId: true,
      }).parse({
        objectId: randomUUID(),
        mediaId: m.id,
        userId: m.userId,
        key: m.key,
        purpose: m.purpose,
        type: m.type,
        createdAt: m.createdAt.toISOString(),
        attemptId,
        attemptCreatedAt,
        hardExpiresAt: new Date(hard).toISOString(),
        initialDeadline: new Date(deadline).toISOString(),
        policySequence: index.journal.count,
        size: m.size,
      });
      if (mediaBackupExpiry(e, privacy) <= Date.now()) continue;
      checkEntry(
        {
          ...e,
          sha256: "0".repeat(64),
          keyId: "0".repeat(64),
          iv: "",
          tag: "",
        },
        index,
        config.REGION,
      );
      if (++total > MAX_OBJECTS) fail();
      result.push(e);
    }
  }
  if (result.reduce((n, e) => n + e.size, 0) > MAX_TOTAL) fail();
  return result;
}
export async function captureMediaVault(
  config: Config,
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
) {
  const master = await roots(paths, j),
    id = randomUUID(),
    folder = join(paths.directory, id),
    secrets = join(paths.secretDirectory, id),
    createdAt = new Date().toISOString(),
    expiresAt = new Date(Date.parse(createdAt) + 30 * DAY).toISOString();
  await mkdir(folder, { mode: 0o700 });
  await mkdir(secrets, { mode: 0o700 });
  for (const p of [
    join(folder, "database"),
    join(folder, "media"),
    join(secrets, "media"),
  ])
    await mkdir(p, { mode: 0o700 });
  const control = {
    ...identity(j, id),
    version: 2 as const,
    createdAt,
    expiresAt,
    source: databaseFingerprint(config.DATABASE_URL),
    status: "CAPTURING" as const,
    purged: [] as string[],
  };
  await writeControl(join(secrets, "control.json"), control, master);
  const release = await vaultLock(paths, id),
    db = new PrismaClient({ datasourceUrl: config.DATABASE_URL }),
    storage = client(config);
  try {
    await initializeSnapshotKey(join(secrets, "database.json"), j);
    const checkpoint = await j.checkpoint(),
      records = [];
    for await (const row of j.records()) records.push(row);
    const privacy = backupPrivacy(records);
    const index = Index.parse({
      ...identity(j, id),
      version: 2,
      kind: "SEALED_WITH_MEDIA",
      databaseId: randomUUID(),
      sourceBucket: config.S3_BUCKET,
      createdAt,
      expiresAt,
      journal: checkpoint,
      objects: [],
    });
    await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
        await tx.$executeRawUnsafe(
          'LOCK TABLE public."User",public."Media",public."Post",public."Consent",public."Attempt",public."MediaRecoveryState",public."ConsentWithdrawalRecovery" IN SHARE MODE',
        );
        const snapshots = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT pg_export_snapshot() AS id`;
        const metadata = await collect(tx, config, index, privacy);
        const database = await captureDatabase(
          config,
          join(folder, "database"),
          join(secrets, "database.json"),
          j,
          { tx, id: snapshots[0].id },
        );
        index.databaseId = database.id;
        for (const e of metadata) {
          const expires = mediaBackupExpiry(e, privacy),
            signal = AbortSignal.timeout(
              Math.max(1, Math.min(300000, expires - Date.now())),
            ),
            key = randomBytes(32),
            keyId = createHash("sha256").update(key).digest("hex");
          if (expires <= Date.now()) fail();
          const response = await storage.send(
            new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: e.key }),
            { abortSignal: signal },
          );
          if (
            !(response.Body instanceof Readable) ||
            response.ContentLength !== e.size ||
            response.ContentType !== e.type
          ) {
            if (response.Body instanceof Readable) response.Body.destroy();
            fail();
          }
          const encrypted = await encryptObject(
            response.Body,
            join(folder, "media", e.objectId + ".enc"),
            key,
            objectContext(
              {
                objectId: e.objectId,
                mediaId: e.mediaId,
                userId: e.userId,
                key: e.key,
                purpose: e.purpose,
                type: e.type,
              },
              j,
              id,
            ),
            e.size,
            signal,
          );
          const captured = Entry.parse({ ...e, keyId, ...encrypted });
          const keyRecord = {
            ...identity(j, id),
            version: 2 as const,
            objectId: e.objectId,
            key: key.toString("base64"),
            keyId,
            entry: captured,
          };
          await publishPrivateJson(
            join(secrets, "media", e.objectId + ".json"),
            { ...keyRecord, authentication: objectKeyAuth(keyRecord, master) },
          );
          index.objects.push(captured);
        }
        const latest = await j.checkpoint();
        if (
          latest.count !== checkpoint.count ||
          latest.digest !== checkpoint.digest ||
          index.objects.some((e) => mediaBackupExpiry(e, privacy) <= Date.now())
        )
          fail();
      },
      { isolationLevel: "RepeatableRead", timeout: 300000, maxWait: 10000 },
    );
    const perBundle = await readSnapshotKey(join(secrets, "database.json"), j),
      box = sealIndex(index, perBundle, indexContext(j, id));
    await j.exclusive(async (current, view) => {
      const latest = view.checkpoint();
      if (
        latest.count !== checkpoint.count ||
        latest.digest !== checkpoint.digest ||
        index.objects.some((e) => mediaBackupExpiry(e, privacy) <= Date.now())
      )
        fail();
      await publishPrivateJson(join(folder, "bundle.json"), box);
      await writeControl(
        join(secrets, "control.json"),
        {
          ...control,
          status: "READY",
          indexDigest: digest(box),
          journal: checkpoint,
          objects: index.objects.map((e) => e.objectId),
        },
        master,
        true,
      );
      await syncPrivateDirectory(paths.directory);
      await syncPrivateDirectory(paths.secretDirectory);
    });
    return {
      status: "captured-sealed-with-media",
      bundleId: id,
      objects: index.objects.length,
      bytes: index.objects.reduce((n, e) => n + e.size, 0),
      expiresAt,
    };
  } catch (e) {
    // No accepted bundle is left after an ordinary failed producer/transaction.
    await writeControl(
      join(secrets, "control.json"),
      { ...control, status: "PURGED" },
      master,
      true,
    ).catch(() => {});
    await rm(join(secrets, "media"), { recursive: true, force: true });
    await removePrivate(join(secrets, "database.json"));
    await rm(folder, { recursive: true, force: true });
    await syncPrivateDirectory(secrets);
    throw e;
  } finally {
    storage.destroy();
    await db.$disconnect();
    await release();
  }
}
export async function verifyMediaVault(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  now = Date.now(),
) {
  const master = await roots(paths, j),
    c = await readControl(paths, j, id, master);
  if (c.status !== "READY" || Date.parse(c.expiresAt) <= now) fail();
  const release = await vaultLock(paths, id);
  try {
    const index = await readIndex(paths, j, id, c),
      records = [];
    for await (const row of j.records()) records.push(row);
    const privacy = backupPrivacy(records);
    let available = 0,
      excluded = 0;
    const database = await verifySnapshot(
      join(paths.directory, id, "database", index.databaseId),
      join(paths.secretDirectory, id, "database.json"),
      j,
      now,
    );
    if (database.manifest.source !== c.source) fail();
    for (const e of index.objects) {
      if (
        c.purged.includes(e.objectId) ||
        mediaBackupExpiry(e, privacy) <= now
      ) {
        excluded++;
        continue;
      }
      await verifyObject(paths, j, id, e, master);
      available++;
    }
    return {
      status: "verified-sealed-with-media",
      bundleId: id,
      objects: index.objects.length,
      available,
      excluded,
    };
  } finally {
    await release();
  }
}
export async function pruneMediaVault(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  now = Date.now(),
) {
  const master = await roots(paths, j),
    release = await vaultLock(paths, id);
  try {
    const c = await readControl(paths, j, id, master),
      controlPath = join(paths.secretDirectory, id, "control.json");
    if (
      c.status === "PURGED" ||
      c.status === "CAPTURING" ||
      Date.parse(c.expiresAt) <= now
    ) {
      const { authentication, ...body } = c;
      await writeControl(
        controlPath,
        { ...body, status: "PURGED" },
        master,
        true,
      );
      await removePrivate(join(paths.secretDirectory, id, "database.json"));
      await rm(join(paths.secretDirectory, id, "media"), {
        recursive: true,
        force: true,
      });
      await syncPrivateDirectory(join(paths.secretDirectory, id));
      await rm(join(paths.directory, id), { recursive: true, force: true });
      await syncPrivateDirectory(paths.directory);
      await compactPurgedControl(
        paths,
        j,
        id,
        master,
        { ...c, status: "PURGED" },
        now,
      );
      return { status: "purged", bundleId: id, objects: 0 };
    }
    return await j.exclusive(async (records, view) => {
      const privacy = backupPrivacy(records);
      if (c.version !== 2)
        throw Error(
          "Legacy vault format requires reviewed migration; only whole-bundle expiry is supported",
        );
      if (c.status !== "READY")
        throw Error(
          "Incomplete capture needs private operator recovery; do not adopt it",
        );
      if (
        !c.objects ||
        !c.journal ||
        new Set(c.objects).size !== c.objects.length ||
        view.checkpoint().count < c.journal.count
      )
        fail();
      if (view.checkpoint(c.journal.count).digest !== c.journal.digest) fail();
      const selected = new Set(c.purged);
      for (const objectId of c.objects) {
        if (selected.has(objectId)) continue;
        try {
          const s = await signedObjectKey(paths, j, id, objectId, master);
          checkEntry(
            s.entry,
            { journal: c.journal, expiresAt: c.expiresAt },
            j.region,
          );
          if (mediaBackupExpiry(s.entry, privacy) <= now)
            selected.add(objectId);
        } catch (e) {
          if (
            (e as NodeJS.ErrnoException).code === "ENOENT" ||
            e instanceof VaultIntegrityError ||
            e instanceof z.ZodError ||
            e instanceof SyntaxError
          )
            selected.add(objectId);
          else throw e;
        }
      }
      const purged = [...selected],
        { authentication, ...body } = c;
      await writeControl(controlPath, { ...body, purged }, master, true);
      for (const objectId of selected) {
        await removePrivate(
          join(paths.secretDirectory, id, "media", objectId + ".json"),
        );
        await removePrivate(
          join(paths.directory, id, "media", objectId + ".enc"),
        );
      }
      return { status: "media-pruned", bundleId: id, objects: selected.size };
    });
  } finally {
    await release();
  }
}

/** Offline restoration into a distinct, operator-isolated bucket and the exact
 * matching SEALED database. Durable receipts precede writes; no file is READY. */
export async function restoreMediaVault(
  config: Config,
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  options: { temporaryDirectory: string; isolatedTarget: true },
) {
  if (options.isolatedTarget !== true) fail();
  await privateDirectory(options.temporaryDirectory);
  if (
    process.platform !== "linux" ||
    Number((await statfs(options.temporaryDirectory)).type) !== 0x01021994
  )
    throw Error("Media restoration requires private Linux tmpfs staging");
  const master = await roots(paths, j),
    release = await vaultLock(paths, id),
    db = new PrismaClient({ datasourceUrl: config.DATABASE_URL }),
    guard = new PrismaClient({ datasourceUrl: config.DATABASE_URL }),
    storage = client(config);
  const stop = new AbortController(),
    bounded = AbortSignal.any([stop.signal, AbortSignal.timeout(240000)]);
  const send = storage.send.bind(storage);
  storage.send = ((command: any, options?: any) =>
    send(command, {
      ...options,
      abortSignal: options?.abortSignal
        ? AbortSignal.any([bounded, options.abortSignal])
        : bounded,
    })) as typeof storage.send;
  let pendingWork:
    | Promise<{
        status: "media-restored-sealed";
        bundleId: string;
        batchId: string;
        written: number;
        excluded: number;
      }>
    | undefined;
  try {
    const c = await readControl(paths, j, id, master),
      index = await readIndex(paths, j, id, c);
    if (
      config.REGION !== j.region ||
      Date.parse(c.expiresAt) <= Date.now() ||
      c.source === databaseFingerprint(config.DATABASE_URL) ||
      config.S3_BUCKET === index.sourceBucket ||
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.S3_BUCKET)
    )
      fail();
    const storageId = digest({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
    });
    const { checkJournalBinding, reconcileDeletionJournal } =
      await import("./recovery");
    return await guard.$transaction(
      (tx) => {
        pendingWork = (async () => {
          // A separate client holds this transaction while receipt writes COMMIT on
          // db. A failed upload cannot roll back its durable ownership record.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472112)`;
          await checkJournalBinding(tx, j, true);
          const binding = await tx.recoveryBinding.findUniqueOrThrow({
            where: { id: "installation" },
          });
          if (
            binding.state !== "SEALED" ||
            binding.restoredSnapshotId !== index.databaseId ||
            binding.restoredSource !== c.source
          )
            fail();
          await reconcileDeletionJournal(db as Db, config, true);
          const records = [];
          for await (const row of j.records()) records.push(row);
          const initialPrivacy = backupPrivacy(records);
          await assertTargetNotRetired(
            paths,
            j,
            id,
            master,
            c,
            databaseFingerprint(config.DATABASE_URL),
            storageId,
            config.S3_BUCKET,
          );
          let batch = await db.mediaRestoreBatch.findUnique({
            where: { bucket: config.S3_BUCKET },
          });
          const priorFiles = batch
            ? await db.mediaRestoreFile.findMany({
                where: { batchId: batch.id, status: "EXCLUDED" },
              })
            : [];
          let custody: TargetCustody | undefined;
          if (batch) {
            try {
              custody = await readTargetCustody(
                paths,
                j,
                id,
                batch.id,
                master,
                c,
              );
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
            }
          }
          // Validate every surviving metadata binding BEFORE quarantining rows or
          // creating any object. A different database's media cannot be adopted.
          for (const e of index.objects) {
            if (
              custody?.state.purged.includes(e.objectId) ||
              priorFiles.some((f) => f.objectId === e.objectId) ||
              c.purged.includes(e.objectId) ||
              mediaBackupExpiry(e, initialPrivacy) <= Date.now()
            )
              continue;
            await restoreRow(db, e, j.region);
          }
          if (
            batch &&
            (batch.bundleId !== id ||
              batch.snapshotId !== index.databaseId ||
              batch.indexDigest !== c.indexDigest ||
              batch.storage !== storageId ||
              batch.expiresAt.toISOString() !== c.expiresAt)
          )
            fail();
          if (!batch) {
            const listing = await storage.send(
              new ListObjectsV2Command({
                Bucket: config.S3_BUCKET,
                MaxKeys: 1,
              }),
            );
            if (listing.Contents?.length || 0 || listing.IsTruncated)
              throw Error(
                "A new media restore requires an empty isolated bucket",
              );
            // Receipt creation and quarantine commit atomically before any PUT.
            batch = await db.$transaction(async (write) => {
              const b = await write.mediaRestoreBatch.create({
                data: {
                  id: randomUUID(),
                  bundleId: id,
                  snapshotId: index.databaseId,
                  indexDigest: c.indexDigest!,
                  bucket: config.S3_BUCKET,
                  storage: storageId,
                  expiresAt: new Date(c.expiresAt),
                },
              });
              if (index.objects.length)
                await write.mediaRestoreFile.createMany({
                  data: index.objects.map((e) => ({
                    batchId: b.id,
                    objectId: e.objectId,
                    mediaId: e.mediaId,
                    userId: e.userId,
                    key: e.key,
                    sha256: e.sha256,
                    type: e.type,
                    size: e.size,
                    expiresAt: new Date(
                      mediaBackupExpiry(e, initialPrivacy) || Date.now(),
                    ),
                  })),
                });
              await write.media.updateMany({
                where: {
                  status: "READY",
                  id: { in: index.objects.map((e) => e.mediaId) },
                },
                data: { status: "RECOVERY_QUARANTINED" },
              });
              await write.media.updateMany({
                where: {
                  status: {
                    notIn: ["RECOVERY_QUARANTINED", "DELETING", "DELETED"],
                  },
                },
                data: { status: "RECOVERY_EXCLUDED" },
              });
              return b;
            });
          }
          const batchId = batch.id,
            bucket = config.S3_BUCKET;
          custody = await ensureTargetCustody(
            paths,
            j,
            id,
            index,
            c,
            batch,
            databaseFingerprint(config.DATABASE_URL),
            master,
          );
          await tombstoneTarget(
            custody,
            index.objects
              .filter(
                (e) =>
                  c.purged.includes(e.objectId) ||
                  priorFiles.some((f) => f.objectId === e.objectId) ||
                  mediaBackupExpiry(e, initialPrivacy) <= Date.now(),
              )
              .map((e) => e.objectId),
          );
          await db.mediaRestoreBatch.update({
            where: { id: batchId },
            data: { status: "INCOMPLETE" },
          });
          const files = await db.mediaRestoreFile.findMany({
              where: { batchId },
            }),
            expected = new Map(index.objects.map((e) => [e.objectId, e]));
          if (
            files.length !== expected.size ||
            files.some((f) => {
              const e = expected.get(f.objectId);
              return (
                !e ||
                f.mediaId !== e.mediaId ||
                f.userId !== e.userId ||
                f.key !== e.key ||
                f.sha256 !== e.sha256 ||
                f.type !== e.type ||
                f.size !== e.size
              );
            })
          )
            fail();
          const byKey = new Map(index.objects.map((e) => [e.key, e]));
          let continuation: string | undefined,
            listed = 0;
          do {
            const page = await storage.send(
              new ListObjectsV2Command({
                Bucket: bucket,
                MaxKeys: 1000,
                ContinuationToken: continuation,
              }),
            );
            for (const item of page.Contents || []) {
              const e = item.Key ? byKey.get(item.Key) : undefined;
              if (!e || ++listed > MAX_OBJECTS) fail();
              await ownedHead(storage, bucket, e, batchId, id);
            }
            if (
              page.IsTruncated &&
              (!page.NextContinuationToken ||
                page.NextContinuationToken === continuation)
            )
              fail();
            continuation = page.IsTruncated
              ? page.NextContinuationToken
              : undefined;
          } while (continuation);
          let written = 0,
            excluded = 0;
          for (const e of index.objects) {
            const current = [];
            for await (const row of j.records()) current.push(row);
            const deadline = mediaBackupExpiry(e, backupPrivacy(current));
            const receipt = files.find((f) => f.objectId === e.objectId)!;
            if (
              custody.state.purged.includes(e.objectId) ||
              receipt.status === "EXCLUDED" ||
              c.purged.includes(e.objectId) ||
              deadline <= Date.now()
            ) {
              await tombstoneTarget(custody!, [e.objectId]);
              await excludeRestoreFile(db, storage, bucket, e, batchId, id);
              excluded++;
              continue;
            }
            if (Date.parse(c.expiresAt) <= Date.now()) fail();
            await restoreRow(db, e, j.region);
            const head = await maybeHead(storage, bucket, e.key);
            if (head) {
              assertOwned(head, e, batchId, id);
              await verifyRestoredObject(storage, bucket, e, batchId, id);
            } else {
              if (receipt.status === "WRITTEN")
                throw Error(
                  "A previously restored file disappeared; keep the target sealed for investigation",
                );
              let stage: FileHandle | undefined;
              try {
                const path = join(
                  options.temporaryDirectory,
                  randomUUID() + ".media",
                );
                stage = await open(path, "wx+", 0o600);
                await unlink(path);
                const out = privateWriteStream(stage);
                try {
                  await verifyObject(paths, j, id, e, master, out);
                } finally {
                  out.destroy();
                }
                // The plaintext/tag/hash are complete BEFORE handing bytes to S3.
                if (deadline <= Date.now()) {
                  await tombstoneTarget(custody!, [e.objectId]);
                  await excludeRestoreFile(db, storage, bucket, e, batchId, id);
                  excluded++;
                  continue;
                }
                const body = privateReadStream(stage);
                try {
                  await storage.send(
                    new PutObjectCommand({
                      Bucket: bucket,
                      Key: e.key,
                      Body: body,
                      ContentLength: e.size,
                      ContentType: e.type,
                      ChecksumSHA256: Buffer.from(e.sha256, "hex").toString(
                        "base64",
                      ),
                      IfNoneMatch: "*",
                      Metadata: restoreMetadata(e, batchId, id),
                    }),
                    {
                      abortSignal: AbortSignal.timeout(
                        Math.max(1, Math.min(300000, deadline - Date.now())),
                      ),
                    },
                  );
                } finally {
                  body.destroy();
                }
                await verifyRestoredObject(storage, bucket, e, batchId, id);
              } finally {
                await stage?.close();
              }
            }
            await db.mediaRestoreFile.update({
              where: { batchId_objectId: { batchId, objectId: e.objectId } },
              data: { status: "WRITTEN", expiresAt: new Date(deadline) },
            });
            written++;
          }
          // Reconcile decisions accepted during a long transfer. Receipt exclusion
          // is terminal, so a later appeal never recreates a removed target copy.
          for (let pass = 0; pass < 3; pass++) {
            const currentView = await j.view(),
              current = currentView.records,
              privacy = backupPrivacy(current),
              checkpoint = currentView.checkpoint();
            written = 0;
            excluded = 0;
            const stillWritten: MediaVaultEntry[] = [];
            for (const e of index.objects) {
              const receipt = await db.mediaRestoreFile.findUniqueOrThrow({
                  where: {
                    batchId_objectId: { batchId, objectId: e.objectId },
                  },
                }),
                deadline = mediaBackupExpiry(e, privacy);
              if (
                custody.state.purged.includes(e.objectId) ||
                receipt.status === "EXCLUDED" ||
                c.purged.includes(e.objectId) ||
                deadline <= Date.now()
              ) {
                await tombstoneTarget(custody!, [e.objectId]);
                await excludeRestoreFile(db, storage, bucket, e, batchId, id);
                excluded++;
              } else {
                if (receipt.status !== "WRITTEN") fail();
                await restoreRow(db, e, j.region);
                await verifyRestoredObject(storage, bucket, e, batchId, id);
                await db.mediaRestoreFile.update({
                  where: {
                    batchId_objectId: { batchId, objectId: e.objectId },
                  },
                  data: { expiresAt: new Date(deadline) },
                });
                written++;
                stillWritten.push(e);
              }
            }
            const accepted = await j.exclusive(async (latest, view) => {
              const position = view.checkpoint();
              if (
                position.count !== checkpoint.count ||
                position.digest !== checkpoint.digest
              )
                return false;
              if (
                Date.parse(c.expiresAt) <= Date.now() ||
                stillWritten.some(
                  (e) => mediaBackupExpiry(e, privacy) <= Date.now(),
                )
              ) {
                // Re-run with a fresh clock instead of accepting a crossed deadline.
                return false;
              }
              await db.mediaRestoreBatch.update({
                where: { id: batchId },
                data: { status: "STAGED" },
              });
              return true;
            });
            if (accepted) {
              await reconcileDeletionJournal(db as Db, config, true);
              return {
                status: "media-restored-sealed" as const,
                bundleId: id,
                batchId,
                written,
                excluded,
              };
            }
          }
          throw Error(
            "Privacy history changed during restoration; resume the sealed restore",
          );
        })();
        return pendingWork;
      },
      { timeout: 300000, maxWait: 10000 },
    );
  } finally {
    stop.abort();
    await pendingWork?.catch(() => {});
    storage.destroy();
    await db.$disconnect();
    await guard.$disconnect();
    await release();
  }
}
async function restoreRow(
  db: PrismaClient,
  e: MediaVaultEntry,
  region: string,
) {
  const m = await db.media.findUnique({ where: { id: e.mediaId } }),
    user = await db.user.findUnique({ where: { id: e.userId } }),
    state = await db.mediaRecoveryState.findUnique({
      where: { id: e.mediaId },
    });
  if (
    !m ||
    !user ||
    user.deletedAt ||
    user.region !== region ||
    state?.erasedAt ||
    m.userId !== e.userId ||
    m.key !== e.key ||
    m.type !== e.type ||
    m.purpose !== e.purpose ||
    m.size !== e.size ||
    m.createdAt.toISOString() !== e.createdAt ||
    m.attemptId !== (e.attemptId ?? null) ||
    !["READY", "RECOVERY_QUARANTINED"].includes(m.status)
  )
    fail();
}
function restoreMetadata(
  e: MediaVaultEntry,
  batchId: string,
  bundleId: string,
) {
  return {
    "cubers-batch": batchId,
    "cubers-bundle": bundleId,
    "cubers-object": e.objectId,
    "cubers-sha256": e.sha256,
  };
}
function assertOwned(
  h: {
    Metadata?: Record<string, string>;
    ContentLength?: number;
    ContentType?: string;
  },
  e: MediaVaultEntry,
  batchId: string,
  bundleId: string,
) {
  const meta = restoreMetadata(e, batchId, bundleId);
  if (
    h.ContentLength !== e.size ||
    h.ContentType !== e.type ||
    Object.entries(meta).some(([k, v]) => h.Metadata?.[k] !== v)
  )
    throw Object.assign(Error("Restore refuses a foreign or changed object"), {
      privateDiagnostic: JSON.stringify({
        sizeMatches: h.ContentLength === e.size,
        typeMatches: h.ContentType === e.type,
        metadataMatches: Object.entries(meta).every(
          ([k, v]) => h.Metadata?.[k] === v,
        ),
      }),
    });
}
async function maybeHead(s: S3Client, bucket: string, key: string) {
  try {
    return await s.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    if ((e as any).$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}
async function ownedHead(
  s: S3Client,
  bucket: string,
  e: MediaVaultEntry,
  batchId: string,
  bundleId: string,
) {
  const h = await maybeHead(s, bucket, e.key);
  if (!h) fail();
  assertOwned(h, e, batchId, bundleId);
  return h;
}
async function verifyRestoredObject(
  s: S3Client,
  bucket: string,
  e: MediaVaultEntry,
  batchId: string,
  bundleId: string,
) {
  const r = await s.send(new GetObjectCommand({ Bucket: bucket, Key: e.key }), {
    abortSignal: AbortSignal.timeout(300000),
  });
  if (!(r.Body instanceof Readable)) fail();
  try {
    assertOwned(r, e, batchId, bundleId);
    let size = 0;
    const hash = createHash("sha256");
    await pipeline(
      r.Body,
      new Writable({
        write(chunk, _enc, cb) {
          size += chunk.length;
          if (size > e.size) return cb(Error("Restore object size mismatch"));
          hash.update(chunk);
          cb();
        },
      }),
    );
    if (size !== e.size || hash.digest("hex") !== e.sha256) fail();
  } finally {
    r.Body.destroy();
  }
}
async function excludeRestoreFile(
  db: PrismaClient,
  s: S3Client,
  bucket: string,
  e: MediaVaultEntry,
  batchId: string,
  bundleId: string,
) {
  await db.mediaRestoreFile.updateMany({
    where: { batchId, objectId: e.objectId },
    data: { status: "EXCLUDED", expiresAt: new Date() },
  });
  const h = await maybeHead(s, bucket, e.key);
  if (h) {
    assertOwned(h, e, batchId, bundleId);
    if (!h.ETag) fail();
    await s.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: e.key, IfMatch: h.ETag }),
    );
    if (await maybeHead(s, bucket, e.key))
      throw Error("Excluded restore copy remains; keep the target sealed");
  }
  await db.media.updateMany({
    where: { id: e.mediaId, status: "RECOVERY_QUARANTINED" },
    data: { status: "RECOVERY_EXCLUDED" },
  });
}

function targetAuthentication(kind: string, value: unknown, master: Buffer) {
  return createHmac("sha256", master)
    .update("cubers-target-" + kind + "-v1")
    .update(canonicalSnapshotJson(value))
    .digest("hex");
}
function targetFolder(paths: MediaVaultPaths, id: string, batchId: string) {
  Uuid.parse(id);
  Uuid.parse(batchId);
  return join(paths.secretDirectory, id, "restores", batchId);
}
function retiredTarget(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  batchId: string,
  master: Buffer,
  c: z.infer<typeof Control>,
) {
  return readTargetRetirement(
    join(targetFolder(paths, id, batchId), "retired.json"),
    {
      ...identity(j, id),
      batchId,
      source: c.source,
      expiresAt: c.expiresAt,
      indexDigest: c.indexDigest,
    },
    master,
  );
}
async function targetNames(paths: MediaVaultPaths, id: string) {
  let names: string[];
  try {
    names = await readdir(join(paths.secretDirectory, id, "restores"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  if (
    names.length > 1000 ||
    names.some((name) => !Uuid.safeParse(name).success)
  )
    fail();
  return names;
}
async function assertTargetNotRetired(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  master: Buffer,
  c: z.infer<typeof Control>,
  target: string,
  storage: string,
  bucket: string,
) {
  for (const batchId of await targetNames(paths, id)) {
    const proof = await retiredTarget(paths, j, id, batchId, master, c);
    if (
      proof &&
      proof.target === target &&
      proof.storage === storage &&
      proof.bucket === bucket
    )
      throw Error("This isolated destination has terminally retired custody");
  }
}
async function compactPurgedControl(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  master: Buffer,
  c: z.infer<typeof Control>,
  now: number,
) {
  if (c.status !== "PURGED" || Date.parse(c.expiresAt) > now || c.version === 3)
    return false;
  const folder = join(paths.secretDirectory, id);
  if (
    (await readdir(folder)).some(
      (name) => !["control.json", "restores", ".vault-lock"].includes(name),
    )
  )
    fail();
  let ready = true;
  for (const batchId of await targetNames(paths, id)) {
    const proof = await retiredTarget(paths, j, id, batchId, master, c);
    if (!proof) {
      ready = false;
      continue;
    }
    if (
      (await readdir(targetFolder(paths, id, batchId))).sort().join(",") !==
      "retired.json"
    )
      ready = false;
  }
  if (!ready) return false;
  await writeControl(
    join(folder, "control.json"),
    {
      ...identity(j, id),
      version: 3,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      source: c.source,
      status: "PURGED",
      purged: [],
    },
    master,
    true,
  );
  return true;
}
async function emptyTarget(storage: S3Client, bucket: string) {
  const objects = await storage.send(
    new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }),
  );
  if (objects.IsTruncated || (objects.Contents?.length ?? 0) > 0)
    throw Error(
      "Target custody cannot retire while the isolated bucket is nonempty",
    );
}
async function finishTargetRetirement(
  db: PrismaClient,
  folder: string,
  proof: RetiredMediaTarget,
) {
  if (
    (await readdir(folder)).some(
      (name) =>
        !["retired.json", "inventory.json", "state.json"].includes(name),
    )
  )
    fail();
  await db.mediaRestoreBatch.deleteMany({
    where: {
      id: proof.batchId,
      bundleId: proof.bundleId,
      snapshotId: proof.snapshotId,
      indexDigest: proof.indexDigest,
      storage: proof.storage,
      bucket: proof.bucket,
    },
  });
  await removePrivate(join(folder, "inventory.json"));
  await removePrivate(join(folder, "state.json"));
  await syncPrivateDirectory(folder);
}
async function readTargetCustody(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  batchId: string,
  master: Buffer,
  c: z.infer<typeof Control>,
): Promise<TargetCustody> {
  if (await retiredTarget(paths, j, id, batchId, master, c))
    throw Error("This sealed target has terminally retired custody");
  const folder = targetFolder(paths, id, batchId),
    plan = TargetInventory.parse(
      await readPrivateJson(join(folder, "inventory.json"), MAX_INDEX),
    ),
    state = TargetState.parse(
      await readPrivateJson(join(folder, "state.json"), MAX_INDEX),
    );
  const { authentication: planAuth, ...body } = plan,
    { authentication: stateAuth, ...stateBody } = state;
  if (
    !same(plan, j, id) ||
    !same(state, j, id) ||
    plan.batchId !== batchId ||
    state.batchId !== batchId ||
    planAuth !== targetAuthentication("inventory", body, master) ||
    stateAuth !== targetAuthentication("state", stateBody, master) ||
    state.inventoryDigest !== digest(plan) ||
    plan.indexDigest !== c.indexDigest ||
    plan.expiresAt !== c.expiresAt ||
    digest(plan.journal) !== digest(c.journal) ||
    JSON.stringify(plan.objects.map((e) => e.objectId)) !==
      JSON.stringify(c.objects) ||
    new Set(state.purged).size !== state.purged.length ||
    state.purged.some((x) => !plan.objects.some((e) => e.objectId === x))
  )
    fail();
  for (const e of plan.objects) checkEntry(e, plan, j.region);
  return { plan, state, folder, master };
}
async function ensureTargetCustody(
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  index: z.infer<typeof Index>,
  c: z.infer<typeof Control>,
  batch: { id: string; createdAt: Date; storage: string; bucket: string },
  target: string,
  master: Buffer,
) {
  const folder = targetFolder(paths, id, batch.id),
    body = {
      ...identity(j, id),
      version: 1 as const,
      batchId: batch.id,
      snapshotId: index.databaseId,
      indexDigest: c.indexDigest!,
      target,
      storage: batch.storage,
      bucket: batch.bucket,
      createdAt: batch.createdAt.toISOString(),
      expiresAt: index.expiresAt,
      journal: index.journal,
      objects: index.objects,
    },
    plan = {
      ...body,
      authentication: targetAuthentication("inventory", body, master),
    };
  try {
    const existing = await readTargetCustody(paths, j, id, batch.id, master, c);
    if (digest(existing.plan) !== digest(plan)) fail();
    return existing;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const parent = dirname(folder);
  await mkdir(parent, { mode: 0o700 }).catch((e) => {
    if (e.code !== "EEXIST") throw e;
  });
  await privateDirectory(parent);
  if ((await readdir(parent)).length > 1000) fail();
  await mkdir(folder, { mode: 0o700 }).catch((e) => {
    if (e.code !== "EEXIST") throw e;
  });
  await privateDirectory(folder);
  const initial = {
    ...identity(j, id),
    version: 1 as const,
    batchId: batch.id,
    inventoryDigest: digest(plan),
    purged: [] as string[],
  };
  // State precedes publication of the immutable inventory. A crash can retry
  // this exact deterministic plan, but cannot recreate lost accepted state.
  let inventoryExists = false;
  try {
    await readPrivateJson(join(folder, "inventory.json"), MAX_INDEX);
    inventoryExists = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (inventoryExists) fail();
  try {
    await publishPrivateJson(join(folder, "state.json"), {
      ...initial,
      authentication: targetAuthentication("state", initial, master),
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const old = TargetState.parse(
      await readPrivateJson(join(folder, "state.json"), MAX_INDEX),
    );
    if (
      digest(old) !==
      digest({
        ...initial,
        authentication: targetAuthentication("state", initial, master),
      })
    )
      fail();
  }
  await publishPrivateJson(join(folder, "inventory.json"), plan);
  await syncPrivateDirectory(parent);
  await syncPrivateDirectory(dirname(parent));
  return readTargetCustody(paths, j, id, batch.id, master, c);
}
async function tombstoneTarget(custody: TargetCustody, ids: string[]) {
  const purged = [...new Set([...custody.state.purged, ...ids])];
  if (purged.length === custody.state.purged.length) return;
  if (purged.some((id) => !custody.plan.objects.some((e) => e.objectId === id)))
    fail();
  const { authentication, ...body } = custody.state,
    next = { ...body, purged };
  const signed = {
    ...next,
    authentication: targetAuthentication("state", next, custody.master),
  };
  await publishPrivateJson(join(custody.folder, "state.json"), signed, true);
  custody.state = signed;
}

/** Remove only authenticated copies in a matching SEALED target. Neither the
 * artifact index nor any database/index/media decryption key is needed. */
export async function reconcileMediaTarget(
  config: Config,
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  id: string,
  batchId: string,
  now = Date.now(),
) {
  if (config.REGION !== j.region) fail();
  const master = await roots(paths, j),
    release = await vaultLock(paths, id),
    db = new PrismaClient({ datasourceUrl: config.DATABASE_URL }),
    guard = new PrismaClient({ datasourceUrl: config.DATABASE_URL }),
    storage = client(config),
    stop = new AbortController(),
    bounded = AbortSignal.any([stop.signal, AbortSignal.timeout(240000)]),
    send = storage.send.bind(storage);
  storage.send = ((command: any, options?: any) =>
    send(command, {
      ...options,
      abortSignal: options?.abortSignal
        ? AbortSignal.any([bounded, options.abortSignal])
        : bounded,
    })) as typeof storage.send;
  let pending:
    Promise<{ status: string; purged: number; remaining: number }> | undefined;
  try {
    const control = await readControl(paths, j, id, master),
      retired = await retiredTarget(paths, j, id, batchId, master, control),
      custody = retired
        ? undefined
        : await readTargetCustody(paths, j, id, batchId, master, control),
      p = retired ?? custody!.plan;
    if (
      p.target !== databaseFingerprint(config.DATABASE_URL) ||
      p.storage !==
        digest({ endpoint: config.S3_ENDPOINT, region: config.S3_REGION }) ||
      p.bucket !== config.S3_BUCKET
    )
      fail();
    const { checkJournalBinding } = await import("./recovery");
    return await guard.$transaction(
      (tx) => {
        pending = (async () => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472112)`;
          await checkJournalBinding(tx, j, true);
          const binding = await tx.recoveryBinding.findUniqueOrThrow({
            where: { id: "installation" },
          });
          if (
            binding.state !== "SEALED" ||
            binding.restoredSnapshotId !== p.snapshotId ||
            binding.restoredSource !== control.source
          )
            fail();
          const batch = await db.mediaRestoreBatch.findUnique({
            where: { id: batchId },
          });
          if (
            batch &&
            (batch.bundleId !== id ||
              batch.snapshotId !== p.snapshotId ||
              batch.storage !== p.storage ||
              batch.bucket !== p.bucket ||
              batch.indexDigest !== p.indexDigest)
          )
            fail();
          if (retired) {
            await emptyTarget(storage, p.bucket);
            await finishTargetRetirement(
              db,
              targetFolder(paths, id, batchId),
              retired,
            );
            return {
              status: "target-retired-sealed",
              purged: retired.objects,
              remaining: 0,
            };
          }
          const plan = custody!.plan;
          // Commit terminal decisions while sharing the appeal admission lock.
          // Slow object deletion happens AFTER releasing that journal lock.
          if (control.status === "PURGED" || Date.parse(p.expiresAt) <= now)
            await tombstoneTarget(
              custody!,
              plan.objects.map((e) => e.objectId),
            );
          else
            await j.exclusive(async (records, view) => {
              if (
                view.checkpoint(plan.journal.count).digest !==
                plan.journal.digest
              )
                fail();
              const privacy = backupPrivacy(records);
              await tombstoneTarget(
                custody!,
                plan.objects
                  .filter(
                    (e) =>
                      control.status === "PURGED" ||
                      control.purged.includes(e.objectId) ||
                      mediaBackupExpiry(e, privacy) <= now,
                  )
                  .map((e) => e.objectId),
              );
            });
          for (const e of plan.objects) {
            if (!custody!.state.purged.includes(e.objectId)) continue;
            await excludeRestoreFile(db, storage, p.bucket, e, batchId, id);
          }
          if (custody!.state.purged.length === plan.objects.length)
            await db.mediaRestoreBatch.updateMany({
              where: { id: batchId },
              data: { status: "PRUNED" },
            });
          if (
            Date.parse(p.expiresAt) <= now &&
            custody!.state.purged.length === plan.objects.length
          ) {
            await emptyTarget(storage, p.bucket);
            const proof = signTargetRetirement(
              {
                ...identity(j, id),
                version: 1,
                kind: "RETIRED_MEDIA_TARGET",
                batchId,
                source: control.source,
                snapshotId: p.snapshotId,
                indexDigest: p.indexDigest,
                target: p.target,
                storage: p.storage,
                bucket: p.bucket,
                expiresAt: p.expiresAt,
                completedAt: new Date().toISOString(),
                objects: plan.objects.length,
              },
              master,
            );
            await publishPrivateJson(
              join(custody!.folder, "retired.json"),
              proof,
            );
            await finishTargetRetirement(db, custody!.folder, proof);
            return {
              status: "target-retired-sealed",
              purged: plan.objects.length,
              remaining: 0,
            };
          }
          return {
            status: "target-reconciled-sealed",
            purged: custody!.state.purged.length,
            remaining: plan.objects.length - custody!.state.purged.length,
          };
        })();
        return pending;
      },
      { timeout: 300000, maxWait: 10000 },
    );
  } finally {
    stop.abort();
    await pending?.catch(() => {});
    storage.destroy();
    await db.$disconnect();
    await guard.$disconnect();
    await release();
  }
}

/** Bounded regional sweep used by the independent maintenance worker. Every
 * failure is counted and makes its heartbeat unhealthy; other bundles proceed. */
export async function sweepMediaVault(
  config: Config,
  paths: MediaVaultPaths,
  j: FileDeletionJournal,
  scope: "backups" | "target",
  now = Date.now(),
  signal?: AbortSignal,
) {
  if (config.REGION !== j.region) fail();
  const master = await roots(paths, j),
    names = await readdir(paths.secretDirectory);
  if (
    names.length > 1000 ||
    names.some((name) => !Uuid.safeParse(name).success)
  )
    fail();
  let failures = 0,
    bundles = 0,
    targets = 0,
    purged = 0;
  const found = new Set<string>();
  for (const id of names.sort()) {
    if (signal?.aborted) {
      failures++;
      break;
    }
    try {
      const c = await readControl(paths, j, id, master);
      bundles++;
      if (scope === "backups") {
        const result = await pruneMediaVault(paths, j, id, now);
        purged += result.objects;
        continue;
      }
      let plans: string[];
      try {
        plans = await readdir(join(paths.secretDirectory, id, "restores"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw e;
      }
      if (
        plans.length > 1000 ||
        plans.some((name) => !Uuid.safeParse(name).success)
      )
        fail();
      for (const batchId of plans) {
        if (signal?.aborted) {
          failures++;
          break;
        }
        try {
          const retired = await retiredTarget(paths, j, id, batchId, master, c);
          const custody = retired
            ? undefined
            : await readTargetCustody(paths, j, id, batchId, master, c);
          const plan = retired ?? custody!.plan;
          if (
            plan.target !== databaseFingerprint(config.DATABASE_URL) ||
            plan.bucket !== config.S3_BUCKET
          )
            continue;
          found.add(batchId);
          targets++;
          const result = await reconcileMediaTarget(
            config,
            paths,
            j,
            id,
            batchId,
            now,
          );
          purged += result.purged;
        } catch {
          failures++;
        }
      }
    } catch {
      failures++;
    }
  }
  if (scope === "target") {
    const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
    try {
      const { checkJournalBinding } = await import("./recovery");
      await checkJournalBinding(db, j, true);
      const binding = await db.recoveryBinding.findUniqueOrThrow({
        where: { id: "installation" },
      });
      if (binding.state !== "SEALED" || !binding.restoredSnapshotId) fail();
      const batches = await db.mediaRestoreBatch.findMany({
        where: { bucket: config.S3_BUCKET },
        select: { id: true },
        take: 1001,
      });
      if (batches.length > 1000) fail();
      failures += batches.filter((b) => !found.has(b.id)).length;
    } finally {
      await db.$disconnect();
    }
  }
  return { scope, bundles, targets, purged, failures };
}
