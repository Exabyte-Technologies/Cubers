/** Independent media/permission intent; never performs an external delete in a DB transaction. */
import { ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Config } from "./config";
import type { DeletionRecord, MediaJournalEvent } from "./deletion-journal";
import { deletionDigest } from "./deletion-journal";
import { configuredJournal, checkJournalBinding } from "./recovery";
import { queueObjectRemoval, mediaObjectKeys } from "./object-removal";
type Tx = Prisma.TransactionClient;
type MediaRecord = Extract<DeletionRecord, { version: 2 }>;
const DAY = 86400000;
export async function applyMediaRecoveryRecord(tx: Tx, record: MediaRecord) {
  const userId = record.ids[0],
    user = await tx.user.findUnique({
      where: { id: userId },
      select: { region: true },
    });
  if (user && user.region !== record.region)
    throw Error("Media recovery cannot cross regions");
  if (record.kind === "REPLAY_SHARE_WITHDRAWAL") {
    const [present] = await tx.$queryRaw<
      { present: boolean }[]
    >`SELECT to_regclass('public."ReplayShare"') IS NOT NULL AS present`;
    if (!present.present) return;
    const share = await tx.replayShare.findUnique({
      where: { id: record.shareId },
    });
    if (share && share.userId !== userId)
      throw Error("Replay withdrawal owner mismatch");
    await tx.replayShare.updateMany({
      where: {
        id: record.shareId,
        userId,
        status: { in: ["PENDING_GUARDIAN", "PENDING_REVIEW", "READY"] },
      },
      data: {
        status: record.decision,
        tokenHash: null,
        revision: { increment: 1 },
      },
    });
    return;
  }
  if (record.kind === "CONSENT_WITHDRAWAL") {
    const prior = await tx.consentWithdrawalRecovery.findUnique({
      where: { id: userId },
    });
    if (prior && prior.sequence >= record.sequence) return;
    const cutoff = new Date(
      Math.max(prior?.cutoff.getTime() || 0, Date.parse(record.cutoff)),
    );
    await tx.consentWithdrawalRecovery.upsert({
      where: { id: userId },
      create: { id: userId, cutoff, sequence: record.sequence },
      update: { cutoff, sequence: record.sequence },
    });
    await tx.consent.updateMany({
      where: { childId: userId },
      data: { status: "REVOKED", publicPosting: false, recording: false },
    });
    await tx.session.deleteMany({ where: { userId } });
    await tx.post.updateMany({
      where: { authorId: userId },
      data: { status: "PENDING", guardianApproved: false },
    });
    if (
      (
        await tx.$queryRaw<
          { present: boolean }[]
        >`SELECT to_regclass('public."ReplayShare"') IS NOT NULL AS present`
      )[0].present
    )
      await tx.replayShare.updateMany({
        where: {
          userId,
          createdAt: { lte: cutoff },
          status: { in: ["PENDING_GUARDIAN", "PENDING_REVIEW", "READY"] },
        },
        data: {
          status: "CANCELLED",
          tokenHash: null,
          revision: { increment: 1 },
        },
      });
    await tx.achievementCard.updateMany({
      where: { userId },
      data: { status: "CANCELLED", revision: { increment: 1 } },
    });
    await tx.competitionPublication.updateMany({
      where: { entry: { userId } },
      data: { status: "CANCELLED", revision: { increment: 1 } },
    });
    await tx.attempt.updateMany({
      where: {
        userId,
        createdAt: { lte: cutoff },
        room: { ranked: true, input: { not: "virtual" } },
        status: {
          in: [
            "CREATED",
            "INSPECTION",
            "SOLVING",
            "AWAITING_EVIDENCE",
            "PROVISIONAL",
            "APPROVED",
            "REJECTED",
          ],
        },
      },
      data: {
        status: "REJECTED",
        reason: "Guardian withdrew recording permission",
        finalizedAt: new Date(record.requestedAt),
        evidenceDeleteAt: new Date(record.requestedAt),
        version: { increment: 1 },
      },
    });
    await tx.media.updateMany({
      where: { userId, purpose: "evidence", createdAt: { lte: cutoff } },
      data: { status: "DELETING" },
    });
    return;
  }
  const media = await tx.media.findUnique({ where: { id: record.mediaId } }),
    prior = await tx.mediaRecoveryState.findUnique({
      where: { id: record.mediaId },
    });
  if ((media && media.userId !== userId) || (prior && prior.userId !== userId))
    throw Error("Media recovery owner mismatch");
  if (record.kind === "MEDIA_ERASE") {
    const keys = mediaObjectKeys(record.key);
    if (media && !keys.includes(media.key))
      throw Error("Media recovery object mismatch");
    const erasedAt = new Date(
      Math.min(
        prior?.erasedAt?.getTime() ?? Infinity,
        Date.parse(record.requestedAt),
      ),
    );
    await tx.mediaRecoveryState.upsert({
      where: { id: record.mediaId },
      create: {
        id: record.mediaId,
        userId,
        sequence: record.sequence,
        erasedAt,
      },
      update: {
        erasedAt,
        sequence: Math.max(record.sequence, prior?.sequence || 0),
      },
    });
    await queueObjectRemoval(tx, { id: record.mediaId, key: record.key });
    await tx.media.updateMany({
      where: { id: record.mediaId, userId },
      data: { status: "DELETING" },
    });
    return;
  }
  // Erasure is terminal; a later appeal/deadline cannot resurrect the same upload UUID.
  if (prior?.erasedAt || (prior && prior.sequence >= record.sequence)) return;
  if (
    media &&
    (media.purpose !== "evidence" || media.attemptId !== record.attemptId)
  )
    throw Error("Evidence recovery binding mismatch");
  const attempt = await tx.attempt.findUnique({
    where: { id: record.attemptId },
  });
  if (
    attempt &&
    (attempt.userId !== userId ||
      attempt.createdAt.toISOString() !== record.attemptCreatedAt)
  )
    throw Error("Evidence recovery attempt mismatch");
  const deadline = new Date(record.deadline);
  await tx.mediaRecoveryState.upsert({
    where: { id: record.mediaId },
    create: {
      id: record.mediaId,
      userId,
      sequence: record.sequence,
      deadline,
      attemptId: record.attemptId,
    },
    update: {
      sequence: record.sequence,
      deadline,
      attemptId: record.attemptId,
    },
  });
  await tx.attempt.updateMany({
    where: { id: record.attemptId, userId },
    data: { evidenceDeleteAt: deadline },
  });
  // Do not erase from an intermediate deadline during replay: a later, valid
  // appeal may extend it. Reads and the worker use the final replayed deadline.
}
export async function recordMediaRecovery(
  tx: Tx,
  config: Config,
  userId: string,
  event: MediaJournalEvent,
  validUntil?: Date,
) {
  try {
    const journal = await configuredJournal(config);
    if (!journal) return false;
    await checkJournalBinding(tx, journal);
    const record = await journal.appendMedia(userId, event, validUntil);
    if (record.version !== 2) throw Error("Invalid media recovery record");
    await applyMediaRecoveryRecord(tx, record);
    await tx.deletionReceipt.create({
      data: {
        id: record.id,
        digest: deletionDigest(record),
        expiresAt: new Date(Date.parse(record.requestedAt) + 31 * DAY),
      },
    });
    return true;
  } catch {
    throw new ServiceUnavailableException(
      "The privacy decision could not be durably recorded; retry when independent recovery storage is available",
    );
  }
}
