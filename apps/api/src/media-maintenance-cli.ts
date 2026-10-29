/** Independent worker: cleanup continues with the public service SEALED. */
import { z } from "zod";
import { readConfig } from "./config";
import { readStaffFile } from "./staff-files";
import { FileDeletionJournal } from "./deletion-journal";
import { sweepMediaVault } from "./media-vault";
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
    secretDirectory: z.string().min(1).max(1024),
    masterKeyFile: z.string().min(1).max(1024),
    scope: z.enum(["backups", "target"]),
    intervalSeconds: z.number().int().min(30).max(300).default(60),
    isolatedTarget: z.boolean().optional(),
    confirmation: z.literal("RUN REGIONAL MEDIA EXPIRY"),
  })
  .strict();
export async function runMaintenanceRequest(path: string) {
  if (!process.env.REGION || !process.env.DATABASE_URL)
    throw Error("Explicit regional target required");
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
    config.DELETION_JOURNAL_MODE !== "file" ||
    (request.scope === "target" && request.isolatedTarget !== true)
  )
    throw Error("Private maintenance target mismatch");
  const paths = {
    directory: request.directory,
    secretDirectory: request.secretDirectory,
    masterKeyFile: request.masterKeyFile,
  };
  const journal = await FileDeletionJournal.load(
    config.DELETION_JOURNAL_DIRECTORY!,
    config.DELETION_JOURNAL_KEY_FILE!,
    config.REGION,
  );
  return { request, config, paths, journal };
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
    const { request, config, paths, journal } =
      await runMaintenanceRequest(path);
    const stop = new AbortController();
    const pass = () =>
      sweepMediaVault(
        config,
        paths,
        journal,
        request.scope,
        Date.now(),
        stop.signal,
      );
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
        scope: request.scope,
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
      "Private media maintenance failed. Keep recovery sealed and inspect operator custody, current privacy history and storage. No identifiers or credentials are printed.",
    );
    process.exitCode = 1;
  });
