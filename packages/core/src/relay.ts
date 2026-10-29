export type RelayProgress = {
  status: "waiting" | "active" | "complete" | "interrupted";
  completed: number;
  total: number;
  solveTotalMs: number;
  legs: {
    number: number;
    yours: boolean;
    state: "waiting" | "ready" | "solving" | "complete" | "interrupted";
    durationMs: number | null;
  }[];
};
export function relayProgress(
  room: { status: string; roster: string[]; round: number },
  attempts: { userId: string; status: string; durationMs: number | null }[],
  viewerId: string,
): RelayProgress {
  const byUser = new Map(attempts.map((a) => [a.userId, a]));
  let completed = 0,
    solveTotalMs = 0;
  const interrupted =
    room.status === "CLOSED" ||
    attempts.some((a) =>
      ["INTERRUPTED", "EXPIRED", "REJECTED", "DNF"].includes(a.status),
    );
  const legs: RelayProgress["legs"] = room.roster.map((userId, index) => {
    const attempt = byUser.get(userId);
    const approved =
      attempt?.status === "APPROVED" &&
      Number.isSafeInteger(attempt.durationMs) &&
      attempt.durationMs! >= 300;
    if (approved) {
      completed++;
      solveTotalMs += attempt.durationMs!;
    }
    const state = approved
      ? "complete"
      : interrupted
        ? "interrupted"
        : room.status === "OPEN" || index !== room.round
          ? "waiting"
          : attempt && ["INSPECTION", "SOLVING"].includes(attempt.status)
            ? "solving"
            : "ready";
    return {
      number: index + 1,
      yours: userId === viewerId,
      state,
      durationMs: approved ? attempt.durationMs : null,
    };
  });
  return {
    status: interrupted
      ? "interrupted"
      : room.status === "FINISHED" &&
          completed === room.roster.length &&
          completed > 0
        ? "complete"
        : room.status === "OPEN"
          ? "waiting"
          : "active",
    completed,
    total: room.roster.length,
    solveTotalMs,
    legs,
  };
}
