import {
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Db } from "./services";
import type { Config } from "./config";
import type { Authed } from "./security";
import { eligibleGuardian } from "./security";
import { ageOn } from "@cubers/core";
import {
  FileDeletionJournal,
  deletionDigest,
  type DeletionRecord,
} from "./deletion-journal";
import { applyMediaRecoveryRecord } from "./media-recovery";
import { databaseFingerprint } from "./database-snapshot";
type Tx = Prisma.TransactionClient;
const DAY = 86400000;
export async function configuredJournal(config: Config) {
  if (config.DELETION_JOURNAL_MODE !== "file") {
    if (config.NODE_ENV === "production")
      throw Error("Production deletion journal is required");
    return null;
  }
  return FileDeletionJournal.load(
    config.DELETION_JOURNAL_DIRECTORY!,
    config.DELETION_JOURNAL_KEY_FILE!,
    config.REGION,
  );
}
export async function checkJournalBinding(
  tx: Pick<Tx, "recoveryBinding">,
  journal: FileDeletionJournal,
  allowSealed = false,
) {
  const binding = await tx.recoveryBinding.findUnique({
    where: { id: "installation" },
  });
  if (
    !binding ||
    binding.region !== journal.region ||
    binding.installationId !== journal.installationId ||
    binding.journalKeyId !== journal.keyId
  )
    throw Error(
      "Database and independent deletion journal are not the same initialized installation",
    );
  if (
    !allowSealed &&
    (binding.state !== "ACTIVE" || binding.restoredSnapshotId)
  )
    throw Error(
      "Restored database is sealed pending complete recovery acceptance",
    );
}
export async function bindJournal(
  db: Db,
  journal: FileDeletionJournal,
  sourceUrl: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472109)`;
    await journal.bindSource(databaseFingerprint(sourceUrl));
    const existing = await tx.recoveryBinding.findUnique({
      where: { id: "installation" },
    });
    if (existing) {
      await checkJournalBinding(tx, journal);
      return;
    }
    if (await tx.user.count({ where: { region: { not: journal.region } } }))
      throw Error(
        "Recovery initialization cannot adopt another region's accounts",
      );
    // An existing journal with records may belong to a restored database. It
    // cannot be silently adopted through the new-installation command.
    for await (const ignored of journal.records()) {
      void ignored;
      throw Error(
        "Replay an authenticated backup; do not initialize over an existing deletion history",
      );
    }
    await tx.recoveryBinding.create({
      data: {
        id: "installation",
        region: journal.region,
        installationId: journal.installationId,
        journalKeyId: journal.keyId,
        journalDigest: (await journal.checkpoint(0)).digest,
      },
    });
  });
}
async function lockAccounts(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort())
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id}::uuid FOR UPDATE`;
}
export async function queueDeletionRows(
  tx: Tx,
  ids: string[],
  requestedAt: string,
  region: string,
) {
  const users = await tx.user.findMany({
    where: { id: { in: ids } },
    select: { region: true },
  });
  if (users.some((u) => u.region !== region))
    throw Error("Deletion replay cannot cross regional account boundaries");
  for (let offset = 0; offset < ids.length; offset += 1000) {
    const group = ids.slice(offset, offset + 1000),
      now = new Date();
    await tx.user.updateMany({
      where: { id: { in: group } },
      data: { deletedAt: new Date(requestedAt) },
    });
    await tx.session.deleteMany({ where: { userId: { in: group } } });
    await tx.authToken.deleteMany({ where: { userId: { in: group } } });
    const appKeys = await tx.$queryRaw<
      { present: boolean }[]
    >`SELECT to_regclass('public."AppAttestationKey"') IS NOT NULL AS present`;
    if (appKeys[0].present)
      await tx.appAttestationKey.updateMany({
        where: { userId: { in: group }, status: "ACTIVE" },
        data: {
          status: "REVOKED",
          publicKeyPem: null,
          receiptCiphertext: null,
          receiptAutoRefresh: false,
          receiptRefreshAt: null,
          receiptRefreshLease: null,
          receiptRefreshLeaseUntil: null,
          receiptRefreshFailures: 0,
          version: { increment: 1 },
        },
      });

    await tx.post.updateMany({
      where: { authorId: { in: group } },
      data: { status: "DELETED" },
    });
    await tx.attempt.updateMany({
      where: {
        userId: { in: group },
        status: {
          in: ["CREATED", "INSPECTION", "SOLVING", "AWAITING_EVIDENCE"],
        },
      },
      data: {
        status: "INTERRUPTED",
        reason: "Account deletion requested",
        version: { increment: 1 },
      },
    });
    await tx.competitionPublication.updateMany({
      where: { entry: { userId: { in: group } } },
      data: { status: "CANCELLED", revision: { increment: 1 } },
    });
    await tx.achievementCard.updateMany({
      where: { userId: { in: group } },
      data: { status: "CANCELLED", revision: { increment: 1 } },
    });
    await tx.setting.upsert({
      where: { key: `delete:${group[0]}` },
      create: { key: `delete:${group[0]}`, value: { ids: group, requestedAt } },
      update: { value: { ids: group, requestedAt } },
    });
    await tx.accountRemoval.createMany({
      data: group.map((id) => ({
        id,
        requestedAt: new Date(requestedAt),
        expiresAt: new Date(now.getTime() + DAY),
      })),
      skipDuplicates: true,
    });
  }
}
async function applyRecord(tx: Tx, record: DeletionRecord) {
  const digest = deletionDigest(record),
    receipt = await tx.deletionReceipt.findUnique({ where: { id: record.id } });
  if (receipt) {
    if (receipt.digest !== digest)
      throw Error("Deletion receipt does not match independent journal");
    return false;
  }
  if (record.version === 1)
    await queueDeletionRows(tx, record.ids, record.requestedAt, record.region);
  else await applyMediaRecoveryRecord(tx, record);
  await tx.deletionReceipt.create({
    data: {
      id: record.id,
      digest,
      expiresAt: new Date(Date.parse(record.requestedAt) + 31 * DAY),
    },
  });
  return true;
}
/** Validate every record, even when its receipt already exists. No malformed record is skipped. */
export async function reconcileDeletionJournal(
  db: Db,
  config: Config,
  allowSealed = false,
) {
  const binding = await db.recoveryBinding.findUnique({
    where: { id: "installation" },
  });
  if (
    (binding?.state === "SEALED" || binding?.restoredSnapshotId) &&
    !allowSealed
  )
    throw Error(
      "Restored database is sealed pending complete recovery acceptance",
    );
  const journal = await configuredJournal(config);
  if (!journal) return { enabled: false, applied: 0 };
  await checkJournalBinding(db, journal, allowSealed);
  if (
    !allowSealed &&
    (await journal.source()) !== databaseFingerprint(config.DATABASE_URL)
  )
    throw Error("Active database is not the independently bound source");
  const view = await journal.view();
  const initial = await db.recoveryBinding.findUniqueOrThrow({
    where: { id: "installation" },
  });
  const independentFloor = await journal.floor();
  if (initial.journalFloor > independentFloor.count)
    throw Error("Database retirement floor exceeds independent history");
  if (initial.journalCount < independentFloor.count)
    throw Error(
      "Database predates retired privacy history; keep recovery sealed",
    );
  if (
    initial.journalDigest &&
    (await journal.checkpoint(initial.journalCount)).digest !==
      initial.journalDigest
  )
    throw Error("Database replay checkpoint mismatch");
  if (!initial.journalDigest) {
    if (initial.journalCount !== 0 || view.baseCount !== 0)
      throw Error("Legacy replay checkpoint requires reviewed migration");
    await db.recoveryBinding.updateMany({
      where: { id: "installation", journalCount: 0, journalDigest: null },
      data: { journalDigest: view.checkpoint(0).digest },
    });
  }
  await db.recoveryBinding.updateMany({
    where: { id: "installation", journalFloor: { lt: view.baseCount } },
    data: { journalFloor: view.baseCount },
  });
  let applied = 0;
  for (const [index, record] of view.records.entries()) {
    const position = view.checkpoint(view.baseCount + index + 1);
    const changed = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472113)`;
        const current = await tx.recoveryBinding.findUniqueOrThrow({
          where: { id: "installation" },
        });
        const known =
          current.journalCount <= view.checkpoint().count
            ? view.checkpoint(current.journalCount)
            : await journal.checkpoint(current.journalCount);
        if (
          current.journalDigest !== known.digest ||
          current.journalCount < view.baseCount
        )
          throw Error("Unsafe database replay checkpoint");
        if (position.count > current.journalCount + 1)
          throw Error("Privacy replay cannot skip an event");
        const floor =
          current.journalFloor > view.baseCount
            ? (await journal.floor()).count
            : view.baseCount;
        if (current.journalFloor > floor)
          throw Error("Database retirement floor exceeds independent history");
        if (position.count <= floor) return false;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${record.id},83472110))`;
        await lockAccounts(tx, record.ids);
        const changed = await applyRecord(tx, record);
        if (position.count > current.journalCount)
          await tx.recoveryBinding.update({
            where: { id: "installation" },
            data: {
              journalCount: position.count,
              journalDigest: position.digest,
            },
          });
        return changed;
      },
      { timeout: 30000 },
    );
    if (changed) applied++;
  }
  return { enabled: true, applied };
}
/** External durable acceptance precedes DB mutation/acknowledgement. A later DB
 * rollback cannot undo that authenticated, confirmed deletion request. */
