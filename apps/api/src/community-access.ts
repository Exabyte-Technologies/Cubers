import { ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Config } from "./config";
export function communityAvailable(config: Config) {
  if (config.REGION === "CN" && config.CN_SOCIAL_APPROVED !== "true")
    throw new ForbiddenException(
      "Mainland community service is awaiting operational and filing review",
    );
}
export async function readableClub(
  db: Pick<Prisma.TransactionClient, "club" | "membership">,
  userId: string,
  id: string,
  ownerPreview = false,
) {
  const club = await db.club.findUnique({ where: { id } });
  if (!club) return null;
  if (ownerPreview && club.ownerId === userId) return club;
  if (!["APPROVED", "ARCHIVED"].includes(club.status)) return null;
  if (!club.private && club.status === "APPROVED") return club;
  return (await db.membership.findFirst({
    where: { clubId: id, userId, status: "APPROVED" },
  }))
    ? club
    : null;
}
