import type { Prisma } from "@prisma/client";
import {
  Input,
  playInput,
  SmartAttemptContext,
  replayTelemetry,
} from "@cubers/core";
/** Ordinary rows inherit the room category; mixed rows freeze their own. */
export function attemptInputWhere(input: string): Prisma.AttemptWhereInput {
  const category = Input.parse(input);
  return {
    OR: [
      { input: category, room: { mixed: true } },
      { input: null, room: { input: category, mixed: false } },
    ],
  };
}
export function exactAttemptTurns(row: {
  input: string | null;
  room: { input: string; mixed: boolean };
  smart: unknown;
}) {
  const input = playInput(row.room, row.input);
  if (input === "virtual") return true;
  if (input !== "smart") return false;
  const context = SmartAttemptContext.safeParse(row.smart);
  return context.success && context.data.continuity === "counter";
}

/** A replay reads a completed archive; it never activates hardware. */
export function archivedReplayInput(row: {
  input: string | null;
  room: { input: string; mixed: boolean; puzzle: string };
  smart: unknown;
  moves: unknown;
  smartSeenAt: Date | null;
  scrambleVerifiedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}) {
  const input = playInput(row.room, row.input);
  if (input === "virtual") return input;
  if (
    input !== "smart" ||
    row.room.puzzle !== "3x3" ||
    !Array.isArray(row.moves) ||
    !row.scrambleVerifiedAt ||
    !row.startedAt ||
    !row.finishedAt ||
    !row.smartSeenAt ||
    row.smartSeenAt < row.startedAt ||
    row.smartSeenAt > row.finishedAt ||
    row.finishedAt.getTime() - row.smartSeenAt.getTime() >= 30000
  )
    return null;
  try {
    replayTelemetry(row.smart, row.moves.length);
    return "smart" as const;
  } catch {
    return null;
  }
}
