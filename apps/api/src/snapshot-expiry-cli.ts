/** Private regional snapshot expiry; no application, database, storage or AI client. */
import { z } from "zod";
import { readStaffFile } from "./staff-files";
import { readConfig } from "./config";
import { FileDeletionJournal } from "./deletion-journal";
import { sweepSnapshotExpiry } from "./snapshot-expiry";
import {
  maintenanceLoop,
  publishMaintenanceHealth,
  checkMaintenanceHealth,
} from "./media-maintenance";
const Request = z
  .object({
    region: z.enum(["CN", "INTL"]),
    databaseHost: z.string().min(1).max(255),
    databaseName: z.string().min(1).max(100),
    directory: z.string().min(1).max(1024),
    keyFile: z.string().min(1).max(1024),
    intervalSeconds: z.number().int().min(30).max(300).default(60),
    confirmation: z.literal("RUN REGIONAL SNAPSHOT EXPIRY"),
  })
  .strict();
export async function runSnapshotExpiryRequest(path: string) {
  if (!process.env.REGION || !process.env.DATABASE_URL)
    throw Error("Explicit source required");
  const request = Request.parse((await readStaffFile(path)).value),
    config = readConfig({
      ...process.env,
      NODE_ENV: "test",
      AI_MODE: "disabled",
    }),
    url = new URL(config.DATABASE_URL);
  if (
    request.region !== config.REGION ||
    request.databaseHost !== url.hostname ||
    request.databaseName !== decodeURIComponent(url.pathname.slice(1)) ||
    config.DELETION_JOURNAL_MODE !== "file"
  )
    throw Error("Snapshot expiry target mismatch");
  const journal = await FileDeletionJournal.load(
    config.DELETION_JOURNAL_DIRECTORY!,
    config.DELETION_JOURNAL_KEY_FILE!,
    config.REGION,
  );
  return { request, config, journal };
}
if (require.main === module)
  void (async () => {
    const [operation, path, ...extra] = process.argv.slice(2);
    if (
      !path ||
      extra.length ||
      !["once", "daemon", "health"].includes(operation)
    )
      throw Error("One private request or health directory required");
    if (operation === "health") {
      console.log(JSON.stringify(await checkMaintenanceHealth(path)));
      return;
    }
    const { request, config, journal } = await runSnapshotExpiryRequest(path),
      stop = new AbortController();
    const pass = () =>
      sweepSnapshotExpiry({
        directory: request.directory,
        keyFile: request.keyFile,
        journal,
        databaseUrl: config.DATABASE_URL,
        signal: stop.signal,
      });
    if (operation === "once") {
      const result = await pass();
      console.log(JSON.stringify(result));
      if (result.failures) process.exitCode = 1;
      return;
    }
    const signal = () => stop.abort();
    process.once("SIGTERM", signal);
    process.once("SIGINT", signal);
    try {
      await maintenanceLoop({
        region: request.region,
        scope: "snapshots",
        intervalMs: request.intervalSeconds * 1000,
        signal: stop.signal,
        pass,
        publish: (state) =>
          publishMaintenanceHealth("/maintenance-health", state),
      });
    } finally {
      process.removeListener("SIGTERM", signal);
      process.removeListener("SIGINT", signal);
    }
  })().catch(() => {
    console.error(
      "Private snapshot expiry failed. Inspect protected regional custody and incomplete archives. No identifiers or credentials are printed.",
    );
    process.exitCode = 1;
  });
