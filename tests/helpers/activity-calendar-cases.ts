import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

type Harness = {
  db: PrismaClient;
  origin: string;
  cnOrigin: string;
  fixture: (
    name: string,
    birthDate: string,
  ) => Promise<{ u: { id: string }; token: string }>;
  call: (
    path: string,
    body?: unknown,
    token?: string,
    method?: string,
    base?: string,
  ) => Promise<{ status: number; body: any }>;
};

export function registerActivityCalendarCases(h: Harness) {
  test("private activity calendar aggregates real completions by local day, excluding unfinished, future, other-owner and non-solve records", async () => {
    const owner = await h.fixture("activity-calendar-owner", "1990-01-01");
    const other = await h.fixture("activity-calendar-other", "1990-01-01");
    const now = Date.now(),
      day = 86400000;
    const base = Math.floor(now / day) * day - 5 * day;
    const early = new Date(base + (15 * 60 + 59) * 60000);
    const late = new Date(base + (16 * 60 + 1) * 60000);
    const recent = new Date(now - day);
    const lesson = (
      userId: string,
      finishedAt: Date | null,
      status = "COMPLETED",
    ) => ({
      userId,
      lessonId: "3-notation",
      puzzle: "3x3",
      input: "virtual",
      algorithm: "R U R' U'",
      courseVersion: 1,
      status,
      finishedAt,
    });
    await h.db.lessonSession.createMany({
      data: [
        lesson(owner.u.id, early),
        lesson(owner.u.id, late),
        lesson(owner.u.id, recent, "ACTIVE"),
        lesson(owner.u.id, null),
        lesson(owner.u.id, new Date(now + day)),
        lesson(owner.u.id, new Date(now - 367 * day)),
        lesson(other.u.id, recent),
      ],
    });
    await h.db.guidedSolve.createMany({
      data: ["COMPLETED", "ACTIVE"].map((status) => ({
        userId: owner.u.id,
        input: "virtual",
        courseVersion: 1,
        initialFaces: {},
        currentFaces: {},
        checkpointFaces: {},
        plan: {},
        status,
        expiresAt: new Date(now + day),
        finishedAt: recent,
      })),
    });
    async function attempt(
      status = "APPROVED",
      mode = "race",
      durationMs = 10000,
      finishedAt: Date | null = recent,
    ) {
      const room = await h.db.room.create({
        data: {
          ownerId: owner.u.id,
          code: randomUUID(),
          puzzle: "3x3",
          input: "virtual",
          mode,
          ranked: false,
          private: true,
        },
      });
      await h.db.attempt.create({
        data: {
          userId: owner.u.id,
          roomId: room.id,
          nonce: randomUUID(),
          scramble: ["R"],
          status,
          durationMs,
          createdAt: recent,
          finishedAt,
        },
      });
    }
    await attempt();
    await attempt("APPROVED", "daily", 10000, null);
    await attempt("PROVISIONAL");
    await attempt("REJECTED");
    await attempt("APPROVED", "pattern");
    await attempt("APPROVED", "race", 0);
    await attempt("APPROVED", "race", 3600001);
    assert.equal((await h.call("me/activity")).status, 401);
    for (const query of [
      "timeZone=Mars%2FCity",
      "timeZone=UTC&userId=" + other.u.id,
    ])
      assert.equal(
        (await h.call("me/activity?" + query, undefined, owner.token)).status,
        400,
      );
    assert.equal(
      (
        await h.call(
          "me/activity",
          undefined,
          owner.token,
          undefined,
          h.cnOrigin,
        )
      ).status,
      401,
    );
    const result = await h.call(
      "me/activity?timeZone=Asia%2FShanghai",
      undefined,
      owner.token,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.days.length, 365);
    assert.equal(result.body.timeZone, "Asia/Shanghai");
    assert.deepEqual(result.body.totals, {
      lessons: 2,
      guidedSolves: 1,
      solves: 2,
      total: 5,
      activeDays: 3,
    });
    const earlyDay = early.toISOString().slice(0, 10);
    const lateDay = new Date(base + day).toISOString().slice(0, 10);
    assert.equal(
      result.body.days.find((d: any) => d.day === earlyDay).lessons,
      1,
    );
    assert.equal(
      result.body.days.find((d: any) => d.day === lateDay).lessons,
      1,
    );
    const utc = await h.call(
      "me/activity?timeZone=UTC",
      undefined,
      owner.token,
    );
    assert.equal(utc.body.days.find((d: any) => d.day === earlyDay).lessons, 2);
    const serialized = JSON.stringify(result.body);
    for (const field of [
      owner.u.id,
      other.u.id,
      '"moves"',
      '"scramble"',
      '"email"',
      '"id"',
      '"nonce"',
    ])
      assert.equal(serialized.includes(field), false);
    const response = await fetch(`${h.origin}/v1/me/activity`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert.match(
      response.headers.get("cache-control") || "",
      /private.*no-store/,
    );
    assert.equal(response.status, 200);
    // A year of activity is aggregated, not silently limited to recent 30/1000 events.
    await h.db.lessonSession.createMany({
      data: Array.from({ length: 1002 }, () => lesson(owner.u.id, recent)),
    });
    const many = await h.call("me/activity", undefined, owner.token);
    assert.equal(many.body.totals.lessons, 1004);
    assert.equal(many.body.days.length, 365);
  });
}
