import { constants } from "node:fs";
import {
  open,
  stat,
  realpath,
  readdir,
  link,
  unlink,
  mkdir,
  rmdir,
  rename,
} from "node:fs/promises";
import { isAbsolute, resolve, dirname, join } from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
const MAX_BYTES = 8 * 1024 * 1024;
const Uuid = z
  .string()
  .uuid()
  .transform((s) => s.toLowerCase());
const KeyFile = z
  .object({
    version: z.literal(1),
    region: z.enum(["CN", "INTL"]),
    installationId: Uuid,
    key: z.string().max(64),
  })
  .strict();
const Header = z
  .object({
    version: z.literal(1),
    region: z.enum(["CN", "INTL"]),
    installationId: Uuid,
    keyId: z.string().regex(/^[a-f0-9]{64}$/),
    authentication: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const Box = z
  .object({
    version: z.literal(1),
    iv: z.string().max(32),
    tag: z.string().max(32),
    ciphertext: z.string().max(MAX_BYTES),
  })
  .strict();
const Entry = z
  .object({ id: Uuid, digest: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
const InventoryBody = z
  .object({
    version: z.literal(2),
    baseCount: z.number().int().min(0).max(2147483647),
    baseDigest: z.string().regex(/^[a-f0-9]{64}$/),
    retiredBefore: z.string().datetime().nullable(),
    entries: z.array(Entry).max(100000),
    pending: z.array(Entry).max(100000),
  })
  .strict();
const Inventory = InventoryBody.extend({
  authentication: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
type Catalogue = z.infer<typeof InventoryBody>;
export type JournalCheckpoint = { count: number; digest: string };
export type JournalView = {
  records: DeletionRecord[];
  baseCount: number;
  retiredBefore: string | null;
  checkpoint: (count?: number) => JournalCheckpoint;
};
function chain(previous: string, e: z.infer<typeof Entry>) {
  return createHash("sha256")
    .update("cubers-journal-prefix-v2")
    .update(previous)
    .update(canonical(e))
    .digest("hex");
}
const AccountDeletionRecord = z
  .object({
    version: z.literal(1),
    id: Uuid,
    region: z.enum(["CN", "INTL"]),
    installationId: Uuid,
    requestedAt: z.string().datetime(),
    ids: z.array(Uuid).min(1).max(100000),
  })
  .strict();
const MediaEventBase = z.object({
  version: z.literal(2),
  id: Uuid,
  region: z.enum(["CN", "INTL"]),
  installationId: Uuid,
  requestedAt: z.string().datetime(),
  ids: z.array(Uuid).length(1),
  sequence: z.number().int().positive().max(2147483647),
});
const MediaErasure = MediaEventBase.extend({
  kind: z.literal("MEDIA_ERASE"),
  mediaId: Uuid,
  key: z.string().max(256),
}).strict();
const EvidenceDeadline = MediaEventBase.extend({
  kind: z.literal("EVIDENCE_DEADLINE"),
  mediaId: Uuid,
  attemptId: Uuid,
  attemptCreatedAt: z.string().datetime(),
  deadline: z.string().datetime(),
}).strict();
const ConsentWithdrawal = MediaEventBase.extend({
  kind: z.literal("CONSENT_WITHDRAWAL"),
  cutoff: z.string().datetime(),
}).strict();
const ReplayShareWithdrawal = MediaEventBase.extend({
  kind: z.literal("REPLAY_SHARE_WITHDRAWAL"),
  shareId: Uuid,
  decision: z.enum(["CANCELLED", "REJECTED"]),
}).strict();
export const DeletionRecord = z.union([
  AccountDeletionRecord,
  MediaErasure,
  EvidenceDeadline,
  ConsentWithdrawal,
  ReplayShareWithdrawal,
]);
export type DeletionRecord = z.infer<typeof DeletionRecord>;
export type MediaJournalEvent =
  | { kind: "MEDIA_ERASE"; mediaId: string; key: string }
  | {
      kind: "EVIDENCE_DEADLINE";
      mediaId: string;
      attemptId: string;
      attemptCreatedAt: string;
      deadline: string;
    }
  | { kind: "CONSENT_WITHDRAWAL"; cutoff: string }
  | {
      kind: "REPLAY_SHARE_WITHDRAWAL";
      shareId: string;
      decision: "CANCELLED" | "REJECTED";
    };
export function validateMediaEvent(record: DeletionRecord) {
  if (record.version !== 2) return;
  if (record.kind === "MEDIA_ERASE") {
    const prefix = `${record.region}/${record.ids[0]}/`,
      tail = record.key.slice(prefix.length);
    if (
      !record.key.startsWith(prefix) ||
      !/^[0-9a-f-]{36}\/(upload|clean)$/.test(tail) ||
      !z.string().uuid().safeParse(tail.split("/")[0]).success
    )
      invalid();
  } else if (record.kind === "EVIDENCE_DEADLINE") {
    const created = Date.parse(record.attemptCreatedAt),
      deadline = Date.parse(record.deadline);
    if (
      created > Date.parse(record.requestedAt) + 60000 ||
      deadline <= created ||
      deadline > created + 30 * 86400000
    )
      invalid();
  } else if (
    record.kind === "CONSENT_WITHDRAWAL" &&
    Math.abs(Date.parse(record.cutoff) - Date.parse(record.requestedAt)) > 60000
  ) {
    invalid();
  }
}
function invalid(): never {
  throw Error(
    "Deletion journal is unavailable, unbound, unsafe or damaged; keep recovery ingress closed",
  );
}
function canonical(value: unknown) {
  return JSON.stringify(value);
}
export function deletionDigest(record: DeletionRecord) {
  return createHash("sha256").update(canonical(record)).digest("hex");
}
async function directory(path: string, privateMode = true) {
  if (!isAbsolute(path) || resolve(path) !== path) invalid();
  const info = await stat(path);
  if (
    (await realpath(path)) !== path ||
    !info.isDirectory() ||
    (info.mode & 0o022) !== 0 ||
    (privateMode &&
      (info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0))
  )
    invalid();
}
async function file(path: string, max: number) {
  await directory(dirname(path), false);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      ![0, process.getuid?.()].includes(info.uid) ||
      (info.mode & 0o077) !== 0 ||
      info.size > max
    )
      invalid();
    const bytes = Buffer.alloc(max + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > max) invalid();
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, bytesRead),
      ),
    ) as unknown;
  } finally {
    await handle.close();
  }
}
async function syncDirectory(path: string) {
  const handle = await open(path, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function atomic(path: string, value: unknown, replace = false) {
  const dir = dirname(path);
  await directory(dir);
  const pending = join(dir, `.${randomUUID()}.pending`),
    bytes = Buffer.from(canonical(value));
  if (bytes.length > MAX_BYTES) invalid();
  const handle = await open(
    pending,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(pending).catch(() => {});
    throw error;
  }
  await handle.close();
  try {
    if (replace) await rename(pending, path);
    else {
      await link(pending, path);
      await unlink(pending);
    }
    await syncDirectory(dir);
  } catch (error) {
    await unlink(pending).catch(() => {});
    throw error;
  }
}
function keyBytes(encoded: string) {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) invalid();
  return key;
}
function aad(region: string, installationId: string, keyId: string) {
  return Buffer.from(
    canonical({
      format: "cubers-deletion-journal-v1",
      region,
      installationId,
      keyId,
    }),
  );
}
function headerAuth(
  key: Buffer,
  region: string,
  installationId: string,
  keyId: string,
) {
  return createHmac("sha256", key)
    .update(aad(region, installationId, keyId))
    .digest("hex");
}
/** Immutable encrypted records on storage independent of PostgreSQL snapshots. */
export class FileDeletionJournal {
  private constructor(
    readonly directory: string,
    readonly region: "CN" | "INTL",
    readonly installationId: string,
    readonly keyId: string,
    private key: Buffer,
    private clock: () => number = Date.now,
  ) {}
  static async initialize(
    directoryPath: string,
    keyPath: string,
    region: "CN" | "INTL",
    clock: () => number = Date.now,
  ) {
    if (keyPath.startsWith(directoryPath + "/")) invalid();
    await directory(directoryPath);
    await directory(dirname(keyPath));
    if ((await readdir(directoryPath)).length) invalid();
    const key = randomBytes(32),
      installationId = randomUUID(),
      keyId = createHash("sha256").update(key).digest("hex");
    await atomic(keyPath, {
      version: 1,
      region,
      installationId,
      key: key.toString("base64"),
    });
    await atomic(join(directoryPath, "manifest.json"), {
      version: 1,
      region,
      installationId,
      keyId,
      authentication: headerAuth(key, region, installationId, keyId),
    });
    const journal = await this.load(directoryPath, keyPath, region, clock);
    const initial: Catalogue = {
      version: 2,
      baseCount: 0,
      baseDigest: journal.genesis(),
      retiredBefore: null,
      entries: [],
      pending: [],
    };
    await journal.publishInventory(initial, false);
    return journal;
  }
  static async load(
    directoryPath: string,
    keyPath: string,
    region: "CN" | "INTL",
    clock: () => number = Date.now,
  ) {
    try {
      if (keyPath.startsWith(directoryPath + "/")) invalid();
      await directory(directoryPath);
      const secret = KeyFile.parse(await file(keyPath, 4096)),
        header = Header.parse(
          await file(join(directoryPath, "manifest.json"), 4096),
        ),
        key = keyBytes(secret.key),
        keyId = createHash("sha256").update(key).digest("hex");
      if (
        secret.region !== region ||
        header.region !== region ||
        header.installationId !== secret.installationId ||
        header.keyId !== keyId ||
        !timingSafeEqual(
          Buffer.from(header.authentication, "hex"),
          Buffer.from(
            headerAuth(key, region, secret.installationId, keyId),
            "hex",
          ),
        )
      )
        invalid();
      return new FileDeletionJournal(
        directoryPath,
        region,
        header.installationId,
        keyId,
        key,
        clock,
      );
    } catch {
      invalid();
    }
  }
  private seal(record: DeletionRecord) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(aad(this.region, this.installationId, this.keyId));
    const ciphertext = Buffer.concat([
      cipher.update(canonical(record), "utf8"),
      cipher.final(),
    ]);
    return {
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  }
  private sourceAuth(source: string) {
    return createHmac("sha256", this.key)
      .update(aad(this.region, this.installationId, this.keyId))
      .update("source-v1")
      .update(source)
      .digest("hex");
  }
  async source() {
    const v = Header.extend({ source: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(await file(join(this.directory, "source.json"), 4096));
    if (
      v.region !== this.region ||
      v.installationId !== this.installationId ||
      v.keyId !== this.keyId ||
      v.authentication !== this.sourceAuth(v.source)
    )
      invalid();
    return v.source;
  }
  async bindSource(source: string) {
    if (!/^[a-f0-9]{64}$/.test(source)) invalid();
    try {
      if ((await this.source()) !== source) invalid();
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    try {
      await atomic(join(this.directory, "source.json"), {
        version: 1,
        region: this.region,
        installationId: this.installationId,
        keyId: this.keyId,
        source,
        authentication: this.sourceAuth(source),
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    if ((await this.source()) !== source) invalid();
  }
  private genesis() {
    return createHash("sha256")
      .update("cubers-journal-genesis-v2")
      .update(aad(this.region, this.installationId, this.keyId))
      .digest("hex");
  }
  private inventoryAuth(body: Catalogue) {
    return createHmac("sha256", this.key)
      .update(aad(this.region, this.installationId, this.keyId))
      .update("inventory-v2")
      .update(canonical(body))
      .digest("hex");
  }
  private async publishInventory(body: Catalogue, replace = true) {
    await atomic(
      join(this.directory, "inventory.json"),
      { ...body, authentication: this.inventoryAuth(body) },
      replace,
    );
  }
  private async inventory() {
    const value = Inventory.parse(
        await file(join(this.directory, "inventory.json"), MAX_BYTES),
      ),
      { authentication, ...body } = value,
      all = [...value.entries, ...value.pending];
    if (
      authentication !== this.inventoryAuth(body) ||
      new Set(all.map((e) => e.id)).size !== all.length ||
      value.baseCount + value.entries.length > 2147483647 ||
      (!value.baseCount &&
        (value.baseDigest !== this.genesis() ||
          value.retiredBefore !== null)) ||
      (value.baseCount > 0 && !value.retiredBefore)
    )
      invalid();
    return value;
  }
  private position(
    inventory: Catalogue,
    count = inventory.baseCount + inventory.entries.length,
  ): JournalCheckpoint {
    if (
      !Number.isSafeInteger(count) ||
      count < inventory.baseCount ||
      count > inventory.baseCount + inventory.entries.length
    )
      invalid();
    let digest = inventory.baseDigest;
    for (const e of inventory.entries.slice(0, count - inventory.baseCount))
      digest = chain(digest, e);
    return { count, digest };
  }
  private async readView(held = false): Promise<JournalView> {
    let inventory: Catalogue | undefined;
    const records: DeletionRecord[] = [];
    for await (const row of this.readRecords(held, (v) => {
      inventory = v;
    }))
      records.push(row);
    if (!inventory) invalid();
    const catalogue = inventory,
      digests = [catalogue.baseDigest];
    for (const e of catalogue.entries)
      digests.push(chain(digests[digests.length - 1], e));
    return {
      records,
      baseCount: catalogue.baseCount,
      retiredBefore: catalogue.retiredBefore,
      checkpoint: (count = catalogue.baseCount + catalogue.entries.length) => {
        if (
          !Number.isSafeInteger(count) ||
          count < catalogue.baseCount ||
          count > catalogue.baseCount + catalogue.entries.length
        )
          invalid();
        return { count, digest: digests[count - catalogue.baseCount] };
      },
    };
  }
  /** Bounded filesystem mutex shared by API processes. Crash-held locks require
   * operator investigation; never steal a lock and guess whether a write committed. */
  private async lock() {
    const path = join(this.directory, ".inventory-lock");
    for (let i = 0; ; i++) {
      try {
        await mkdir(path, { mode: 0o700 });
        return async () => {
          await rmdir(path);
        };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST" || i >= 500) throw e;
        await new Promise((r) => setTimeout(r, 10));
      }
    }
  }
  /** Authenticated prefix commitment used by snapshots; newer deletions may extend it. */
  async floor() {
    const value = await this.inventory();
    return { count: value.baseCount, digest: value.baseDigest };
  }
  async view() {
    return this.readView(false);
  }
  async checkpoint(prefixLength?: number) {
    return (await this.view()).checkpoint(prefixLength);
  }
  async append(ids: string[]) {
    return this.appendRecord(ids);
  }
  async appendMedia(
    userId: string,
    event: MediaJournalEvent,
    validUntil?: Date,
  ) {
    return this.appendRecord([userId], event, validUntil);
  }
  /** Serialize destructive backup-key pruning with newly accepted privacy events. */
  async exclusive<T>(
    action: (
      records: readonly DeletionRecord[],
      view: JournalView,
    ) => Promise<T>,
  ) {
    const release = await this.lock();
    try {
      const view = await this.readView(true);
      return await action(view.records, view);
    } finally {
      await release();
    }
  }
  private async appendRecord(
    ids: string[],
    event?: MediaJournalEvent,
    validUntil?: Date,
  ) {
    let release: (() => Promise<void>) | undefined;
    try {
      release = await this.lock();
      if (
        validUntil &&
        (!Number.isFinite(validUntil.getTime()) ||
          validUntil.getTime() <= this.clock())
      )
        invalid();
      const inventory = await this.inventory();
      const record = DeletionRecord.parse({
        ...(event || {}),
        version: event ? 2 : 1,
        id: randomUUID(),
        region: this.region,
        installationId: this.installationId,
        requestedAt: new Date(this.clock()).toISOString(),
        ids: [...new Set(ids.map((s) => s.toLowerCase()))],
        ...(event
          ? { sequence: inventory.baseCount + inventory.entries.length + 1 }
          : {}),
      });
      validateMediaEvent(record);
      // Reload binding on every write; never silently initialize an empty replacement directory.
      const header = Header.parse(
        await file(join(this.directory, "manifest.json"), 4096),
      );
      if (
        header.region !== this.region ||
        header.installationId !== this.installationId ||
        header.keyId !== this.keyId ||
        header.authentication !==
          headerAuth(this.key, this.region, this.installationId, this.keyId)
      )
        invalid();
      const names = new Set(
        (await readdir(this.directory)).filter((n) => n.endsWith(".journal")),
      );
      const allowed = new Set(
        [...inventory.entries, ...inventory.pending].map(
          (e) => e.id + ".journal",
        ),
      );
      if (
        inventory.entries.some((e) => !names.has(e.id + ".journal")) ||
        [...names].some((name) => !allowed.has(name))
      )
        invalid();
      const entries = [
        ...inventory.entries,
        { id: record.id, digest: deletionDigest(record) },
      ];
      const { authentication, ...body } = inventory;
      const next = { ...body, entries };
      // Refuse predictable catalogue capacity before accepting a durable record.
      if (
        entries.length > 100000 ||
        Buffer.byteLength(canonical(next)) > MAX_BYTES
      )
        invalid();
      await atomic(
        join(this.directory, `${record.id}.journal`),
        this.seal(record),
      );
      await this.publishInventory(next);
      return record;
    } catch {
      invalid();
    } finally {
      await release?.();
    }
  }
  async retireThrough(
    through: number,
    expectedDigest: string,
    now = this.clock(),
  ) {
    const release = await this.lock();
    try {
      const view = await this.readView(true),
        inventory = await this.inventory();
      if (view.checkpoint(through).digest !== expectedDigest) invalid();
      const advance = through - inventory.baseCount,
        expired = view.records.slice(0, advance),
        cutoff = now - 31 * 86400000;
      if (expired.some((r) => Date.parse(r.requestedAt) > cutoff)) invalid();
      if (!advance && !inventory.pending.length)
        return { retired: 0, floor: through };
      const { authentication, ...body } = inventory;
      const next: Catalogue = {
        ...body,
        baseCount: through,
        baseDigest: expectedDigest,
        retiredBefore: through
          ? new Date(
              Math.max(
                Date.parse(body.retiredBefore || "1970-01-01T00:00:00Z"),
                cutoff,
              ),
            ).toISOString()
          : null,
        entries: body.entries.slice(advance),
        pending: [...body.pending, ...body.entries.slice(0, advance)],
      };
      await this.publishInventory(next);
      for (const e of next.pending) {
        const path = join(this.directory, e.id + ".journal");
        try {
          const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
          try {
            const st = await f.stat();
            if (
              !st.isFile() ||
              st.nlink !== 1 ||
              ![0, process.getuid?.()].includes(st.uid) ||
              st.mode & 0o077
            )
              invalid();
          } finally {
            await f.close();
          }
          await unlink(path);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      }
      await syncDirectory(this.directory);
      await this.publishInventory({ ...next, pending: [] });
      return { retired: advance, floor: through };
    } finally {
      await release();
    }
  }
  records(): AsyncGenerator<DeletionRecord> {
    return this.readRecords(false);
  }
  private async *readRecords(
    held: boolean,
    onInventory?: (v: Catalogue) => void,
  ): AsyncGenerator<DeletionRecord> {
    try {
      await directory(this.directory);
      let inventory: z.infer<typeof Inventory> | undefined,
        names: string[] = [];
      // Read-only workers do not need write access to take a stable catalogue snapshot.
      for (let i = 0; ; i++) {
        if (i >= 500) invalid();
        const before = await this.inventory();
        names = await readdir(this.directory);
        const after = await this.inventory();
        if (
          (held || !names.includes(".inventory-lock")) &&
          before.authentication === after.authentication
        ) {
          inventory = before;
          break;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      if (names.length > 100100) invalid();
      const expected = new Map(inventory.entries.map((e) => [e.id, e.digest]));
      const found = new Set(names.filter((n) => n.endsWith(".journal")));
      const allowed = new Set(
        [...inventory.entries, ...inventory.pending].map(
          (e) => e.id + ".journal",
        ),
      );
      if (
        inventory.entries.some((e) => !found.has(e.id + ".journal")) ||
        [...found].some((name) => !allowed.has(name))
      )
        invalid();
      for (const name of names) {
        if (
          name === "manifest.json" ||
          name === "inventory.json" ||
          name === "source.json" ||
          (held && name === ".inventory-lock") ||
          /^\.[0-9a-f-]{36}\.pending$/.test(name)
        )
          continue;
        if (!/^[0-9a-f-]{36}\.journal$/.test(name)) invalid();
      }
      onInventory?.(inventory);
      for (const [index, entry] of inventory.entries.entries()) {
        const name = `${entry.id}.journal`;
        const path = join(this.directory, name);
        let raw: unknown;
        // The exclusive link/unlink publication step can briefly have two links.
        for (let attempt = 0; ; attempt++) {
          try {
            raw = await file(path, MAX_BYTES);
            break;
          } catch (error) {
            if (attempt >= 4) throw error;
            await new Promise((r) => setTimeout(r, 10));
          }
        }
        const box = Box.parse(raw),
          iv = Buffer.from(box.iv, "base64"),
          tag = Buffer.from(box.tag, "base64");
        if (iv.length !== 12 || tag.length !== 16) invalid();
        const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
        decipher.setAAD(aad(this.region, this.installationId, this.keyId));
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([
          decipher.update(Buffer.from(box.ciphertext, "base64")),
          decipher.final(),
        ]);
        const record = DeletionRecord.parse(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain)),
        );
        validateMediaEvent(record);
        if (
          record.id !== name.slice(0, -8) ||
          record.region !== this.region ||
          record.installationId !== this.installationId ||
          expected.get(record.id) !== deletionDigest(record) ||
          (record.version === 2 &&
            record.sequence !== inventory.baseCount + index + 1) ||
          new Set(record.ids).size !== record.ids.length ||
          Date.parse(record.requestedAt) > this.clock() + 60000
        )
          invalid();
        yield record;
      }
    } catch {
      invalid();
    }
  }
}
