/** Retire only a contiguous 31-day prefix whose irreversible cleanup is done. */
import type { Prisma } from "@prisma/client";
import type { Db } from "./services";
import type { Config } from "./config";
import { configuredJournal, checkJournalBinding } from "./recovery";
import { deletionDigest, type DeletionRecord } from "./deletion-journal";
import { databaseFingerprint } from "./database-snapshot";
const DAY = 86400000;
async function noPendingObjects(
  tx: Prisma.TransactionClient,
  region: string,
  ids: string[],
) {
  if (!ids.length) return true;
  const rows = await tx.$queryRaw<
    Array<{ present: boolean }>
  >`SELECT EXISTS(SELECT 1 FROM public."ObjectRemoval" o,unnest(o.keys) k WHERE split_part(k,'/',1)=${region} AND split_part(k,'/',2)=ANY(${ids}::text[])) AS present`;
  return !rows[0].present;
}
async function cleaned(tx: Prisma.TransactionClient, r: DeletionRecord) {
  if (r.version === 1) {
    for (let i = 0; i < r.ids.length; i += 500) {
      const ids = r.ids.slice(i, i + 500);
      if (
        (await tx.user.count({ where: { id: { in: ids } } })) ||
        (await tx.media.count({ where: { userId: { in: ids } } })) ||
        (await tx.accountRemoval.count({ where: { id: { in: ids } } })) ||
        !(await noPendingObjects(tx, r.region, ids))
      )
        return false;
    }
    return true;
  }
  if (r.kind === "REPLAY_SHARE_WITHDRAWAL")
    return !(await tx.replayShare.count({ where: { id: r.shareId } }));
  if (r.kind === "CONSENT_WITHDRAWAL")
    return (
      !(await tx.media.count({
        where: {
          userId: r.ids[0],
          purpose: "evidence",
          createdAt: { lte: new Date(r.cutoff) },
        },
      })) &&
      !(await tx.accountRemoval.count({ where: { id: r.ids[0] } })) &&
      (await noPendingObjects(tx, r.region, r.ids))
    );
  return (
    !(await tx.media.count({ where: { id: r.mediaId } })) &&
    !(await tx.objectRemoval.count({ where: { id: r.mediaId } })) &&
    !(await tx.attempt.count({ where: { evidenceId: r.mediaId } }))
  );
}
export async function retireDeletionHistory(
  db: Db,
  config: Config,
  now = Date.now(),
) {
  const journal = await configuredJournal(config);
  if (!journal)
    return {
      enabled: false,
      retired: 0,
      floor: 0,
      receipts: 0,
      mediaStates: 0,
      withdrawals: 0,
    };
  if ((await journal.source()) !== databaseFingerprint(config.DATABASE_URL))
    throw Error(
      "History retirement is restricted to the independently bound source database",
    );
  const result = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472113)`;
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout='200ms'");
      await checkJournalBinding(tx, journal);
      const view = await journal.view(),
        binding = await tx.recoveryBinding.findUniqueOrThrow({
          where: { id: "installation" },
        });
      if (
        !binding.journalDigest ||
        binding.journalCount < view.baseCount ||
        view.checkpoint(binding.journalCount).digest !== binding.journalDigest
      )
        throw Error(
          "History retirement requires an authenticated replay checkpoint",
        );
      let through = view.baseCount;
      for (const [index, r] of view.records.slice(0, 500).entries()) {
        if (Date.parse(r.requestedAt) > now - 31 * DAY) break;
        const position = view.baseCount + index + 1,
          receipt = await tx.deletionReceipt.findUnique({
            where: { id: r.id },
          });
        if (
          position > binding.journalCount ||
          !receipt ||
          receipt.digest !== deletionDigest(r) ||
          !(await cleaned(tx, r))
        )
          break;
        through = position;
      }
      // Only reads precede the external publication while this lock is held.
      // No account/media row lock is acquired under the filesystem mutex.
      let eligible = 0;
      for (const r of view.records) {
        if (Date.parse(r.requestedAt) > now - 31 * DAY) break;
        eligible++;
      }
      const retired = await journal.retireThrough(
        through,
        view.checkpoint(through).digest,
        now,
      );
      await tx.recoveryBinding.update({
        where: { id: "installation" },
        data: { journalFloor: through },
      });
      return { ...retired, deferred: eligible - (through - view.baseCount) };
    },
    { timeout: 60000, maxWait: 10000 },
  );
  const view = await journal.view(),
    active = new Set(view.records.map((r) => r.id));
  const removed = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472113)`;
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout='200ms'");
      const binding = await tx.recoveryBinding.findUniqueOrThrow({
        where: { id: "installation" },
      });
      if (
        binding.journalCount < view.baseCount ||
        binding.journalFloor > view.baseCount ||
        !binding.journalDigest ||
        view.checkpoint(binding.journalCount).digest !== binding.journalDigest
      )
        throw Error("Metadata retirement checkpoint mismatch");
      const candidates = await tx.deletionReceipt.findMany({
          where: { expiresAt: { lte: new Date(now) } },
          orderBy: { expiresAt: "asc" },
          take: 1000,
          select: { id: true },
        }),
        ids = candidates.filter((r) => !active.has(r.id)).map((r) => r.id);
      const receipts = await tx.deletionReceipt.deleteMany({
        where: { id: { in: ids } },
      });
      const mediaStates =
        await tx.$executeRaw`DELETE FROM public."MediaRecoveryState" s WHERE s.sequence<=${view.baseCount} AND NOT EXISTS(SELECT 1 FROM public."Media" m WHERE m.id=s.id) AND NOT EXISTS(SELECT 1 FROM public."ObjectRemoval" o WHERE o.id=s.id)`;
      const withdrawals =
        await tx.$executeRaw`DELETE FROM public."ConsentWithdrawalRecovery" s WHERE s.sequence<=${view.baseCount} AND NOT EXISTS(SELECT 1 FROM public."Media" m WHERE m."userId"=s.id AND m.purpose='evidence' AND m."createdAt"<=s.cutoff) AND NOT EXISTS(SELECT 1 FROM public."AccountRemoval" a WHERE a.id=s.id) AND NOT EXISTS(SELECT 1 FROM public."ObjectRemoval" o,unnest(o.keys) k WHERE split_part(k,'/',1)=${config.REGION} AND split_part(k,'/',2)=s.id::text)`;
      return { receipts: receipts.count, mediaStates, withdrawals };
    },
    { timeout: 30000, maxWait: 10000 },
  );
  return { enabled: true, ...result, ...removed };
}
