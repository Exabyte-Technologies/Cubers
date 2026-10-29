import type { Prisma } from "@prisma/client";
import type { Config } from "./config";
import type { Db } from "./services";
export function mediaObjectKeys(key: string) {
  return [
    ...new Set([
      key,
      key.replace(/\/(upload|clean)$/, "/upload"),
      key.replace(/\/(upload|clean)$/, "/clean"),
    ]),
  ];
}
export async function queueObjectRemoval(
  db: Pick<Prisma.TransactionClient, "objectRemoval">,
  media: { id: string; key: string },
) {
  const keys = mediaObjectKeys(media.key);
  await db.objectRemoval.upsert({
    where: { id: media.id },
    create: { id: media.id, keys, expiresAt: new Date(Date.now() + 86400000) },
    update: {},
  });
}
/** Persist independently BEFORE deleting current objects or removing their DB rows. */
export async function rememberObjectRemoval(
  db: Db,
  media: { id: string; key: string; userId: string },
  config: Config,
) {
  if (config.DELETION_JOURNAL_MODE === "file") {
    const { recordMediaRecovery } = await import("./media-recovery");
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${media.userId}::uuid FOR UPDATE`;
        const prior = await tx.mediaRecoveryState.findUnique({
          where: { id: media.id },
        });
        if (!prior?.erasedAt)
          await recordMediaRecovery(tx, config, media.userId, {
            kind: "MEDIA_ERASE",
            mediaId: media.id,
            key: media.key,
          });
        else if (prior.userId !== media.userId)
          throw Error("Media erasure owner mismatch");
        await queueObjectRemoval(tx, media);
      },
      { timeout: 30000 },
    );
  } else {
    if (config.NODE_ENV === "production")
      throw Error("Independent media erasure is required");
    await queueObjectRemoval(db, media);
  }
}
