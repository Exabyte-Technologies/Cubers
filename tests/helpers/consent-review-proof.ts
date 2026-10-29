import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Authed } from "../../apps/api/src/security";
/** Authority-only fixtures: the isolated renderer/real receipt path has separate coverage. */
export async function syntheticConsentReview(
  db: PrismaClient,
  actor: Authed,
  documentId: string,
  ownerId: string,
) {
  const document = await db.media.upsert({
    where: { id: documentId },
    create: {
      id: documentId,
      userId: ownerId,
      key: `INTL/${ownerId}/${documentId}/clean`,
      type: "application/pdf",
      purpose: "consent",
      status: "READY",
      size: 32,
      sha256: "1".repeat(64),
    },
    update: { sha256: "1".repeat(64) },
  });
  return (
    await db.audit.create({
      data: {
        actorId: actor.user.id,
        action: "consent.document-preview",
        targetId: document.id,
        detail: {
          sha256: document.sha256,
          sessionHash: createHash("sha256")
            .update(actor.sessionId)
            .digest("hex"),
          mfaGeneration: actor.user.mfaGeneration,
          region: actor.user.region,
        },
      },
    })
  ).id;
}
