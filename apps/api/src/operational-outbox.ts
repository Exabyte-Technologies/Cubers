import { constants } from "node:fs";
import { open, lstat, realpath, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  OperationalEnvelope,
  OperationalAlertEvent,
  OperationalWebhook,
} from "./operational-webhook";
import type { OperationalAlert } from "./operational-alerts";
import { OperationalAlerts } from "./operational-alerts";
import { OperationalSnapshot } from "@cubers/core";
const TTL = 72 * 3600000;
type Pending = {
  id: string;
  body: string;
  mac: string;
  due: number;
  expires: number;
  attempts: number;
  lease: string;
  leaseUntil: number;
};
/** Independent of PostgreSQL/Redis; only fixed aggregate events are persisted. */
export class OperationalOutbox {
  private inTransaction = false;
  private constructor(
    private db: DatabaseSync,
    private credential: OperationalWebhook,
    private capacity = 5000,
  ) {}
  static async open(
    directory: string,
    credential: OperationalWebhook,
    capacity = 5000,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000)
      throw Error("Invalid alert queue bound");
    const dir = await lstat(directory);
    if (
      resolve(directory) !== directory ||
      (await realpath(directory)) !== directory ||
      !dir.isDirectory() ||
      dir.isSymbolicLink() ||
      dir.uid !== process.getuid?.() ||
      (dir.mode & 0o077) !== 0
    )
      throw Error("Use a private owned operational outbox directory");
    const names = await readdir(directory);
    const allowed = [
      "alerts.sqlite",
      "alerts.sqlite-wal",
      "alerts.sqlite-shm",
      "alerts.sqlite-journal",
    ];
    if (names.some((n) => !allowed.includes(n)))
      throw Error("Operational outbox contains unknown files");
    for (const name of names) {
      const st = await lstat(join(directory, name));
      if (
        !st.isFile() ||
        st.isSymbolicLink() ||
        st.nlink !== 1 ||
        st.uid !== process.getuid?.() ||
        (st.mode & 0o777) !== 0o600
      )
        throw Error("Unsafe operational outbox file");
    }
    const path = join(directory, "alerts.sqlite");
    try {
      const file = await open(
        path,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_RDWR |
          constants.O_NOFOLLOW |
          constants.O_NONBLOCK,
        0o600,
      );
      await file.close();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    const original = await lstat(path);
    if (!original.isFile() || original.isSymbolicLink() || original.nlink !== 1)
      throw Error("Unsafe operational outbox database");
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path, { allowExtension: false });
    try {
      const current = await lstat(path);
      if (current.ino !== original.ino || current.dev !== original.dev)
        throw Error("Operational outbox replaced");
      db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=1000;");
      if (original.size) {
        const version = db.prepare("PRAGMA user_version").get() as {
          user_version: number;
        };
        const row = db
          .prepare("SELECT value FROM meta WHERE key='binding'")
          .get() as { value: string } | undefined;
        if (version.user_version !== 1 || row?.value !== credential.binding)
          throw Error(
            "Operational outbox belongs to another version, credential or endpoint",
          );
      }
      db.exec("PRAGMA synchronous=FULL; PRAGMA auto_vacuum=INCREMENTAL;");
      db.exec(
        "BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS pending(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,body TEXT NOT NULL,mac TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,due INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,lease TEXT,leaseUntil INTEGER); CREATE INDEX IF NOT EXISTS pending_due ON pending(due,created);",
      );
      try {
        db.prepare(
          "INSERT OR IGNORE INTO meta(key,value) VALUES('binding',?)",
        ).run(credential.binding);
        if (
          (
            db.prepare("SELECT value FROM meta WHERE key='binding'").get() as {
              value: string;
            }
          ).value !== credential.binding
        )
          throw Error("Operational outbox binding changed");
        db.exec("PRAGMA user_version=1; COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=128;");
      return new OperationalOutbox(db, credential, capacity);
    } catch (e) {
      db.close();
      throw e;
    }
  }
  private transaction<T>(work: () => T) {
    this.db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      this.inTransaction = false;
    }
  }
  private insert(events: OperationalAlert[], now: number) {
    const values = events.map((event) => {
      const alert = OperationalAlertEvent.parse(event);
      if (alert.region !== this.credential.region)
        throw Error("Cross-region operational event");
      return OperationalEnvelope.parse({
        version: 1,
        id: randomUUID(),
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + TTL).toISOString(),
        alert,
      });
    });
    if (values.length > 20) throw Error("Operational batch exceeds limit");
    this.prune(now);
    const count = (
      this.db.prepare("SELECT COUNT(*) AS n FROM pending").get() as {
        n: number;
      }
    ).n;
    if (count + values.length > this.capacity)
      throw Error("Operational outbox full");
    const insert = this.db.prepare(
      "INSERT INTO pending(id,body,mac,created,expires,due) VALUES(?,?,?,?,?,?)",
    );
    for (const value of values) {
      const body = JSON.stringify(value);
      if (Buffer.byteLength(body) > 1500)
        throw Error("Operational envelope too large");
      insert.run(
        value.id,
        body,
        this.credential.mac(body),
        now,
        now + TTL,
        now,
      );
    }
  }
  enqueue(events: OperationalAlert[], now = Date.now()) {
    this.transaction(() => this.insert(events, now));
  }
  observe(value: OperationalSnapshot, now = Date.now()) {
    const snapshot = OperationalSnapshot.parse(value);
    if (snapshot.region !== this.credential.region)
      throw Error("Cross-region alert observation");
    return this.transaction(() => {
      const alerts = new OperationalAlerts();
      const saved = this.db
        .prepare("SELECT value FROM meta WHERE key='observation'")
        .get() as { value: string } | undefined;
      if (saved) {
        const mac = this.db
          .prepare("SELECT value FROM meta WHERE key='observation-mac'")
          .get() as { value: string } | undefined;
        if (mac?.value !== this.credential.mac("state\n" + saved.value))
          throw Error("Operational checkpoint integrity failed");
        const parsed = JSON.parse(saved.value);
        if (
          !Array.isArray(parsed) ||
          parsed.some(
            (row: { region?: string }) => row.region !== this.credential.region,
          )
        )
          throw Error("Cross-region alert checkpoint");
        alerts.restore(parsed);
      }
      const events = alerts.update(snapshot);
      this.insert(events, now);
      const next = JSON.stringify(alerts.checkpoint());
      if (next !== saved?.value) {
        const save = this.db.prepare(
          "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        );
        save.run("observation", next);
        save.run("observation-mac", this.credential.mac("state\n" + next));
      }
      return events;
    });
  }
  prune(now = Date.now()): number {
    if (!this.inTransaction) return this.transaction(() => this.prune(now));
    const result = this.db
      .prepare("DELETE FROM pending WHERE expires<=?")
      .run(now);
    const removed = Number(result.changes);
    if (removed)
      this.db
        .prepare(
          "INSERT INTO meta(key,value) VALUES('expired',?) ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+CAST(excluded.value AS INTEGER) AS TEXT)",
        )
        .run(String(removed));
    return removed;
  }
  claim(now = Date.now()): Pending | undefined {
    return this.transaction(() => {
      this.prune(now);
      const row = this.db
        .prepare("SELECT * FROM pending ORDER BY sequence LIMIT 1")
        .get() as Pending | undefined;
      if (
        !row ||
        row.due > now ||
        (row.leaseUntil !== null && row.leaseUntil > now)
      )
        return;
      const mac = Buffer.from(this.credential.mac(row.body), "hex"),
        saved = Buffer.from(row.mac, "hex");
      if (mac.length !== saved.length || !timingSafeEqual(mac, saved))
        throw Error("Operational queue integrity failed");
      const event = OperationalEnvelope.parse(JSON.parse(row.body));
      if (
        event.id !== row.id ||
        event.alert.region !== this.credential.region ||
        Date.parse(event.expiresAt) !== row.expires
      )
        throw Error("Operational queue context failed");
      const lease = randomUUID(),
        leaseUntil = now + 30000;
      this.db
        .prepare("UPDATE pending SET lease=?,leaseUntil=? WHERE id=?")
        .run(lease, leaseUntil, row.id);
      return { ...row, lease, leaseUntil };
    });
  }
  complete(row: Pending, ok: boolean, now = Date.now()) {
    if (ok)
      return (
        Number(
          this.db
            .prepare(
              "DELETE FROM pending WHERE id=? AND lease=? AND leaseUntil>? AND expires>?",
            )
            .run(row.id, row.lease, now, now).changes,
        ) === 1
      );
    const wait = Math.min(900000, 30000 * 2 ** Math.min(row.attempts, 5));
    return (
      Number(
        this.db
          .prepare(
            "UPDATE pending SET attempts=attempts+1,due=?,lease=NULL,leaseUntil=NULL WHERE id=? AND lease=? AND leaseUntil>?",
          )
          .run(now + wait, row.id, row.lease, now).changes,
      ) === 1
    );
  }
  summary(now = Date.now()) {
    const row = this.db
      .prepare("SELECT COUNT(*) AS pending,MIN(created) AS oldest FROM pending")
      .get() as { pending: number; oldest: number | null };
    return {
      pending: row.pending,
      expiredTotal: Number(
        (
          this.db
            .prepare("SELECT value FROM meta WHERE key='expired'")
            .get() as { value: string } | undefined
        )?.value || 0,
      ),
      oldestAt: row.oldest === null ? null : new Date(row.oldest).toISOString(),
      sampledAt: new Date(now).toISOString(),
    };
  }
  close() {
    this.db.close();
  }
}
