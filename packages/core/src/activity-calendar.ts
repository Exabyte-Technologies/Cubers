import { StatisticsQuery } from "./session-statistics";

export type ActivityDayCounts = {
  day: string;
  lessons: number;
  guidedSolves: number;
  solves: number;
};
export type ActivityDay = ActivityDayCounts & { total: number };
export type ActivityCalendar = {
  timeZone: string;
  from: string;
  to: string;
  days: ActivityDay[];
  totals: {
    lessons: number;
    guidedSolves: number;
    solves: number;
    total: number;
    activeDays: number;
  };
  currentStreak: number;
  longestStreak: number;
};

const DAY = 86_400_000;
const dayNumber = (day: string): number => {
  const at = Date.parse(day + "T00:00:00.000Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(at) ||
    new Date(at).toISOString().slice(0, 10) !== day
  )
    throw new Error("Invalid activity calendar date");
  return at / DAY;
};
const dayString = (day: number) =>
  new Date(day * DAY).toISOString().slice(0, 10);

/** Civil date arithmetic avoids treating a 23/25-hour local day as missing. */
export function activityCalendarWindow(
  timeZone: string,
  now: Date = new Date(),
): Pick<ActivityCalendar, "timeZone" | "from" | "to"> {
  const zone = StatisticsQuery.parse({ timeZone }).timeZone;
  if (!Number.isFinite(now.getTime()))
    throw new Error("Invalid activity clock");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const to = ["year", "month", "day"]
    .map((part) => parts.find((value) => value.type === part)!.value)
    .join("-");
  return { timeZone: zone, from: dayString(dayNumber(to) - 364), to };
}

/** Input is owner-authorized, server-aggregated completed activity, never moves. */
export function activityCalendar(
  rows: ActivityDayCounts[],
  timeZone: string,
  now: Date = new Date(),
): ActivityCalendar {
  if (rows.length > 365)
    throw new Error("Activity calendar exceeds its window");
  const window = activityCalendarWindow(timeZone, now);
  const from = dayNumber(window.from);
  const days = Array.from({ length: 365 }, (_, index): ActivityDay => ({
    day: dayString(from + index),
    lessons: 0,
    guidedSolves: 0,
    solves: 0,
    total: 0,
  }));
  const add = (a: number, b: number) => {
    const result = a + b;
    if (!Number.isSafeInteger(result))
      throw new Error("Activity count overflow");
    return result;
  };
  for (const row of rows) {
    const index = dayNumber(row.day) - from;
    for (const count of [row.lessons, row.guidedSolves, row.solves])
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error("Invalid completed activity count");
    if (index < 0 || index >= days.length) continue;
    const day = days[index];
    day.lessons = add(day.lessons, row.lessons);
    day.guidedSolves = add(day.guidedSolves, row.guidedSolves);
    day.solves = add(day.solves, row.solves);
    day.total = add(add(day.lessons, day.guidedSolves), day.solves);
  }
  const totals = {
    lessons: 0,
    guidedSolves: 0,
    solves: 0,
    total: 0,
    activeDays: 0,
  };
  let run = 0,
    longestStreak = 0;
  for (const day of days) {
    totals.lessons = add(totals.lessons, day.lessons);
    totals.guidedSolves = add(totals.guidedSolves, day.guidedSolves);
    totals.solves = add(totals.solves, day.solves);
    totals.total = add(totals.total, day.total);
    if (day.total) {
      totals.activeDays++;
      longestStreak = Math.max(longestStreak, ++run);
    } else run = 0;
  }
  let currentStreak = 0;
  for (let i = days.length - (days.at(-1)!.total ? 1 : 2); i >= 0; i--) {
    if (!days[i].total) break;
    currentStreak++;
  }
  return { ...window, days, totals, currentStreak, longestStreak };
}
