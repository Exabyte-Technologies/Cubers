/** Explicit private operator requests only; no HTTP, email or AI. */
import { z } from "zod";
import { readStaffFile } from "./staff-files";
import { readConfig } from "./config";
import { FileDeletionJournal } from "./deletion-journal";
import {
  initializeSnapshotKey,
  captureDatabase,
  verifySnapshot,
  restoreSealedDatabase,
  privateDirectory,
  privatePathContains,
} from "./database-snapshot";
import { dirname } from "node:path";
const Request = z
  .object({
    operation: z.enum([
      "initialize-key",
      "capture",
      "verify",
      "restore-sealed",
    ]),
    region: z.enum(["CN", "INTL"]),
    databaseHost: z.string().min(1).max(255),
    databaseName: z.string().min(1).max(100),
    directory: z.string().min(1).max(1024),
    keyFile: z.string().min(1).max(1024),
    temporaryDirectory: z.string().min(1).max(1024).optional(),
    isolatedTarget: z.boolean().optional(),
    confirmation: z.enum([
      "INITIALIZE SNAPSHOT KEY",
      "CAPTURE DATABASE ONLY",
      "VERIFY DATABASE SNAPSHOT",
      "RESTORE SEALED ISOLATED DATABASE",
    ]),
  })
  .strict();
export async function runSnapshotRequest(path: string) {
  if (!process.env.REGION || !process.env.DATABASE_URL)
    throw Error("Explicit target required");
  const config = readConfig({
      ...process.env,
      NODE_ENV: "test",
      AI_MODE: "disabled",
    }),
    request = Request.parse((await readStaffFile(path)).value),
    url = new URL(config.DATABASE_URL);
  const confirmations = {
    "initialize-key": "INITIALIZE SNAPSHOT KEY",
    capture: "CAPTURE DATABASE ONLY",
    verify: "VERIFY DATABASE SNAPSHOT",
    "restore-sealed": "RESTORE SEALED ISOLATED DATABASE",
  };
  if (
    request.region !== config.REGION ||
    request.databaseHost !== url.hostname ||
    request.databaseName !== decodeURIComponent(url.pathname.slice(1)) ||
    request.confirmation !== confirmations[request.operation] ||
    config.DELETION_JOURNAL_MODE !== "file"
  )
    throw Error("Protected target mismatch");
  const journal = await FileDeletionJournal.load(
    config.DELETION_JOURNAL_DIRECTORY!,
    config.DELETION_JOURNAL_KEY_FILE!,
    config.REGION,
  );
  if (request.operation === "initialize-key") {
    await privateDirectory(request.directory);
    if (
      request.keyFile === request.directory ||
      (await privatePathContains(request.directory, dirname(request.keyFile)))
    )
      throw Error("Snapshot keys must stay outside snapshot storage");
    await initializeSnapshotKey(request.keyFile, journal);
    console.log(
      JSON.stringify({
        status: "snapshot-key-initialized",
        region: config.REGION,
      }),
    );
  } else if (request.operation === "capture") {
    const result = await captureDatabase(
      config,
      request.directory,
      request.keyFile,
      journal,
    );
    console.log(
      JSON.stringify({
        status: "database-only-captured",
        region: result.region,
        snapshotId: result.id,
        bytes: result.bytes,
        expiresAt: result.expiresAt,
      }),
    );
  } else if (request.operation === "verify") {
    const { manifest } = await verifySnapshot(
      request.directory,
      request.keyFile,
      journal,
    );
    console.log(
      JSON.stringify({
        status: "database-only-verified",
        region: manifest.region,
        snapshotId: manifest.id,
      }),
    );
  } else {
    if (request.isolatedTarget !== true || !request.temporaryDirectory)
      throw Error("Restore requires isolated target and private tmpfs");
    console.log(
      JSON.stringify(
        await restoreSealedDatabase(
          config,
          request.directory,
          request.keyFile,
          journal,
          request.temporaryDirectory,
        ),
      ),
    );
  }
}
if (require.main === module)
  void (async () => {
    const [path, ...extra] = process.argv.slice(2);
    if (!path || extra.length)
      throw Error("One private request file is required");
    await runSnapshotRequest(path);
  })().catch(() => {
    console.error(
      "Snapshot command failed. Keep the restore isolated and sealed. Check the protected request, key, journal, manifest, PostgreSQL clients and private runbook; no credentials are printed.",
    );
    process.exitCode = 1;
  });
