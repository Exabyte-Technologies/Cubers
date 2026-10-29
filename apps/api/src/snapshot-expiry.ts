/** Bounded removal of authenticated database-only archives; no database connection. */
import { constants } from "node:fs";
import { lstat, readdir, open, mkdir, rmdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import type { FileDeletionJournal } from "./deletion-journal";
import {
  authenticateSnapshotExpiry,
  databaseFingerprint,
  privateDirectory,
  privatePathContains,
  syncPrivateDirectory,
} from "./database-snapshot";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function regular(path: string) {
  const f = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const st = await f.stat();
    if (
      !st.isFile() ||
      st.nlink !== 1 ||
      st.uid !== process.getuid?.() ||
      (st.mode & 0o777) !== 0o600
    )
      throw Error("Unsafe snapshot expiry file");
    return st;
  } finally {
    await f.close();
  }
}
async function removeKnown(
  path: string,
  expected: Awaited<ReturnType<typeof lstat>>,
) {
  const st = await lstat(path);
  if (
    st.dev !== expected.dev ||
    st.ino !== expected.ino ||
    st.nlink !== 1 ||
    !st.isFile() ||
    st.isSymbolicLink()
  )
    throw Error("Snapshot expiry file changed");
  await unlink(path);
}
export async function sweepSnapshotExpiry(options: {
  directory: string;
  keyFile: string;
  journal: FileDeletionJournal;
  databaseUrl: string;
  now?: number;
  signal?: AbortSignal;
}) {
  const { directory, keyFile, journal } = options,
    now = options.now ?? Date.now();
  const signal = AbortSignal.any([
    AbortSignal.timeout(120000),
    ...(options.signal ? [options.signal] : []),
  ]);
  await privateDirectory(directory);
  if (
    (await privatePathContains(directory, dirname(keyFile))) ||
    (await privatePathContains(directory, journal.directory))
  )
    throw Error("Expiry storage must be separate from key and journal custody");
  const source = databaseFingerprint(options.databaseUrl);
  if ((await journal.source()) !== source)
    throw Error("Snapshot expiry source mismatch");
  const lock = join(directory, ".snapshot-expiry-lock");
  await mkdir(lock, { mode: 0o700 });
  const result = { failures: 0, bundles: 0, targets: 0, purged: 0 };
  try {
    const names = (await readdir(directory)).filter(
      (n) => n !== ".snapshot-expiry-lock",
    );
    if (names.length > 1000 || names.some((n) => !uuid.test(n)))
      throw Error("Snapshot expiry inventory is unsafe or oversized");
    for (const name of names.sort()) {
      if (signal.aborted) {
        if (!options.signal?.aborted) result.failures++;
        break;
      }
      result.bundles++;
      try {
        const folder = join(directory, name);
        await privateDirectory(folder);
        const original = await lstat(folder);
        if (original.isSymbolicLink()) throw Error("Unsafe snapshot directory");
        const files = (await readdir(folder)).sort();
        // A crash after deleting the final manifest can leave only this empty inode.
        if (!files.length) {
          await rmdir(folder);
          await syncPrivateDirectory(directory);
          result.purged++;
          continue;
        }
        if (
          files.some((f) => !["database.enc", "manifest.json"].includes(f)) ||
          !files.includes("manifest.json")
        )
          throw Error("Incomplete snapshot requires operator review");
        const manifestPath = join(folder, "manifest.json"),
          manifestStat = await regular(manifestPath);
        const manifest = await authenticateSnapshotExpiry(
          folder,
          keyFile,
          journal,
          source,
          now,
        );
        if (Date.parse(manifest.expiresAt) > now) continue;
        let encryptedStat;
        if (files.includes("database.enc")) {
          encryptedStat = await regular(join(folder, "database.enc"));
          if (encryptedStat.size !== manifest.bytes)
            throw Error("Snapshot size changed");
          const f = await open(
            join(folder, "database.enc"),
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          );
          try {
            const st = await f.stat();
            if (st.dev !== encryptedStat.dev || st.ino !== encryptedStat.ino)
              throw Error("Snapshot changed");
            const hash = createHash("sha256"),
              buffer = Buffer.alloc(65536);
            for (let offset = 0; offset < manifest.bytes;) {
              signal?.throwIfAborted();
              const { bytesRead } = await f.read(
                buffer,
                0,
                Math.min(buffer.length, manifest.bytes - offset),
                offset,
              );
              if (!bytesRead) throw Error("Snapshot truncated");
              hash.update(buffer.subarray(0, bytesRead));
              offset += bytesRead;
            }
            if (hash.digest("hex") !== manifest.sha256)
              throw Error("Snapshot content changed");
          } finally {
            await f.close();
          }
        }
        signal?.throwIfAborted();
        const current = await lstat(folder);
        if (current.dev !== original.dev || current.ino !== original.ino)
          throw Error("Snapshot directory changed");
        if (encryptedStat) {
          await removeKnown(join(folder, "database.enc"), encryptedStat);
          await syncPrivateDirectory(folder);
        }
        // Keep the authenticated manifest until archive removal is durable, so a
        // crash can retry without ciphertext or retired journal payloads.
        await removeKnown(manifestPath, manifestStat);
        await syncPrivateDirectory(folder);
        await rmdir(folder);
        await syncPrivateDirectory(directory);
        result.purged++;
      } catch {
        result.failures++;
      }
    }
    return result;
  } finally {
    await rmdir(lock);
    await syncPrivateDirectory(directory);
  }
}
