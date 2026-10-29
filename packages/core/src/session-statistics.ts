import { z } from "zod";
import type { Puzzle, Input } from "./contracts";

export const StatisticsQuery = z
  .object({
    timeZone: z
      .string()
      .max(64)
      .default("UTC")
      .transform((value, context) => {
        try {
          // Permit named zones only, never arbitrary offsets or locale strings.
          if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,3}$/.test(value))
            throw Error();
          return new Intl.DateTimeFormat("en", {
            timeZone: value,
          }).resolvedOptions().timeZone;
        } catch {
          context.addIssue({
            code: "custom",
            message: "Use a valid named time zone",
          });
          return z.NEVER;
        }
      }),
  })
  .strict();
export type SessionSolve = {
  id: string;
  puzzle: Puzzle;
  input: Input;
  durationMs: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};
export type SessionCategory = {
  puzzle: Puzzle;
  input: Input;
  solves: number;
  bestMs: number;
  meanMs: number;
  solvingMs: number;
};
export type SolveSession = {
  startedAt: string;
  endedAt: string;
  solves: number;
  solvingMs: number;
  spanMs: number;
  categories: SessionCategory[];
  mayIncludeEarlierSolves: boolean;
};
export type SessionStatistics = {
  timeZone: string;
  window: {
    solves: number;
    limit: 1000;
    hasEarlier: boolean;
    estimatedStarts: number;
  };
  gapMinutes: 30;
  sessions: SolveSession[];
  omittedSessions: number;
  days: {
    day: string;
    solves: number;
    solvingMs: number;
    categories: SessionCategory[];
  }[];
  omittedDays: number;
};
function categories(rows: SessionSolve[]): SessionCategory[] {
  const groups = new Map<string, SessionSolve[]>();
  for (const row of rows) {
    const key = `${row.puzzle}:${row.input}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => {
      const solvingMs = group.reduce((sum, row) => sum + row.durationMs, 0);
      return {
        puzzle: group[0].puzzle,
        input: group[0].input,
        solves: group.length,
        bestMs: Math.min(...group.map((row) => row.durationMs)),
        meanMs: Math.round(solvingMs / group.length),
        solvingMs,
      };
    });
}
/** Only pass owner-authorized approved race/daily solves. No footage or moves are needed. */
export function sessionStatistics(
  input: SessionSolve[],
  timeZone: string,
  hasEarlier = false,
): SessionStatistics {
  if (input.length > 1000) throw Error("Statistics window exceeds 1000 solves");
  const zone = StatisticsQuery.parse({ timeZone }).timeZone;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayOf = (at: number) => {
    const parts = formatter.formatToParts(new Date(at));
    return ["year", "month", "day"]
      .map((key) => parts.find((p) => p.type === key)!.value)
      .join("-");
  };
  const rows = input
    .map((row) => {
      if (
        !Number.isInteger(row.durationMs) ||
        row.durationMs <= 0 ||
        row.durationMs > 3600000
      )
        throw Error("Invalid approved solve duration");
      const start = Date.parse(row.startedAt ?? row.createdAt);
      const recordedEnd = row.finishedAt ? Date.parse(row.finishedAt) : NaN;
      if (!Number.isFinite(start)) throw Error("Invalid solve timestamp");
      const end =
        Number.isFinite(recordedEnd) &&
        recordedEnd >= start &&
        recordedEnd <= start + 3600000
          ? recordedEnd
          : start + row.durationMs;
      return { row, start, end };
    })
    .sort((a, b) => a.start - b.start || a.row.id.localeCompare(b.row.id));
  const sessions: { rows: SessionSolve[]; start: number; end: number }[] = [];
  const days = new Map<string, SessionSolve[]>();
  for (const item of rows) {
    const previous = sessions[sessions.length - 1];
    if (!previous || item.start - previous.end > 30 * 60000) {
      sessions.push({ rows: [item.row], start: item.start, end: item.end });
    } else {
      previous.rows.push(item.row);
      previous.end = Math.max(previous.end, item.end);
    }
    const day = dayOf(item.start),
      daily = days.get(day) || [];
    daily.push(item.row);
    days.set(day, daily);
  }
  return {
    timeZone: zone,
    window: {
      solves: rows.length,
      limit: 1000,
      hasEarlier,
      estimatedStarts: input.filter((row) => !row.startedAt).length,
    },
    gapMinutes: 30,
    sessions: sessions
      .map((s, i) => ({
        startedAt: new Date(s.start).toISOString(),
        endedAt: new Date(s.end).toISOString(),
        solves: s.rows.length,
        solvingMs: s.rows.reduce((sum, row) => sum + row.durationMs, 0),
        spanMs: s.end - s.start,
        categories: categories(s.rows),
        mayIncludeEarlierSolves: hasEarlier && i === 0,
      }))
      .reverse()
      .slice(0, 30),
    omittedSessions: Math.max(0, sessions.length - 30),
    days: [...days.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30)
      .map(([day, daily]) => ({
        day,
        solves: daily.length,
        solvingMs: daily.reduce((sum, row) => sum + row.durationMs, 0),
        categories: categories(daily),
      })),
    omittedDays: Math.max(0, days.size - 30),
  };
}
