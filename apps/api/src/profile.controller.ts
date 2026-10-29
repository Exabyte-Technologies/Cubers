import {
  attemptInputWhere,
  exactAttemptTurns,
  archivedReplayInput,
} from "./attempt-input";
import {
  Controller,
  Get,
  Header,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Inject,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import {
  playInput,
  CreateGoal,
  Puzzle,
  Input,
  permissions,
  StatisticsQuery,
  sessionStatistics,
  activityCalendar,
  activityCalendarWindow,
  type ActivityDayCounts,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { accountPolicy, type Authed } from "./security";
import { Replays } from "./replays";
@Controller("v1/me")
export class ProfileController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(Replays) private replays: Replays,
  ) {}
  @Get("activity")
  @Header("Cache-Control", "private, no-store")
  async activity(@Req() r: Authed, @Query() query: unknown) {
    const { timeZone } = StatisticsQuery.parse(query);
    if (!(await this.infra.limit(`activity-calendar:${r.user.id}`, 60, 60)))
      throw new HttpException("Too many activity requests", 429);
    const now = new Date();
    const window = activityCalendarWindow(timeZone, now);
    // Prisma stores these timestamp-without-zone values in UTC. Derive local
    // boundaries in PostgreSQL so DST cannot skip or duplicate a civil day.
    // Each source is an independent completion ledger, not a progress snapshot.
    const rows = await this.db.$queryRaw<ActivityDayCounts[]>`
      WITH bounds AS (
        SELECT ${r.user.id}::uuid AS owner,
          ${timeZone}::text AS zone,
          (${window.from}::date::timestamp AT TIME ZONE ${timeZone})
            AT TIME ZONE 'UTC' AS starts,
          ${now}::timestamptz AT TIME ZONE 'UTC' AS ends
      ), events AS (
        SELECT s."finishedAt" AS at, 'lessons' AS kind
        FROM "LessonSession" s CROSS JOIN bounds b
        WHERE s."userId" = b.owner AND s.status = 'COMPLETED'
          AND s."finishedAt" >= b.starts AND s."finishedAt" <= b.ends
        UNION ALL
        SELECT g."finishedAt" AS at, 'guidedSolves' AS kind
        FROM "GuidedSolve" g CROSS JOIN bounds b
        WHERE g."userId" = b.owner AND g.status = 'COMPLETED'
          AND g."finishedAt" >= b.starts AND g."finishedAt" <= b.ends
        UNION ALL
        SELECT COALESCE(a."finishedAt", a."createdAt") AS at, 'solves' AS kind
        FROM "Attempt" a JOIN "Room" room ON room.id = a."roomId"
          CROSS JOIN bounds b
        WHERE a."userId" = b.owner AND a.status = 'APPROVED'
          AND a."durationMs" > 0 AND a."durationMs" <= 3600000
          AND room.mode IN ('race', 'daily')
          AND COALESCE(a."finishedAt", a."createdAt") >= b.starts
          AND COALESCE(a."finishedAt", a."createdAt") <= b.ends
      )
      SELECT ((e.at AT TIME ZONE 'UTC') AT TIME ZONE b.zone)::date::text AS day,
        (COUNT(*) FILTER (WHERE kind = 'lessons'))::integer AS lessons,
        (COUNT(*) FILTER (WHERE kind = 'guidedSolves'))::integer AS "guidedSolves",
        (COUNT(*) FILTER (WHERE kind = 'solves'))::integer AS solves
      FROM events e CROSS JOIN bounds b
      GROUP BY day ORDER BY day LIMIT 365
    `;
    return activityCalendar(rows, timeZone, now);
  }
  @Get("history") async history(@Req() r: Authed, @Query() query: unknown) {
    const b = z
      .object({
        puzzle: Puzzle.optional(),
        input: Input.optional(),
        cursor: z.string().uuid().optional(),
      })
      .strict()
      .parse(query);
    if (
      b.cursor &&
      !(await this.db.attempt.findFirst({
        where: { id: b.cursor, userId: r.user.id },
      }))
    )
      throw new BadRequestException("History cursor is not yours");
    const rows = await this.db.attempt.findMany({
      where: {
        userId: r.user.id,
        ...(b.input ? attemptInputWhere(b.input) : {}),
        room: {
          mode: { in: ["race", "daily"] },
          ...(b.puzzle ? { puzzle: b.puzzle } : {}),
        },
      },
      select: {
        id: true,
        status: true,
        durationMs: true,
        createdAt: true,
        reason: true,
        moves: true,
        input: true,
        smart: true,
        smartSeenAt: true,
        scrambleVerifiedAt: true,
        startedAt: true,
        finishedAt: true,
        scramble: true,
        room: {
          select: {
            puzzle: true,
            input: true,
            mode: true,
            ranked: true,
            mixed: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
      ...(b.cursor ? { cursor: { id: b.cursor }, skip: 1 } : {}),
    });
    return {
      items: rows.slice(0, 30).map((row) => {
        const {
          smart,
          smartSeenAt,
          scrambleVerifiedAt,
          startedAt,
          finishedAt,
          ...visible
        } = row;
        return {
          ...visible,
          room: { ...row.room, input: playInput(row.room, row.input) },
          replayAvailable:
            row.status === "APPROVED" &&
            archivedReplayInput(row) !== null &&
            this.replayPermitted(r),
          moveCount: exactAttemptTurns(row)
            ? (row.moves as unknown[]).length
            : null,
        };
      }),
      nextCursor: rows.length > 30 ? rows[29].id : null,
    };
  }
  private replayPermitted(r: Authed) {
    return (
      permissions(r.policy).canLearn &&
      (this.infra.config.REGION !== "CN" ||
        this.infra.config.CN_GAMES_APPROVED === "true")
    );
  }
  @Get("replays/:id") async replay(@Req() r: Authed, @Param("id") id: string) {
    const attemptId = z.string().uuid().parse(id).toLowerCase();
    if (!this.replayPermitted(r))
      throw new ForbiddenException(
        "Replay is unavailable for this account or community",
      );
    if (!(await this.infra.limit(`replay:${r.user.id}`, 20, 60)))
      throw new HttpException("Too many replay requests", 429);
    const replaySelection = {
      id: true,
      version: true,
      input: true,
      smart: true,
      smartSeenAt: true,
      scrambleVerifiedAt: true,
      startedAt: true,
      finishedAt: true,
      scramble: true,
      moves: true,
      durationMs: true,
      createdAt: true,
      room: { select: { puzzle: true, mode: true, input: true, mixed: true } },
    } as const;
    const row = await this.db.attempt.findFirst({
      where: {
        id: attemptId,
        userId: r.user.id,
        status: "APPROVED",
        OR: [attemptInputWhere("virtual"), attemptInputWhere("smart")],
        room: { mode: { in: ["race", "daily"] } },
      },
      select: replaySelection,
    });
    if (!row) throw new NotFoundException("Saved replay is unavailable");
    const input = archivedReplayInput(row);
    if (!input) throw new NotFoundException("Saved move replay is unavailable");
    const packet = await this.replays.validate({
      attemptId: row.id,
      puzzle: row.room.puzzle,
      input,
      ...(input === "smart" ? { smart: row.smart } : {}),
      mode: row.room.mode,
      durationMs: row.durationMs,
      createdAt: row.createdAt.toISOString(),
      scramble: row.scramble,
      events: row.moves,
    });
    // Revalidate ownership/status after worker work; deletion cannot leave a stale response.
    const live = await this.db.attempt.findFirst({
      where: {
        id: row.id,
        userId: r.user.id,
        status: "APPROVED",
        user: { deletedAt: null },
      },
      select: replaySelection,
    });
    if (!live) throw new NotFoundException("Saved replay is unavailable");
    if (JSON.stringify(live) !== JSON.stringify(row))
      throw new ConflictException("Saved replay changed; reload it");
    const session = await this.db.session.findFirst({
      where: {
        id: r.sessionId,
        userId: r.user.id,
        scope: "FULL",
        expiresAt: { gt: new Date() },
        user: {
          deletedAt: null,
          emailVerified: true,
          region: this.infra.config.REGION,
        },
      },
      include: { user: true },
    });
    if (
      !session ||
      !permissions(await accountPolicy(this.db, session.user)).canLearn
    )
      throw new ForbiddenException("Replay access changed; sign in again");
    return packet;
  }
  @Get("statistics") async statistics(@Req() r: Authed) {
    const stored = await this.db.attempt.findMany({
      where: {
        userId: r.user.id,
        status: "APPROVED",
        durationMs: { not: null },
        room: { mode: { in: ["race", "daily"] } },
      },
      select: {
        durationMs: true,
        createdAt: true,
        moves: true,
        input: true,
        smart: true,
        room: { select: { puzzle: true, input: true, mixed: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    const rows = stored.map((row) => ({
      ...row,
      exactTurns: exactAttemptTurns(row),
      room: { ...row.room, input: playInput(row.room, row.input) },
    }));
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.room.puzzle}:${row.room.input}`;
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    return {
      window: "most recent 1000 approved race/daily solves",
      categories: [...groups.values()].map((group) => {
        const durations = group.map((row) => row.durationMs!),
          newestFive = durations.slice(0, 5).sort((a, b) => a - b),
          telemetry = group.every((row) => row.exactTurns);
        const moveCount = telemetry
          ? group.reduce((sum, row) => sum + (row.moves as unknown[]).length, 0)
          : null;
        return {
          ...group[0].room,
          solves: group.length,
          bestMs: Math.min(...durations),
          meanMs: Math.round(
            durations.reduce((a, b) => a + b, 0) / durations.length,
          ),
          latestFiveTrimmedMeanMs:
            newestFive.length === 5
              ? Math.round((newestFive[1] + newestFive[2] + newestFive[3]) / 3)
              : null,
          moveCount,
          turnsPerSecond: telemetry
            ? Number(
                (
                  moveCount! /
                  (durations.reduce((a, b) => a + b, 0) / 1000)
                ).toFixed(2),
              )
            : null,
        };
      }),
      sessions: [
        ...new Set(rows.map((row) => row.createdAt.toISOString().slice(0, 10))),
      ]
        .slice(0, 30)
        .map((day) => {
          const attempts = rows.filter((row) =>
            row.createdAt.toISOString().startsWith(day),
          );
          return { dayUtc: day, solves: attempts.length };
        }),
    };
  }
  @Get("session-statistics") async sessions(
    @Req() r: Authed,
    @Query() query: unknown,
  ) {
    const b = StatisticsQuery.parse(query);
    if (!(await this.infra.limit(`session-statistics:${r.user.id}`, 60, 60)))
      throw new HttpException("Too many statistics requests", 429);
    const rows = await this.db.attempt.findMany({
      where: {
        userId: r.user.id,
        status: "APPROVED",
        durationMs: { gt: 0, lte: 3600000 },
        room: { mode: { in: ["race", "daily"] } },
      },
      select: {
        id: true,
        input: true,
        durationMs: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        room: { select: { puzzle: true, input: true, mixed: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1001,
    });
    return sessionStatistics(
      rows.slice(0, 1000).map((row) => ({
        id: row.id,
        puzzle: Puzzle.parse(row.room.puzzle),
        input: playInput(row.room, row.input),
        durationMs: row.durationMs!,
        createdAt: row.createdAt.toISOString(),
        startedAt: row.startedAt?.toISOString() ?? null,
        finishedAt: row.finishedAt?.toISOString() ?? null,
      })),
      b.timeZone,
      rows.length > 1000,
    );
  }
  @Get("goals") async goals(@Req() r: Authed) {
    const goals = await this.db.practiceGoal.findMany({
      where: { userId: r.user.id },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      goals.map(async (goal) => {
        let current: number;
        if (goal.kind === "lessons") {
          const courses = await this.db.course.findMany({
            where: { puzzle: goal.puzzle },
            select: { id: true },
          });
          current = await this.db.progress.count({
            where: {
              userId: r.user.id,
              completed: true,
              lessonId: { in: courses.map((course) => course.id) },
            },
          });
        } else {
          const where = {
            ...attemptInputWhere(goal.input),
            userId: r.user.id,
            status: "APPROVED",
            durationMs: { not: null },
            ...(goal.kind === "solves"
              ? { createdAt: { gte: goal.createdAt } }
              : {}),
            room: {
              puzzle: goal.puzzle,

              mode: { in: ["race", "daily"] },
            },
          };
          current =
            goal.kind === "solves"
              ? await this.db.attempt.count({ where })
              : ((
                  await this.db.attempt.aggregate({
                    where,
                    _min: { durationMs: true },
                  })
                )._min.durationMs ?? 0);
        }
        return {
          ...goal,
          current,
          achieved:
            goal.kind === "time"
              ? current > 0 && current <= goal.target
              : current >= goal.target,
        };
      }),
    );
  }
  @Post("goals") async create(@Req() r: Authed, @Body() body: unknown) {
    const b = CreateGoal.parse(body);
    if (!permissions(r.policy).canLearn)
      throw new ForbiddenException("Guardian consent is required");
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${r.user.id}::uuid FOR UPDATE`;
      if ((await tx.practiceGoal.count({ where: { userId: r.user.id } })) >= 20)
        throw new BadRequestException("Keep at most 20 personal goals");
      return tx.practiceGoal.create({ data: { ...b, userId: r.user.id } });
    });
  }
  @Delete("goals/:id") async remove(@Req() r: Authed, @Param("id") id: string) {
    await this.db.practiceGoal.deleteMany({ where: { id, userId: r.user.id } });
    return { ok: true };
  }
}