export async function requestAccountDeletion(
  db: Db,
  config: Config,
  r: Authed,
  childId?: string,
) {
  const linked = childId
    ? []
    : await db.consent.findMany({
        where: { guardianId: r.user.id },
        select: { childId: true },
      });
  const linkedUsers = childId
    ? []
    : await db.user.findMany({
        where: { id: { in: linked.map((c) => c.childId) } },
        select: { id: true, birthDate: true },
      });
  const ids = childId
    ? [childId.toLowerCase()]
    : [
        r.user.id,
        ...linkedUsers.filter((u) => ageOn(u.birthDate) < 18).map((u) => u.id),
      ];
  return db.$transaction(
    async (tx) => {
      await lockAccounts(tx, [...ids, r.user.id]);
      const actor = await tx.user.findUnique({ where: { id: r.user.id } }),
        session = await tx.session.findUnique({ where: { id: r.sessionId } });
      if (
        !actor ||
        actor.deletedAt ||
        !actor.emailVerified ||
        actor.region !== config.REGION ||
        !session ||
        session.userId !== actor.id ||
        session.expiresAt <= new Date() ||
        !["FULL", ...(childId ? [] : ["DELETION"])].includes(session.scope)
      )
        throw new ForbiddenException("Current deletion access is required");
      if (childId) {
        const consent = await tx.consent.findUnique({
            where: { childId: ids[0] },
          }),
          child = await tx.user.findUnique({ where: { id: ids[0] } });
        if (
          !eligibleGuardian(actor, config.REGION) ||
          consent?.guardianId !== actor.id ||
          !child ||
          child.deletedAt ||
          child.region !== config.REGION ||
          ageOn(child.birthDate) >= 18
        )
          throw new ForbiddenException(
            "Current linked child deletion permission is required",
          );
      } else {
        const current = await tx.consent.findMany({
            where: { guardianId: actor.id },
            select: { childId: true },
          }),
          children = await tx.user.findMany({
            where: { id: { in: current.map((c) => c.childId) } },
            select: { id: true, birthDate: true },
          });
        const fresh = [
          actor.id,
          ...children.filter((u) => ageOn(u.birthDate) < 18).map((u) => u.id),
        ].sort();
        if (JSON.stringify(fresh) !== JSON.stringify([...ids].sort()))
          throw new ConflictException(
            "Linked child accounts changed; retry deletion",
          );
      }
      const targets = await tx.user.findMany({
        where: { id: { in: ids } },
        select: { region: true },
      });
      if (targets.some((user) => user.region !== config.REGION))
        throw new ForbiddenException("Deletion cannot cross account regions");
      let journal: FileDeletionJournal | null,
        record: DeletionRecord | undefined;
      try {
        journal = await configuredJournal(config);
        if (journal) {
          await checkJournalBinding(tx, journal);
          record = await journal.append(ids);
        }
      } catch {
        throw new ServiceUnavailableException(
          "Deletion could not be durably recorded; retry when recovery storage is available",
        );
      }
      if (record) await applyRecord(tx, record);
      else
        await queueDeletionRows(
          tx,
          ids,
          new Date().toISOString(),
          config.REGION,
        );
      await tx.audit.create({
        data: {
          actorId: actor.id,
          action: "account.deletion-request",
          targetId: childId ? ids[0] : actor.id,
          detail: { count: ids.length, durablyJournaled: !!record },
        },
      });
    },
    { timeout: 30000 },
  );
}
