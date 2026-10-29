import type { Prisma } from "@prisma/client";
import type { Room } from "@prisma/client";
const active = ["CREATED", "INSPECTION", "SOLVING"];
const failed = ["INTERRUPTED", "EXPIRED", "REJECTED", "DNF"];
export async function stopRelay(tx: Prisma.TransactionClient, id: string) {
  const changed = await tx.room.updateMany({
    where: { id, mode: "relay", status: { in: ["OPEN", "ACTIVE"] } },
    data: { status: "CLOSED" },
  });
  if (!changed.count) return;
  await tx.attempt.updateMany({
    where: { roomId: id, status: { in: active } },
    data: {
      status: "INTERRUPTED",
      reason: "Cooperative relay ended without a team result",
      version: { increment: 1 },
    },
  });
}
// All relay writers acquire the room lock before changing attempts. Completion
// and handoff therefore commit together, including recovery of older split writes.
export async function synchronizeRelay(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const [room] = await tx.$queryRaw<
    Room[]
  >`SELECT * FROM "Room" WHERE id=${id}::uuid FOR UPDATE`;
  if (!room || room.mode !== "relay" || room.status !== "ACTIVE") return room;
  const rows = await tx.attempt.findMany({
    where: { roomId: id },
    select: { userId: true, status: true, durationMs: true, input: true },
  });
  const byUser = new Map(rows.map((row) => [row.userId, row]));
  let completed = 0,
    blocked = false;
  let invalid =
    room.ranked ||
    room.competitionAttempt ||
    (!room.mixed && !["virtual", "smart"].includes(room.input)) ||
    (room.mixed &&
      rows.some((row) => !["virtual", "smart"].includes(row.input ?? ""))) ||
    room.roster.length < 2 ||
    room.roster.length > 8 ||
    new Set(room.roster).size !== room.roster.length;
  for (const userId of room.roster) {
    const row = byUser.get(userId);
    if (row?.status === "APPROVED") {
      if (blocked || row.durationMs === null || row.durationMs < 300)
        invalid = true;
      else completed++;
    } else {
      if (row && (failed.includes(row.status) || !active.includes(row.status)))
        invalid = true;
      if (blocked && row) invalid = true;
      blocked = true;
    }
  }
  if (
    rows.some((row) => !room.roster.includes(row.userId)) ||
    room.round > completed
  )
    invalid = true;
  if (invalid) {
    await stopRelay(tx, id);
    return { ...room, status: "CLOSED" };
  }
  const status = completed === room.roster.length ? "FINISHED" : "ACTIVE";
  if (room.round !== completed || room.status !== status)
    return tx.room.update({
      where: { id },
      data: { round: completed, status },
    });
  return room;
}

export async function reconcileInterruptedRelays(db: import("./services").Db) {
  const rooms = await db.room.findMany({
    where: {
      mode: "relay",
      status: "ACTIVE",
      attempts: { some: { status: { in: failed } } },
    },
    select: { id: true },
    take: 100,
    orderBy: { id: "asc" },
  });
  for (const room of rooms)
    await db.$transaction((tx) => synchronizeRelay(tx, room.id));
}
