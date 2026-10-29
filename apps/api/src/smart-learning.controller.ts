import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Body,
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
  Header,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type LessonSession } from "@prisma/client";
import {
  SmartLessonCreate,
  SmartLessonAction,
  SmartLessonContext,
  smartDeviceCatalogue,
  smartLessonReference,
  checkSmartLessonSnapshot,
  smartLessonTurns,
  SmartCubeFrame,
  SMART_PROFILES,
  practiceSetup,
  practiceApply,
  practiceSolved,
  lessonDemonstration,
  type Lesson,
  type SmartLessonView,
  type SmartModel,
  type CubeState,
  GUIDED_COURSE_IDS,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import type { Authed } from "./security";
import { learningWrite } from "./learning-authority";
import { saveLessonProgress } from "./lesson-progress";
const json = (value: unknown) => value as Prisma.InputJsonValue;
export const SMART_LESSON_LEASE = 30000;
export function smartLessonStatus(
  row: Pick<LessonSession, "input" | "status" | "smartSeenAt">,
) {
  return row.input === "smart" &&
    ["PREPARING", "PRACTICING"].includes(row.status) &&
    (!row.smartSeenAt ||
      Date.now() - row.smartSeenAt.getTime() > SMART_LESSON_LEASE)
    ? "INTERRUPTED"
    : row.status;
}
function view(row: LessonSession): SmartLessonView {
  return {
    id: row.id,
    lessonId: row.lessonId,
    puzzle: "3x3",
    input: "smart",
    version: row.version,
    status: smartLessonStatus(row),
    algorithm: row.algorithm,
    guideId: row.guideId,
    guideAlgorithm: row.guideAlgorithm,
    courseVersion: row.courseVersion,
    moves: row.moves,
    smart: SmartLessonContext.parse(row.smart),
    createdAt: row.createdAt.toISOString(),
    expiresAt: new Date(row.createdAt.getTime() + 7 * 86400000).toISOString(),
    finishedAt: row.finishedAt?.toISOString() || null,
  };
}
/** No database allowlist/report alone promotes a physically untested model. */
@Injectable()
export class SmartLessonAccess {
  require(model: SmartModel, platform: "ios" | "android") {
    const row = smartDeviceCatalogue().find((row) => row.id === model);
    if (
      !row?.enabled ||
      !row.physicallyTested ||
      !row.learningEnabled ||
      !row.learningPlatforms.includes(platform)
    )
      throw new ForbiddenException(
        "Smart lessons await physical model and platform acceptance",
      );
  }
}
@Controller("v1")
export class SmartLearningController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(SmartLessonAccess) private access: SmartLessonAccess,
  ) {}
  @Post("courses/:id/smart-sessions")
  async create(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const request = SmartLessonCreate.parse(body);
    this.access.require(request.model, request.platform);
    if (
      !(await this.infra.limit(`smart-learning-start:${r.user.id}`, 100, 86400))
    )
      throw new HttpException("Daily smart practice limit reached", 429);
    return learningWrite(this.db, this.infra.config, r, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${id} FOR SHARE`;
      const course = await tx.course.findFirst({
        where: { id, published: true, version: request.courseVersion },
      });
      if (!course)
        throw new ConflictException(
          "Lesson changed; reopen its current version",
        );
      const lesson = course.content as unknown as Lesson;
      if (
        lesson.puzzle !== "3x3" ||
        lesson.kind === "guided-first-solve" ||
        (GUIDED_COURSE_IDS as readonly string[]).includes(id)
      )
        throw new BadRequestException(
          "Use a 3×3 drill; smart first-solve guidance is not connected yet",
        );
      let guide: ReturnType<typeof lessonDemonstration>,
        reference: ReturnType<typeof smartLessonReference>;
      try {
        guide = lessonDemonstration(lesson, request.alternativeId);
        reference = smartLessonReference(lesson);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      await tx.lessonSession.updateMany({
        where: {
          userId: r.user.id,
          input: "smart",
          status: { in: ["PREPARING", "PRACTICING"] },
          smartSeenAt: { lt: new Date(Date.now() - SMART_LESSON_LEASE) },
        },
        data: {
          status: "INTERRUPTED",
          finishedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (
        await tx.lessonSession.findFirst({
          where: {
            userId: r.user.id,
            input: "smart",
            status: { in: ["PREPARING", "PRACTICING"] },
          },
        })
      )
        throw new ConflictException(
          "End the existing smart connection before starting another",
        );
      const smart = SmartLessonContext.parse({
        model: request.model,
        platform: request.platform,
        reference,
        epoch: randomUUID(),
        nextSequence: 0,
        counter: null,
        recoveryRun: 0,
        lastTime: null,
        independentState: false,
        continuity: SMART_PROFILES[request.model].deviceCounter
          ? "counter"
          : "net-state",
      });
      return view(
        await tx.lessonSession.create({
          data: {
            userId: r.user.id,
            lessonId: id,
            puzzle: "3x3",
            input: "smart",
            algorithm: lesson.algorithm,
            ...guide,
            courseVersion: course.version,
            smart: json(smart),
            smartSeenAt: new Date(),
          },
        }),
      );
    });
  }
  @Get("smart-lesson-sessions/:id")
  @Header("Cache-Control", "private, no-store")
  async get(@Req() r: Authed, @Param("id") id: string) {
    z.string().uuid().parse(id);
    return learningWrite(this.db, this.infra.config, r, async (tx) => {
      const row = await tx.lessonSession.findFirst({
        where: { id, userId: r.user.id, input: "smart" },
      });
      if (!row) throw new NotFoundException();
      return view(row);
    });
  }
  @Post("smart-lesson-sessions/:id")
  async action(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    z.string().uuid().parse(id);
    const request = SmartLessonAction.parse(body);
    if (!(await this.infra.limit(`smart-learning:${r.user.id}`, 600, 60)))
      throw new HttpException("Smart practice request limit reached", 429);
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const row = await tx.lessonSession.findFirst({
        where: { id, userId: r.user.id, input: "smart" },
      });
      if (!row) throw new NotFoundException();
      const context = SmartLessonContext.parse(row.smart);
      if (
        row.version !== request.version ||
        context.epoch !== request.epoch ||
        !["PREPARING", "PRACTICING"].includes(row.status)
      )
        throw new ConflictException(
          "Smart practice changed or ended; reconnect explicitly",
        );
      if (request.action === "interrupt")
        return view(
          await tx.lessonSession.update({
            where: { id },
            data: {
              status: "INTERRUPTED",
              finishedAt: new Date(),
              version: { increment: 1 },
            },
          }),
        );
      this.access.require(context.model, context.platform);
      until(
        new Date(row.createdAt.getTime() + 7 * 86400000),
        "Smart practice expired; begin again",
      );
      until(
        new Date(row.smartSeenAt!.getTime() + SMART_LESSON_LEASE),
        "Smart connection expired; synchronize a new practice",
      );
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${row.lessonId} FOR SHARE`;
      if (
        !(await tx.course.findFirst({
          where: {
            id: row.lessonId,
            published: true,
            version: row.courseVersion,
          },
        }))
      )
        throw new ConflictException("Lesson changed; start a new practice");
      const expected = practiceApply(
        practiceSetup("3x3", row.algorithm),
        row.moves,
      ) as CubeState;
      let next = context,
        moves = row.moves,
        status = row.status;
      try {
        if (request.action === "confirm") {
          if (row.status !== "PREPARING")
            throw Error("Starting position was already confirmed");
          if (
            SMART_PROFILES[context.model].deviceCounter
              ? request.counter === null
              : request.counter !== null
          )
            throw Error("Starting counter does not match this model");
          next = {
            ...context,
            counter: request.counter,
            independentState: true,
          };
          checkSmartLessonSnapshot(
            next,
            expected,
            request.faces,
            request.counter,
          );
          status = "PRACTICING";
        } else {
          if (row.status !== "PRACTICING")
            throw Error("Confirm the fresh starting position first");
          if (request.action === "turns") {
            if (row.moves.length + request.turns.length > 500)
              throw Error("Begin a new practice after 500 received turns");
            const accepted = smartLessonTurns(context, expected, request);
            next = accepted.context;
            moves = [...row.moves, ...accepted.moves];
          } else {
            checkSmartLessonSnapshot(
              context,
              expected,
              request.faces,
              request.counter,
            );
            if (
              !context.independentState ||
              context.recoveryRun !== 0 ||
              !practiceSolved(expected)
            )
              throw Error(
                "Request a fresh device position and solve the exercise before finishing",
              );
            status = "COMPLETED";
          }
        }
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      const saved = await tx.lessonSession.update({
        where: { id },
        data: {
          smart: json(next),
          smartSeenAt: new Date(),
          moves,
          status,
          version: { increment: 1 },
          ...(status === "COMPLETED" ? { finishedAt: new Date() } : {}),
        },
      });
      if (status === "COMPLETED")
        await saveLessonProgress(
          tx,
          r.user.id,
          row.lessonId,
          moves,
          row.courseVersion,
        );
      return view(saved);
    });
  }
}
