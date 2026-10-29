/** Offline capture/verification/sealed restoration/expiry; no mail, AI or ingress. */
import { z } from "zod";
import { readConfig } from "./config";
import { readStaffFile } from "./staff-files";
import { FileDeletionJournal } from "./deletion-journal";
import {
  initializeMediaVault,
  captureMediaVault,
  verifyMediaVault,
  pruneMediaVault,
  restoreMediaVault,
} from "./media-vault";
const Request = z
  .object({
    operation: z.enum([
      "initialize",
      "capture",
      "verify",
      "prune",
      "restore-sealed",
    ]),
    region: z.enum(["CN", "INTL"]),
    databaseHost: z.string().min(1).max(255),
    databaseName: z.string().min(1).max(100),
    directory: z.string().min(1).max(1024),
    secretDirectory: z.string().min(1).max(1024),
    masterKeyFile: z.string().min(1).max(1024),
    bundleId: z.string().uuid().optional(),
    maintenanceConfirmed: z.boolean().optional(),
    isolatedTarget: z.boolean().optional(),
    temporaryDirectory: z.string().min(1).max(1024).optional(),
    confirmation: z.enum([
      "INITIALIZE MEDIA VAULT",
      "CAPTURE PRIVATE MEDIA BUNDLE",
      "VERIFY PRIVATE MEDIA BUNDLE",
      "PRUNE EXPIRED MEDIA KEYS",
      "RESTORE MEDIA TO SEALED ISOLATED TARGET",
    ]),
  })
  .strict();
export async function runMediaVaultRequest(path: string) {
  if (!process.env.REGION || !process.env.DATABASE_URL)
    throw Error("Explicit target required");
  const config = readConfig({
      ...process.env,
      NODE_ENV: "test",
      AI_MODE: "disabled",
    }),
    request = Request.parse((await readStaffFile(path)).value),
    url = new URL(config.DATABASE_URL),
    confirmation = {
      initialize: "INITIALIZE MEDIA VAULT",
      capture: "CAPTURE PRIVATE MEDIA BUNDLE",
      verify: "VERIFY PRIVATE MEDIA BUNDLE",
      prune: "PRUNE EXPIRED MEDIA KEYS",
      "restore-sealed": "RESTORE MEDIA TO SEALED ISOLATED TARGET",
    };
  if (
    request.region !== config.REGION ||
    request.databaseHost !== url.hostname ||
    request.databaseName !== decodeURIComponent(url.pathname.slice(1)) ||
    request.confirmation !== confirmation[request.operation] ||
    config.DELETION_JOURNAL_MODE !== "file"
  )
    throw Error("Protected target mismatch");
  const journal = await FileDeletionJournal.load(
      config.DELETION_JOURNAL_DIRECTORY!,
      config.DELETION_JOURNAL_KEY_FILE!,
      config.REGION,
    ),
    paths = {
      directory: request.directory,
      secretDirectory: request.secretDirectory,
      masterKeyFile: request.masterKeyFile,
    };
  if (request.operation === "initialize") {
    await initializeMediaVault(paths, journal);
    console.log(
      JSON.stringify({
        status: "media-vault-initialized",
        region: config.REGION,
      }),
    );
  } else if (request.operation === "capture") {
    if (request.maintenanceConfirmed !== true)
      throw Error(
        "Capture requires closed ingress and stopped background writers",
      );
    console.log(
      JSON.stringify(await captureMediaVault(config, paths, journal)),
    );
  } else if (request.operation === "restore-sealed") {
    if (
      !request.bundleId ||
      request.isolatedTarget !== true ||
      !request.temporaryDirectory ||
      request.maintenanceConfirmed !== true
    )
      throw Error(
        "Media restore requires the exact sealed database and isolated empty storage with all writers stopped",
      );
    console.log(
      JSON.stringify(
        await restoreMediaVault(config, paths, journal, request.bundleId, {
          temporaryDirectory: request.temporaryDirectory,
          isolatedTarget: true,
        }),
      ),
    );
  } else {
    if (!request.bundleId) throw Error("Explicit bundle required");
    console.log(
      JSON.stringify(
        request.operation === "verify"
          ? await verifyMediaVault(paths, journal, request.bundleId)
          : await pruneMediaVault(paths, journal, request.bundleId),
      ),
    );
  }
}
if (require.main === module)
  void (async () => {
    const [path, ...extra] = process.argv.slice(2);
    if (!path || extra.length) throw Error("One private request required");
    await runMediaVaultRequest(path);
  })().catch(() => {
    console.error(
      "Media vault command failed. Keep recovery sealed and inspect the protected target, storage, private keys and journal. No credentials or media identifiers are printed.",
    );
    process.exitCode = 1;
  });
