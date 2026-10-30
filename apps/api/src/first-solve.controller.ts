import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Req,
  Body,
  Inject,
  Query,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  HttpException,
  Header,
} from "@nestjs/common";
import { z } from "zod";
import { Prisma, type GuidedSolve } from "@prisma/client";
import {
  lessonStage,
  nextUnitStage,
  lessonStageSetup,
  scopedLessonPlan,
  scopedLessonStart,
  lessonStageComplete,
  practiceScan,
  practiceApply,
  practiceKey,
  practiceSolved,
  solvedPuzzle,
  guidedState,
  guidedFacelets,
  guidedGoal,
  guidedInverse,
  prepareGuidedState,
  GuidedPuzzle,
  guidedCourseId,
  DownloadedLesson,
  OFFLINE_LEASE_MS,
  type GuidedSolvePlan,
  type GuidedSolveView,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { type Authed } from "./security";
import { learningWrite, type LearningDeadline } from "./learning-authority";
import { FirstSolveSolver } from "./first-solve-solver";
import { guidedView as view } from "./guided-view";
import { requireLessonStage } from "./stage-guidance";
const Faces = z.record(z.array(z.string().max(1)).min(4).max(16));
const Version = z.number().int().min(0);
const parseFaces = (value: z.infer<typeof Faces>, puzzle: GuidedPuzzle) => {
  try {
    return prepareGuidedState(practiceScan(puzzle, value));
  } catch (error) {
    throw new BadRequestException((error as Error).message);
  }
};
const json = (value: unknown) => value as Prisma.InputJsonValue;
const planOf = (row: GuidedSolve) => row.plan as unknown as GuidedSolvePlan;
const currentOf = (row: GuidedSolve) =>
  guidedState(
    GuidedPuzzle.parse(row.puzzle),
    row.currentFaces as Record<string, string[]>,
  );
@Controller("v1/first-solves")
export class FirstSolveController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(FirstSolveSolver) private solver: FirstSolveSolver,
  ) {}
  private async course(
    tx: Pick<Prisma.TransactionClient, "course" | "$queryRaw">,
    puzzle: GuidedPuzzle,
    version?: number,
    courseId = guidedCourseId(puzzle) as string,
  ) {
    if (
      courseId !== guidedCourseId(puzzle) &&
      lessonStage(courseId)?.puzzle !== puzzle
    )
      throw new BadRequestException("Unsupported lesson target");
    await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${courseId} FOR SHARE`;
    const course = await tx.course.findFirst({
      where: {
        id: courseId,
        published: true,
        ...(version === undefined ? {} : { version }),
      },
    });
    if (!course)
      throw new ConflictException(
        "The guided course changed or is unavailable",
      );
    return course;
  }
  private async owned(id: string, r: Authed) {
    z.string().uuid().parse(id);
    const row = await this.db.guidedSolve.findFirst({
      where: { id, userId: r.user.id },
    });
    if (!row) throw new NotFoundException();
    return row;
  }
  private async locked(
    tx: Prisma.TransactionClient,
    id: string,
    r: Authed,
    version: number,
    until: LearningDeadline,
  ) {
    const row = await tx.guidedSolve.findFirst({
      where: { id, userId: r.user.id },
    });
    if (!row) throw new NotFoundException();
    if (row.input === "smart")
      throw new BadRequestException(
        "Use the verified smart connection actions",
      );
    if (row.version !== version || row.status !== "ACTIVE")
      throw new ConflictException(
        "Practice changed or ended; reload the saved session",
      );
    until(row.expiresAt, "Practice expired; reload the saved session");
    if (
      row.courseId !== guidedCourseId(GuidedPuzzle.parse(row.puzzle)) &&
      lessonStage(row.courseId)?.puzzle !== row.puzzle
    )
      throw new ConflictException("Saved course mismatch");
    await this.course(
      tx,
      GuidedPuzzle.parse(row.puzzle),
      row.courseVersion,
      row.courseId,
    );
    return row;
  }
  private async limit(
    r: Authed,
    action: string,
    maximum: number,
    seconds = 3600,
  ) {
    if (
      !(await this.infra.limit(
        `first-solve-${action}:${r.user.id}`,
        maximum,
        seconds,
      ))
    )
      throw new HttpException("Practice limit reached; return later", 429);
  }
  @Get() async list(
    @Req() r: Authed,
    @Query("cursor") cursor?: string,
    @Query("puzzle") rawPuzzle?: string,
    @Query("lessonId") lessonId?: string,
  ) {
    const puzzle = GuidedPuzzle.parse(rawPuzzle || "3x3");
    const courseId = lessonId || guidedCourseId(puzzle);
    if (lessonId && lessonStage(lessonId)?.puzzle !== puzzle)
      throw new BadRequestException("Unsupported lesson target");
    if (cursor) {
      z.string().uuid().parse(cursor);
      if (
        !(await this.db.guidedSolve.findFirst({
          where: { id: cursor, userId: r.user.id, puzzle, courseId },
        }))
      )
        throw new NotFoundException();
    }
    const rows = await this.db.guidedSolve.findMany({
      where: { userId: r.user.id, puzzle, courseId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return {
      items: rows.slice(0, 20).map((row) => ({
        id: row.id,
        input: row.input,
        puzzle: row.puzzle,
        status: view(row).status,
        stage: row.stage,
        total: planOf(row).steps.length,
        createdAt: row.createdAt,
        finishedAt: row.finishedAt,
      })),
      nextCursor: rows.length > 20 ? rows[19].id : null,
      active: await this.db.guidedSolve.findMany({
        where: {
          userId: r.user.id,
          puzzle,
          courseId,
          status: "ACTIVE",
          OR: [
            { input: { not: "smart" } },
            { smartSeenAt: { gt: new Date(Date.now() - 30000) } },
          ],
          expiresAt: { gt: new Date() },
        },
        select: { id: true, input: true, puzzle: true },
        take: 3,
      }),
    };
  }
  @Get(":id") async get(@Req() r: Authed, @Param("id") id: string) {
    return view(await this.owned(id, r));
  }
  @Post(":id/download")
  @Header("Cache-Control", "private, no-store")
  async download(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    z.string().uuid().parse(id);
    const request = z.object({ version: Version }).strict().parse(body);
    await this.limit(r, "download", 60);
    return learningWrite(
      this.db,
      this.infra.config,
      r,
      async (tx, until, actor) => {
        const row = await this.locked(tx, id, r, request.version, until);
        if (
          row.stageMoves.length ||
          practiceKey(currentOf(row)) !==
            practiceKey(
              guidedState(
                GuidedPuzzle.parse(row.puzzle),
                row.checkpointFaces as Record<string, string[]>,
              ),
            )
        )
          throw new ConflictException(
            "Download remaining guidance between checkpoints, before making the next turn",
          );
        const puzzle = GuidedPuzzle.parse(row.puzzle),
          course = await this.course(
            tx,
            puzzle,
            row.courseVersion,
            row.courseId,
          ),
          session = await tx.session.findUnique({ where: { id: r.sessionId } });
        if (
          !session ||
          session.scope !== "FULL" ||
          session.expiresAt <= new Date()
        )
          throw new ForbiddenException("Current session is unavailable");
        const downloadedAt = Date.now();
        return DownloadedLesson.parse({
          schemaVersion: 1,
          ownerId: r.user.id,
          region: actor.user.region,
          downloadedAt,
          expiresAt: Math.min(
            downloadedAt + OFFLINE_LEASE_MS,
            session.expiresAt.getTime(),
            row.expiresAt.getTime(),
          ),
          courseVersion: course.version,
          lesson: course.content,
          guidedPractice: {
            ...(lessonStage(row.courseId) ? { lessonId: row.courseId } : {}),
            sourceId: row.id,
            sourceVersion: row.version,
            puzzle,
            input: row.input,
            startingStage: row.stage,
            startingFaces: row.currentFaces,
            steps: planOf(row).steps.slice(row.stage),
          },
        });
      },
    );
  }
  @Post() async create(@Req() r: Authed, @Body() body: unknown) {
    const request = z
      .discriminatedUnion("input", [
        z
          .object({
            input: z.literal("virtual"),
            puzzle: GuidedPuzzle.default("3x3"),
            faces: Faces.optional(),
            lessonId: z.string().max(80).optional(),
            courseVersion: Version.optional(),
          })
          .strict(),
        z
          .object({
            input: z.literal("scan"),
            puzzle: GuidedPuzzle.default("3x3"),
            faces: Faces,
            lessonId: z.string().max(80).optional(),
            courseVersion: Version.optional(),
          })
          .strict(),
      ])
      .parse(body);
    const courseId = request.lessonId || guidedCourseId(request.puzzle),
      scope = lessonStage(courseId);
    await this.limit(r, "start", scope ? 120 : 12, 86400);
    const course = await this.course(
      this.db,
      request.puzzle,
      request.courseVersion,
      courseId,
    );
    const authored =
      request.input === "virtual" && !request.faces && scope
        ? lessonStageSetup(courseId)
        : null;
    const generated =
      request.input === "virtual" && !request.faces && !authored
        ? await this.infra.scrambles.generate(request.puzzle)
        : null;
    const starting = request.faces
      ? parseFaces(request.faces, request.puzzle)
      : authored?.state ||
        prepareGuidedState(
          practiceApply(solvedPuzzle(request.puzzle), generated!.scrambles[0]),
        );
    if (scope) requireLessonStage(starting, courseId);
    else if (practiceSolved(starting))
      throw new BadRequestException(
        "This puzzle is already solved. Try a virtual scramble to practice the full course.",
      );
    const plan = scopedLessonPlan(await this.solver.solve(starting), courseId);
    if (authored) plan.setupMoves = authored.setup;
    return learningWrite(this.db, this.infra.config, r, async (tx) => {
      await this.course(tx, request.puzzle, course.version, course.id);
      await tx.guidedSolve.updateMany({
        where: {
          userId: r.user.id,
          status: "ACTIVE",
          expiresAt: { lte: new Date() },
        },
        data: {
          status: "EXPIRED",
          finishedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (
        await tx.guidedSolve.findFirst({
          where: {
            userId: r.user.id,
            puzzle: request.puzzle,
            courseId: course.id,
            input: request.input,
            status: "ACTIVE",
          },
        })
      )
        throw new ConflictException(
          "Resume or end your existing practice first",
        );
      return view(
        await tx.guidedSolve.create({
          data: {
            userId: r.user.id,
            input: request.input,
            puzzle: request.puzzle,
            courseId: course.id,
            courseVersion: course.version,
            initialFaces: json(plan.startingFaces),
            ...(generated ? { scrambleSource: generated.source } : {}),
            currentFaces: json(plan.startingFaces),
            checkpointFaces: json(plan.startingFaces),
            plan: json(plan),
            stage: scopedLessonStart(starting, plan, course.id),
            expiresAt: new Date(Date.now() + 7 * 86400000),
          },
        }),
      );
    });
  }
  @Post(":id/moves") async moves(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    z.string().uuid().parse(id);
    const request = z
      .object({
        version: Version,
        moves: z.array(z.string().max(3)).min(1).max(100),
      })
      .strict()
      .parse(body);
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const row = await this.locked(tx, id, r, request.version, until);
      await this.limit(
        r,
        row.puzzle === "4x4" ? "turns4" : "turns",
        row.puzzle === "4x4" ? 3600 : 1200,
      );
      const movePattern =
        row.puzzle === "pyraminx"
          ? /^[ULRBulrb]'?$/
          : row.puzzle === "4x4"
            ? /^[URFDLB](w)?(2|')?$/
            : /^[URFDLB](2|')?$/;
      if (!request.moves.every((move) => movePattern.test(move)))
        throw new BadRequestException("Moves do not match this guided puzzle");
      const stageMoves = [...row.stageMoves];
      for (const move of request.moves) {
        if (
          stageMoves.at(-1) ===
          guidedInverse(GuidedPuzzle.parse(row.puzzle), [move])[0]
        )
          stageMoves.pop();
        else stageMoves.push(move);
      }
      if (
        row.moves.length + request.moves.length >
          (row.puzzle === "4x4" ? 6000 : 2000) ||
        stageMoves.length > 500
      )
        throw new BadRequestException(
          "Turn budget reached. Restart this stage or begin a new practice.",
        );
      const state = practiceApply(currentOf(row), request.moves);
      return view(
        await tx.guidedSolve.update({
          where: { id },
          data: {
            currentFaces: json(guidedFacelets(state)),
            moves: [...row.moves, ...request.moves],
            stageMoves,
            version: { increment: 1 },
          },
        }),
      );
    });
  }
  @Post(":id/reset") async reset(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    z.string().uuid().parse(id);
    const { version } = z.object({ version: Version }).strict().parse(body);
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const row = await this.locked(tx, id, r, version, until);
      if (row.input !== "virtual")
        throw new BadRequestException(
          "Rescan a physical puzzle to update guidance",
        );
      const undo = guidedInverse(
          GuidedPuzzle.parse(row.puzzle),
          row.stageMoves,
        ),
        restored = practiceApply(currentOf(row), undo);
      const turnBudget = row.puzzle === "4x4" ? 6000 : 2000;
      if (row.moves.length + undo.length > turnBudget)
        throw new BadRequestException(
          `Start a new practice after ${turnBudget} turns`,
        );
      if (
        practiceKey(restored) !==
        practiceKey(
          guidedState(
            GuidedPuzzle.parse(row.puzzle),
            row.checkpointFaces as Record<string, string[]>,
          ),
        )
      )
        throw new ConflictException(
          "Saved checkpoint mismatch; restart practice",
        );
      return view(
        await tx.guidedSolve.update({
          where: { id },
          data: {
            currentFaces: row.checkpointFaces as Prisma.InputJsonValue,
            stageMoves: [],
            moves: [...row.moves, ...undo],
            version: { increment: 1 },
          },
        }),
      );
    });
  }
  @Post(":id/rescan") async rescan(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const request = z
        .object({ version: Version, faces: Faces })
        .strict()
        .parse(body),
      before = await this.owned(id, r);
    if (before.input !== "scan")
      throw new BadRequestException(
        "Only physical practice accepts a new scan",
      );
    if (
      before.version !== request.version ||
      before.status !== "ACTIVE" ||
      before.expiresAt <= new Date()
    )
      throw new ConflictException("Practice changed or ended; reload");
    await this.limit(r, "planning", 20);
    const state = parseFaces(request.faces, GuidedPuzzle.parse(before.puzzle));
    if (lessonStage(before.courseId))
      requireLessonStage(state, before.courseId);
    const plan = scopedLessonPlan(
      await this.solver.solve(state),
      before.courseId,
    );
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const row = await this.locked(tx, id, r, request.version, until),
        checkpoints = row.checkpoints as any[];
      if (checkpoints.length >= 100)
        throw new BadRequestException(
          "Start a new practice after 100 checkpoints",
        );
      return view(
        await tx.guidedSolve.update({
          where: { id },
          data: {
            plan: json(plan),
            stage: scopedLessonStart(state, plan, row.courseId),
            stageMoves: [],
            currentFaces: json(plan.startingFaces),
            checkpointFaces: json(plan.startingFaces),
            checkpoints: json([
              ...checkpoints,
              {
                kind: "RESCAN",
                at: new Date().toISOString(),
                faces: plan.startingFaces,
              },
            ]),
            version: { increment: 1 },
          },
        }),
      );
    });
  }
  @Post(":id/continue") async continueUnit(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    z.string().uuid().parse(id);
    const { version } = z.object({ version: Version }).strict().parse(body);
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const row = await this.locked(tx, id, r, version, until),
        plan = planOf(row),
        current = currentOf(row),
        shown = view(row);
      if (
        !shown.step ||
        !shown.matchedGuide ||
        shown.guideIndex !== shown.step.moves.length
      )
        throw new BadRequestException(
          "Complete the current algorithm before continuing without a check",
        );
      const checkpoints = row.checkpoints as any[];
      if (checkpoints.length >= 100)
        throw new BadRequestException(
          "Start a new practice after 100 checkpoints",
        );
      let stage: number;
      try {
        stage = nextUnitStage(plan.steps, row.stage, current, plan.lessonId);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      // An explicitly unverified continuation updates only the guide cursor.
      // Completion status, Progress, reviews and physical evidence are untouched.
      return view(
        await tx.guidedSolve.update({
          where: { id },
          data: {
            stage,
            stageMoves: [],
            checkpointFaces: row.currentFaces as Prisma.InputJsonValue,
            checkpoints: json([
              ...checkpoints,
              {
                kind: "CONTINUE_UNCHECKED",
                goal: shown.step.goal,
                ...(shown.step.target === undefined
                  ? {}
                  : { target: shown.step.target }),
                at: new Date().toISOString(),
              },
            ]),
            version: { increment: 1 },
          },
        }),
      );
    });
  }
  @Post(":id/checkpoint") async checkpoint(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const request = z
        .object({ version: Version, faces: Faces.optional() })
        .strict()
        .parse(body),
      before = await this.owned(id, r);
    if ((before.input === "scan") !== !!request.faces)
      throw new BadRequestException(
        "Physical checkpoints require a fresh scan; virtual checkpoints use saved turns",
      );
    if (
      before.version !== request.version ||
      before.status !== "ACTIVE" ||
      before.expiresAt <= new Date()
    )
      throw new ConflictException("Practice changed or ended; reload");
    const state = request.faces
        ? parseFaces(request.faces, GuidedPuzzle.parse(before.puzzle))
        : currentOf(before),
      oldPlan = planOf(before),
      step = oldPlan.steps[before.stage];
    if (!step || !guidedGoal(state, step))
      throw new BadRequestException(
        "This stage is not ready. Check the cube or update guidance from a fresh scan.",
      );
    const expected = practiceApply(
      guidedState(
        GuidedPuzzle.parse(before.puzzle),
        before.checkpointFaces as Record<string, string[]>,
      ),
      step.moves,
    );
    let plan = oldPlan;
    if (practiceKey(expected) !== practiceKey(state)) {
      await this.limit(r, "planning", 20);
      plan = scopedLessonPlan(await this.solver.solve(state), before.courseId);
    }
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const row = await this.locked(tx, id, r, request.version, until),
        checkpoints = row.checkpoints as any[];
      if (checkpoints.length >= 100)
        throw new BadRequestException(
          "Start a new practice after 100 checkpoints",
        );
      const completed = lessonStage(row.courseId)
        ? lessonStageComplete(state, row.courseId)
        : row.stage + 1 === plan.steps.length;
      const saved = await tx.guidedSolve.update({
        where: { id },
        data: {
          stage: completed
            ? plan.steps.length
            : lessonStage(row.courseId)
              ? scopedLessonStart(state, plan, row.courseId)
              : { increment: 1 },
          stageMoves: [],
          plan: json(plan),
          currentFaces: json(guidedFacelets(state)),
          checkpointFaces: json(guidedFacelets(state)),
          checkpoints: json([
            ...checkpoints,
            {
              kind: "CHECKPOINT",
              goal: step.goal,
              ...(step.goal === "four-layer"
                ? { layerGoal: step.layerGoal }
                : {}),
              ...(step.target === undefined ? {} : { target: step.target }),
              at: new Date().toISOString(),
              faces: guidedFacelets(state),
            },
          ]),
          version: { increment: 1 },
          ...(completed ? { status: "COMPLETED", finishedAt: new Date() } : {}),
        },
      });
      if (completed) {
        const previous = await tx.progress.findUnique({
          where: {
            userId_lessonId: { userId: r.user.id, lessonId: row.courseId },
          },
        });
        const repetitions = (previous?.repetitions || 0) + 1;
        await tx.progress.upsert({
          where: {
            userId_lessonId: { userId: r.user.id, lessonId: row.courseId },
          },
          create: {
            userId: r.user.id,
            lessonId: row.courseId,
            completed: true,
            courseVersion: row.courseVersion,
            repetitions,
            moves: saved.moves,
            reviewAt: new Date(Date.now() + 86400000),
          },
          update: {
            courseVersion: row.courseVersion,
            completed: true,
            repetitions,
            moves: saved.moves,
            lastPracticedAt: new Date(),
            reviewAt: new Date(
              Date.now() + Math.min(30, 2 ** repetitions) * 86400000,
            ),
          },
        });
      }
      return view(saved);
    });
  }
  @Delete(":id") async cancel(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { version } = z.object({ version: Version }).strict().parse(body);
    z.string().uuid().parse(id);
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const row = await tx.guidedSolve.findFirst({
        where: { id, userId: r.user.id },
      });
      if (!row) throw new NotFoundException();
      if (row.version !== version || row.status !== "ACTIVE")
        throw new ConflictException("Practice changed or ended; reload");
      until(row.expiresAt, "Practice expired; reload");
      return view(
        await tx.guidedSolve.update({
          where: { id },
          data: {
            status: "CANCELLED",
            finishedAt: new Date(),
            version: { increment: 1 },
          },
        }),
      );
    });
  }
}
