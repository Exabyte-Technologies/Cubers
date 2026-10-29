import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Body,
  Inject,
  NotFoundException,
  BadRequestException,
  HttpException,
  ConflictException,
  Delete,
  ForbiddenException,
  Header,
} from "@nestjs/common";
import { z } from "zod";
import {
  TutorRequest,
  GUIDED_COURSE_IDS,
  practiceApply,
  practiceSetup,
  practiceSolved,
  practiceScan,
  practiceMatches,
  Puzzle,
  recognizeAlgorithmCase,
  lastLayerObservations,
  type LastLayerGuidance,
  isPyraminx,
  facelets,
  applyMoves,
  isSolved,
  caseFirstLayersComplete,
  permissions,
  type Lesson,
  lessons,
  smartDeviceCatalogue,
  publishedDiscovery,
  discoveryStories,
  DownloadedLesson,
  OFFLINE_LEASE_MS,
  lessonDemonstration,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { type Authed } from "./security";
import { communityWrite } from "./community-authority";
import { learningWrite } from "./learning-authority";
import { saveLessonProgress } from "./lesson-progress";
import { smartLessonStatus } from "./smart-learning.controller";
import { AiTutor } from "./ai";
import { Prisma, type LessonSession } from "@prisma/client";
@Controller("v1")
export class LearningController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
  ) {}
  @Get("discovery")
  async discovery() {
    const courses = await this.db.course.findMany({
      where: {
        published: true,
        id: { in: discoveryStories.flatMap((story) => story.courseIds) },
      },
      select: { id: true, content: true },
    });
    return {
      items: publishedDiscovery(
        courses.map((course) => ({
          id: course.id,
          title:
            course.content &&
            typeof course.content === "object" &&
            !Array.isArray(course.content)
              ? course.content.title
              : undefined,
        })),
      ),
    };
  }
  @Get("discovery/:id")
  async discoveryStory(@Param("id") id: string) {
    z.string()
      .regex(/^[a-z][a-z0-9-]{1,59}$/)
      .parse(id);
    const story = (await this.discovery()).items.find((item) => item.id === id);
    if (!story) throw new NotFoundException("Story not found");
    return story;
  }
  @Get("courses") async courses() {
    const rows = await this.db.course.findMany({
      where: { published: true },
      orderBy: { id: "asc" },
    });
    const order = new Map(lessons.map((lesson, index) => [lesson.id, index]));
    return rows.sort(
      (a, b) => (order.get(a.id) ?? 10000) - (order.get(b.id) ?? 10000),
    );
  }
  @Get("course-download-manifest")
  @Header("Cache-Control", "private, no-store")
  async downloadManifest() {
    return {
      courses: await this.db.course.findMany({
        where: { published: true },
        select: { id: true, version: true },
        orderBy: { id: "asc" },
      }),
    };
  }
  @Get("courses/:id") async course(@Param("id") id: string) {
    const c = await this.db.course.findFirst({
      where: { id, published: true },
    });
    if (!c) throw new NotFoundException();
    return c;
  }
  @Post("courses/:id/download")
  @Header("Cache-Control", "private, no-store")
  async download(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const request = z
      .object({ includeAlternatives: z.boolean().optional() })
      .strict()
      .parse(body);
    if (!(await this.infra.limit(`lesson-download:${r.user.id}`, 200, 3600)))
      throw new HttpException("Too many lesson downloads", 429);
    return learningWrite(
      this.db,
      this.infra.config,
      r,
      async (tx, _until, actor) => {
        await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${id} FOR SHARE`;
        const course = await tx.course.findFirst({
          where: { id, published: true },
        });
        if (!course) throw new NotFoundException();
        const downloadedAt = Date.now();
        const { alternatives, ...legacyLesson } =
          course.content as unknown as Lesson;
        return DownloadedLesson.parse({
          schemaVersion: 1,
          ownerId: r.user.id,
          region: actor.user.region,
          downloadedAt,
          expiresAt: Math.min(
            downloadedAt + OFFLINE_LEASE_MS,
            actor.session.expiresAt.getTime(),
          ),
          courseVersion: course.version,
          // Old clients use a strict v1 packet schema. They still receive the
          // unchanged original drill unless they explicitly request the extension.
          lesson: request.includeAlternatives ? course.content : legacyLesson,
        });
      },
    );
  }
  @Get("progress") async progress(@Req() r: Authed) {
    const [rows, courses] = await Promise.all([
      this.db.progress.findMany({
        where: { userId: r.user.id },
        orderBy: { reviewAt: "asc" },
      }),
      this.db.course.findMany({
        where: { published: true },
        select: { id: true, version: true },
      }),
    ]);
    const versions = new Map(
      courses.map((course) => [course.id, course.version]),
    );
    return rows.map((row) => ({
      ...row,
      currentCompleted:
        row.completed &&
        row.courseVersion !== null &&
        row.courseVersion === versions.get(row.lessonId),
    }));
  }
  @Post("progress/:id") async complete(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
      .object({
        moves: z.array(z.string().max(8)).max(500),
        courseVersion: z.number().int().positive(),
        alternativeId: z
          .string()
          .regex(/^[a-z0-9-]{1,40}$/)
          .optional(),
      })
      .strict()
      .parse(body);
    const course = await this.course(id),
      lesson = course.content as unknown as Lesson;
    if (
      (GUIDED_COURSE_IDS as readonly string[]).includes(id) ||
      lesson.kind === "guided-first-solve"
    )
      throw new BadRequestException("Use the guided first-solve checkpoints");
    if (course.version !== b.courseVersion)
      throw new ConflictException("Lesson changed; reload its current version");
    let guide: ReturnType<typeof lessonDemonstration>;
    try {
      guide = lessonDemonstration(lesson, b.alternativeId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    let solved = false;
    try {
      solved = practiceSolved(
        practiceApply(practiceSetup(lesson.puzzle, lesson.algorithm), b.moves),
      );
    } catch {
      throw new BadRequestException("Invalid move");
    }
    if (!solved) throw new BadRequestException("Checkpoint is not solved");
    return learningWrite(this.db, this.infra.config, r, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${id} FOR SHARE`;
      if (
        !(await tx.course.findFirst({
          where: { id, published: true, version: b.courseVersion },
        }))
      )
        throw new ConflictException(
          "Lesson changed; reload its current version",
        );
      await tx.lessonSession.create({
        data: {
          userId: r.user.id,
          lessonId: id,
          puzzle: lesson.puzzle,
          input: "virtual",
          algorithm: lesson.algorithm,
          ...guide,
          courseVersion: course.version,
          moves: b.moves,
          status: "COMPLETED",
          finishedAt: new Date(),
        },
      });
      return this.saveProgress(tx, r.user.id, id, b.moves, course.version);
    });
  }
  private async saveProgress(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    moves: string[],
    courseVersion: number,
  ) {
    return saveLessonProgress(tx, userId, id, moves, courseVersion);
  }
  @Get("lesson-sessions") async sessions(@Req() r: Authed) {
    const rows = await this.db.lessonSession.findMany({
      where: { userId: r.user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
    });
    return rows.map((row) => ({ ...row, status: smartLessonStatus(row) }));
  }
  @Get("lesson-sessions/:id") async session(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    z.string().uuid().parse(id);
    const session = await this.db.lessonSession.findFirst({
      where: { id, userId: r.user.id },
    });
    if (!session) throw new NotFoundException();
    return { ...session, status: smartLessonStatus(session) };
  }
  @Post("courses/:id/sessions") async createSession(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
      .object({
        input: z.literal("scan"),
        courseVersion: z.number().int().positive(),
        alternativeId: z
          .string()
          .regex(/^[a-z0-9-]{1,40}$/)
          .optional(),
      })
      .strict()
      .parse(body);
    if (!(await this.infra.limit(`lesson-session:${r.user.id}`, 100, 86400)))
      throw new HttpException("Daily practice session limit reached", 429);
    return learningWrite(this.db, this.infra.config, r, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${id} FOR SHARE`;
      const course = await tx.course.findFirst({
        where: { id, published: true, version: b.courseVersion },
      });
      if (!course)
        throw new ConflictException(
          "Lesson changed; reload its current version",
        );
      const lesson = course.content as unknown as Lesson;
      if (
        (GUIDED_COURSE_IDS as readonly string[]).includes(id) ||
        lesson.kind === "guided-first-solve"
      )
        throw new BadRequestException("Use the guided first-solve session");
      let guide: ReturnType<typeof lessonDemonstration>;
      try {
        guide = lessonDemonstration(lesson, b.alternativeId);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      return tx.lessonSession.create({
        data: {
          userId: r.user.id,
          lessonId: id,
          puzzle: lesson.puzzle,
          input: "scan",
          algorithm: lesson.algorithm,
          ...guide,
          courseVersion: course.version,
        },
      });
    });
  }
  private async withSession(
    r: Authed,
    id: string,
    version: number,
    action: (
      tx: Prisma.TransactionClient,
      session: LessonSession,
    ) => Promise<unknown>,
  ) {
    z.string().uuid().parse(id);
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      // One lock order for progress completions; concurrent requests cannot double-save a checkpoint.
      const session = await tx.lessonSession.findFirst({
        where: { id, userId: r.user.id, input: "scan" },
      });
      if (!session) throw new NotFoundException();
      if (session.version !== version)
        throw new ConflictException(
          "Practice changed; reload the saved session",
        );
      if (!["PREPARING", "PRACTICING"].includes(session.status))
        throw new ConflictException("Practice session has ended or expired");
      until(
        new Date(session.createdAt.getTime() + 7 * 86400000),
        "Practice session has ended or expired",
      );
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${session.lessonId} FOR SHARE`;
      const course = await tx.course.findFirst({
        where: {
          id: session.lessonId,
          published: true,
          version: session.courseVersion,
        },
      });
      if (!course)
        throw new ConflictException(
          "Lesson changed; start a new practice session",
        );
      return action(tx, session);
    });
  }
  @Post("lesson-sessions/:id/moves") async confirmMoves(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
      .object({
        version: z.number().int().min(0),
        moves: z.array(z.string().max(8)).min(1).max(100),
      })
      .strict()
      .parse(body);
    return this.withSession(r, id, b.version, async (tx, session) => {
      if (session.status !== "PRACTICING")
        throw new BadRequestException("Confirm the starting scan first");
      const moves = [...session.moves, ...b.moves];
      if (moves.length > 500)
        throw new BadRequestException(
          "Start a new session after 500 confirmed turns",
        );
      try {
        practiceApply(
          practiceSetup(Puzzle.parse(session.puzzle), session.algorithm),
          moves,
        );
      } catch {
        throw new BadRequestException("Invalid puzzle move");
      }
      return tx.lessonSession.update({
        where: { id },
        data: { moves, version: { increment: 1 } },
      });
    });
  }
  @Post("lesson-sessions/:id/checkpoint") async checkpoint(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
      .object({
        version: z.number().int().min(0),
        kind: z.enum(["initial", "check", "final"]),
        faces: z.record(z.array(z.string().max(1)).max(16)),
      })
      .strict()
      .parse(body);
    return this.withSession(r, id, b.version, async (tx, session) => {
      if ((b.kind === "initial") !== (session.status === "PREPARING"))
        throw new BadRequestException("Checkpoint is out of order");
      try {
        const puzzle = Puzzle.parse(session.puzzle),
          expected = practiceApply(
            practiceSetup(puzzle, session.algorithm),
            session.moves,
          ),
          scanned = practiceScan(puzzle, b.faces);
        if (!practiceMatches(scanned, expected))
          throw new Error(
            "Scan does not match the setup and confirmed turns; correct the colors or start again",
          );
        if (b.kind === "final" && !practiceSolved(expected))
          throw new Error("Finish the exercise before the final scan");
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      const completed = b.kind === "final";
      const saved = await tx.lessonSession.update({
        where: { id },
        data: {
          status: completed ? "COMPLETED" : "PRACTICING",
          version: { increment: 1 },
          ...(completed ? { finishedAt: new Date() } : {}),
        },
      });
      if (completed)
        await this.saveProgress(
          tx,
          r.user.id,
          session.lessonId,
          session.moves,
          session.courseVersion,
        );
      return saved;
    });
  }
  @Delete("lesson-sessions/:id") async cancelSession(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    z.string().uuid().parse(id);
    await learningWrite(this.db, this.infra.config, r, async (tx) =>
      tx.lessonSession.updateMany({
        where: {
          id,
          userId: r.user.id,
          status: { in: ["PREPARING", "PRACTICING"] },
        },
        data: {
          status: "CANCELLED",
          finishedAt: new Date(),
          version: { increment: 1 },
        },
      }),
    );
    return { ok: true };
  }
  @Post("tutor") async tutor(@Req() r: Authed, @Body() body: unknown) {
    const b = TutorRequest.parse(body);
    if (!(await this.infra.limit(`tutor:${r.user.id}`, 20, 3600)))
      throw new HttpException(
        "Tutor limit reached; use the lesson explanation",
        429,
      );
    const c = await this.course(b.lessonId),
      lesson = c.content as unknown as Lesson;
    if (
      (GUIDED_COURSE_IDS as readonly string[]).includes(b.lessonId) ||
      lesson.kind === "guided-first-solve"
    )
      throw new BadRequestException(
        "Open the current guided stage for its validated explanation",
      );
    if (c.version !== b.courseVersion)
      throw new ConflictException(
        "Lesson changed; reload before requesting guidance",
      );
    let explanationLesson = lesson;
    try {
      const guide = lessonDemonstration(lesson, b.alternativeId);
      if (guide.guideId) {
        const alternative = lesson.alternatives!.find(
          (row) => row.id === guide.guideId,
        )!;
        explanationLesson = {
          ...lesson,
          algorithm: alternative.algorithm,
          steps: alternative.steps,
        };
      }
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    try {
      practiceApply(practiceSetup(lesson.puzzle, lesson.algorithm), b.moves);
    } catch {
      throw new BadRequestException("Invalid puzzle move");
    }
    // Do not hold account/session locks across provider I/O. Admission and
    // delivery each use current authority, including guardian/session locks.
    const canChat = await communityWrite(
      this.db,
      this.infra.config,
      r,
      "learn",
      [],
      async (_tx, actor) => permissions(actor.policy).canChat,
    );
    const setting = await this.db.setting.findUnique({ where: { key: "ai" } });
    const result = await new AiTutor(this.infra.config).explain(
      explanationLesson,
      b.locale,
      canChat,
      b.question,
      setting?.value as
        { baseUrl: string; model: string; enabled: boolean } | undefined,
    );
    await communityWrite(
      this.db,
      this.infra.config,
      r,
      "learn",
      [],
      async (tx, actor) => {
        if (result.source !== "authored") {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cubers-ai-settings'))`;
          const currentAi = await tx.setting.findUnique({
            where: { key: "ai" },
          });
          if (
            JSON.stringify(currentAi?.value ?? null) !==
            JSON.stringify(setting?.value ?? null)
          )
            throw new ConflictException(
              "AI settings changed while guidance was prepared",
            );
        }
        if (canChat && !permissions(actor.policy).canChat)
          throw new ForbiddenException(
            "Tutoring permission changed; reopen the lesson",
          );
        await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${b.lessonId} FOR SHARE`;
        if (
          !(await tx.course.findFirst({
            where: {
              id: b.lessonId,
              published: true,
              version: b.courseVersion,
            },
          }))
        )
          throw new ConflictException(
            "Lesson changed while guidance was prepared",
          );
      },
    );
    return result;
  }
  @Get("devices")
  @Header("Cache-Control", "private, no-store")
  async devices() {
    return {
      devices: smartDeviceCatalogue(),
      message:
        "Models remain disabled until physical synchronization, reconnect, and recorded-match tests pass.",
    };
  }
  @Post("last-layer/recognize") async recognize(
    @Req() r: Authed,
    @Body() body: unknown,
  ): Promise<LastLayerGuidance> {
    const b = z
      .object({
        family: z.enum(["OLL", "PLL", "CLL"]),
        faces: z.record(z.array(z.string().max(1)).max(9)),
      })
      .strict()
      .parse(body);
    if (!(await this.infra.limit(`recognition:${r.user.id}`, 120, 3600)))
      throw new HttpException("Recognition limit reached", 429);
    let state;
    try {
      state = practiceScan(b.family === "CLL" ? "2x2" : "3x3", b.faces);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (isPyraminx(state) || !caseFirstLayersComplete(state, b.family))
      return { kind: "not-ready", reason: "FIRST_LAYERS_REQUIRED" };
    if (b.family === "OLL" && facelets(state).U.every((color) => color === "U"))
      return { kind: "stage-complete", next: "PLL" };
    if (b.family !== "OLL")
      for (const moves of [[], ["U"], ["U2"], ["U'"]]) {
        if (isSolved(applyMoves(state, moves)))
          return { kind: "alignment", moves };
      }
    const result = recognizeAlgorithmCase(state, b.family);
    if (!result) return { kind: "not-ready", reason: "ORIENTATION_REQUIRED" };
    await this.course(result.entry.id);
    return {
      kind: "case",
      lessonId: result.entry.id,
      family: b.family,
      before: result.before,
      algorithm: result.algorithm,
      after: result.after,
      target: result.target,
      source: "validated",
      observations: lastLayerObservations(state, b.family, result.before),
    };
  }
}
