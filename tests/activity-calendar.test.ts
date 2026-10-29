import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activityCalendar,
  activityCalendarWindow,
  type ActivityDayCounts,
} from "@cubers/core";

const record = (
  day: string,
  lessons = 1,
  guidedSolves = 0,
  solves = 0,
): ActivityDayCounts => ({ day, lessons, guidedSolves, solves });

test("activity calendars contain exactly365 ordered civil days, including leap day and honest empty days", () => {
  const result = activityCalendar([], "UTC", new Date("2024-03-01T12:00:00Z"));
  assert.equal(result.days.length, 365);
  assert.equal(result.from, "2023-03-03");
  assert.equal(result.to, "2024-03-01");
  assert.ok(result.days.some((day) => day.day === "2024-02-29"));
  assert.ok(result.days.every((day) => day.total === 0));
  assert.deepEqual(result.totals, {
    lessons: 0,
    guidedSolves: 0,
    solves: 0,
    total: 0,
    activeDays: 0,
  });
  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 0);
  for (let index = 1; index < result.days.length; index++)
    assert.equal(
      Date.parse(result.days[index].day) -
        Date.parse(result.days[index - 1].day),
      86400000,
    );
});

test("activity calendar local today follows the named zone rather than UTC, across DST and the date line", () => {
  assert.equal(
    activityCalendarWindow("Asia/Shanghai", new Date("2026-10-25T16:01:00Z"))
      .to,
    "2026-10-26",
  );
  assert.equal(
    activityCalendarWindow(
      "America/Los_Angeles",
      new Date("2026-10-26T00:01:00Z"),
    ).to,
    "2026-10-25",
  );
  for (const at of ["2026-03-08T10:01:00Z", "2026-11-01T09:01:00Z"])
    assert.equal(
      activityCalendar([], "America/Los_Angeles", new Date(at)).days.length,
      365,
    );
  const east = activityCalendarWindow(
    "Pacific/Kiritimati",
    new Date("2026-01-01T12:00:00Z"),
  );
  assert.equal(east.to, "2026-01-02");
});

test("activity sums completed categories, merges duplicate daily groups and ignores out-of-window rows", () => {
  const result = activityCalendar(
    [
      record("2026-10-25", 2, 1, 3),
      record("2026-10-25", 1, 2, 0),
      record("2026-10-26", 0, 0, 4),
      record("2026-10-27", 999),
      record("2024-01-01", 999),
    ],
    "UTC",
    new Date("2026-10-26T12:00:00Z"),
  );
  assert.deepEqual(result.days.at(-2), {
    day: "2026-10-25",
    lessons: 3,
    guidedSolves: 3,
    solves: 3,
    total: 9,
  });
  assert.deepEqual(result.totals, {
    lessons: 3,
    guidedSolves: 3,
    solves: 7,
    total: 13,
    activeDays: 2,
  });
});

test("activity streaks distinguish longest run from a current run, allowing an unfinished today", () => {
  const rows = [
    "2026-10-10",
    "2026-10-11",
    "2026-10-12",
    "2026-10-24",
    "2026-10-25",
  ].map((day) => record(day));
  const today = new Date("2026-10-26T12:00:00Z");
  const pendingToday = activityCalendar(rows, "UTC", today);
  assert.equal(pendingToday.currentStreak, 2);
  assert.equal(pendingToday.longestStreak, 3);
  const activeToday = activityCalendar(
    [...rows, record("2026-10-26")],
    "UTC",
    today,
  );
  assert.equal(activeToday.currentStreak, 3);
  assert.equal(activeToday.longestStreak, 3);
  assert.equal(
    activityCalendar(rows, "UTC", new Date("2026-10-27T12:00:00Z"))
      .currentStreak,
    0,
  );
});

test("activity data rejects invalid zones, dates, counts and unbounded aggregates", () => {
  for (const zone of ["Mars/City", "+08:00", "UTC; DROP TABLE User"])
    assert.throws(() => activityCalendar([], zone));
  for (const day of ["2026-02-30", "2026-2-03", "not-a-date"])
    assert.throws(() => activityCalendar([record(day)], "UTC"));
  for (const lessons of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() =>
      activityCalendar([record("2026-10-26", lessons)], "UTC"),
    );
  assert.throws(() =>
    activityCalendar(Array(366).fill(record("2026-10-26")), "UTC"),
  );
  assert.throws(() => activityCalendar([], "UTC", new Date(NaN)));
  assert.throws(() =>
    activityCalendar(
      [record("2026-10-26", Number.MAX_SAFE_INTEGER), record("2026-10-26", 1)],
      "UTC",
      new Date("2026-10-26T12:00:00Z"),
    ),
  );
});
