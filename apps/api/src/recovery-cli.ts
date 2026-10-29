/** Offline operator command; it never opens an HTTP listener or calls AI/email. */
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { readStaffFile } from "./staff-files";
import { readConfig } from "./config";
import { FileDeletionJournal, deletionDigest } from "./deletion-journal";
import {
  bindJournal,
  checkJournalBinding,
  reconcileDeletionJournal,
} from "./recovery";
import type { Db } from "./services";
import { retireDeletionHistory } from "./journal-retention";
import { databaseFingerprint } from "./database-snapshot";
const Request = z
  .object({
    operation: z.enum(["initialize", "check", "replay", "retire"]),
    region: z.enum(["CN", "INTL"]),
    databaseHost: z.string().min(1).max(255),
    databaseName: z.string().min(1).max(100),
    confirmation: z.enum([
      "INITIALIZE RECOVERY",
      "CHECK RECOVERY",
      "REPLAY DELETIONS",
      "RETIRE COMPLETED PRIVACY HISTORY",
    ]),
  })
  .strict();
async function main() {
  const [path, ...extra] = process.argv.slice(2);
  if (!path || extra.length) {
    console.log(
      "Usage: node apps/api/dist/recovery-cli.js /private/recovery-request.json. Read docs/RECOVERY.md. No credentials belong in argv or stdout.",
    );
    return;
  }
  if (!process.env.REGION || !process.env.DATABASE_URL)
    throw Error("Explicit region and database configuration required");
  // This operator command must work before the public release gate opens. It
  // does not start the production API/worker and cannot enable their gates.
  const config = readConfig({
      ...process.env,
      NODE_ENV: "test",
      AI_MODE: "disabled",
    }),
    request = Request.parse((await readStaffFile(path)).value),
    url = new URL(config.DATABASE_URL);
  if (
    request.region !== config.REGION ||
    request.databaseHost !== url.hostname ||
    request.databaseName !== decodeURIComponent(url.pathname.slice(1)) ||
    config.DELETION_JOURNAL_MODE !== "file"
  )
    throw Error("Protected target does not match recovery configuration");
  const confirmation = {
    initialize: "INITIALIZE RECOVERY",
    check: "CHECK RECOVERY",
    replay: "REPLAY DELETIONS",
    retire: "RETIRE COMPLETED PRIVACY HISTORY",
  };
  if (request.confirmation !== confirmation[request.operation])
    throw Error("Explicit operation confirmation required");
  const db = new PrismaClient();
  try {
    if (request.operation === "initialize") {
      if (await db.recoveryBinding.count())
        throw Error("Recovery is already bound; use check instead");
      const journal = await FileDeletionJournal.initialize(
        config.DELETION_JOURNAL_DIRECTORY!,
        config.DELETION_JOURNAL_KEY_FILE!,
        config.REGION,
      );
      await bindJournal(db as Db, journal, config.DATABASE_URL);
      console.log(
        JSON.stringify({
          status: "initialized",
          region: journal.region,
          installationId: journal.installationId,
        }),
      );
    } else {
      const journal = await FileDeletionJournal.load(
        config.DELETION_JOURNAL_DIRECTORY!,
        config.DELETION_JOURNAL_KEY_FILE!,
        config.REGION,
      );
      await checkJournalBinding(db, journal);
      if (request.operation === "retire") {
        const result = await retireDeletionHistory(db as Db, config);
        console.log(
          JSON.stringify({
            status:
              "deferred" in result && Number(result.deferred) > 0
                ? "privacy-history-deferred"
                : "privacy-history-retired",
            ...result,
          }),
        );
        if ("deferred" in result && Number(result.deferred) > 0)
          process.exitCode = 2;
      } else if (request.operation === "replay") {
        const result = await reconcileDeletionJournal(db as Db, config);
        console.log(JSON.stringify({ status: "deletions-queued", ...result }));
      } else {
        const view = await journal.view();
        const binding = await db.recoveryBinding.findUniqueOrThrow({
          where: { id: "installation" },
        });
        if (
          (await journal.source()) !==
            databaseFingerprint(config.DATABASE_URL) ||
          binding.journalFloor > view.baseCount ||
          binding.journalCount < view.baseCount ||
          !binding.journalDigest ||
          view.checkpoint(binding.journalCount).digest !== binding.journalDigest
        )
          throw Error("Unsafe database replay checkpoint");
        let records = 0,
          pending = 0;
        for (const row of view.records) {
          records++;
          const receipt = await db.deletionReceipt.findUnique({
            where: { id: row.id },
          });
          if (receipt && receipt.digest !== deletionDigest(row))
            throw Error("Deletion receipt integrity mismatch");
          if (!receipt || view.baseCount + records > binding.journalCount)
            pending++;
        }
        console.log(
          JSON.stringify({
            status: pending ? "replay-required" : "checked",
            records,
            pending,
            floor: view.baseCount,
          }),
        );
        if (pending) process.exitCode = 2;
      }
    }
  } finally {
    await db.$disconnect();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error(
      "Recovery command failed. Keep ingress closed and check the private target, journal integrity and operator runbook. No credentials or deletion identifiers are printed.",
    );
    process.exitCode = 1;
  });
