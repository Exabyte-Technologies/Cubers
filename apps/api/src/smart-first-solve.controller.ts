import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Body,
  Inject,
  Header,
  Query,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type GuidedSolve } from "@prisma/client";
import {
  lessonStage,
  scopedLessonPlan,
  scopedLessonStart,
  lessonStageComplete,
  SmartGuidedCreate,
  SmartGuidedAction,
  SmartLessonContext,
  SMART_FIRST_SOLVE_REFERENCE,
  SMART_PROFILES,
  smartLessonState,
  smartLessonTurns,
  checkSmartLessonSnapshot,
  guidedState,
  guidedFacelets,
  guidedGoal,
  guidedInverse,
  practiceApply,
  practiceKey,
  practiceSolved,
  type SmartGuidedView,
  type GuidedSolvePlan,
  type CubeState,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import type { Authed } from "./security";
import { learningWrite, type LearningDeadline } from "./learning-authority";
import {
  SmartLessonAccess,
  SMART_LESSON_LEASE,
} from "./smart-learning.controller";
import { FirstSolveSolver } from "./first-solve-solver";
import { guidedView } from "./guided-view";
import { saveLessonProgress } from "./lesson-progress";
import { requireLessonStage } from "./stage-guidance";
const json = (value: unknown) => value as Prisma.InputJsonValue;
const planOf = (row: GuidedSolve) => row.plan as unknown as GuidedSolvePlan;
const currentOf = (row: GuidedSolve) =>
  guidedState("3x3", row.currentFaces as Record<string, string[]>) as CubeState;
function view(row: GuidedSolve): SmartGuidedView {
  const guidance = guidedView(row);
  return {
    id: row.id,
    version: row.version,
    status: guidance.status === "ACTIVE" ? "PRACTICING" : guidance.status,
    smart: SmartLessonContext.parse(row.smart),
    guidance,
    courseVersion: row.courseVersion,
    createdAt: guidance.createdAt,
    expiresAt: guidance.expiresAt,
    finishedAt: guidance.finishedAt,
  };
}
@Controller("v1/smart-first-solves")
export class SmartFirstSolveController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(SmartLessonAccess) private access: SmartLessonAccess,
    @Inject(FirstSolveSolver) private solver: FirstSolveSolver,
  ) {}
  private async limit(r: Authed, kind: string, count: number, seconds = 3600) {
    if (
      !(await this.infra.limit(
        "smart-first-solve:" + kind + ":" + r.user.id,
        count,
        seconds,
      ))
    )
      throw new HttpException(
        "Smart guidance limit reached; return to practice and retry later",
        429,
      );
  }
  private async course(
    tx: Pick<Prisma.TransactionClient, "course" | "$queryRawUnsafe">,
    version: number,
    courseId = "3-first-solve",
  ) {
    if (courseId !== "3-first-solve" && lessonStage(courseId)?.puzzle !== "3x3")
      throw new BadRequestException("Unsupported lesson target");
    await tx.$queryRawUnsafe(
      'SELECT id FROM "Course" WHERE id=$1 FOR SHARE',
      courseId,
    );
    if (
      !(await tx.course.findFirst({
        where: { id: courseId, published: true, version },
      }))
    )
      throw new ConflictException(
        "The first-solve course changed; reopen its current version",
      );
  }
  private async owned(r: Authed, id: string) {
    const row = await this.db.guidedSolve.findFirst({
      where: { id, userId: r.user.id, input: "smart", puzzle: "3x3" },
    });
    if (!row) throw new NotFoundException();
    return row;
  }
  private check(
    row: GuidedSolve,
    request: { version: number; epoch: string },
    until?: LearningDeadline,
    ending = false,
  ) {
    const context = SmartLessonContext.parse(row.smart);
    if (
      row.version !== request.version ||
      context.epoch !== request.epoch ||
      row.status !== "ACTIVE"
    )
      throw new ConflictException(
        "Smart guidance changed or ended; synchronize again",
      );
    if (!ending) {
      this.access.require(context.model, context.platform);
      const check = (deadline: Date, message: string) => {
        if (until) until(deadline, message);
        else if (deadline.getTime() <= Date.now())
          throw new ConflictException(message);
      };
      check(row.expiresAt, "Smart guidance expired; start again");
      check(
        new Date(row.smartSeenAt!.getTime() + SMART_LESSON_LEASE),
        "Smart connection expired; synchronize again",
      );
    }
    return context;
  }
  @Post() async create(@Req() r: Authed, @Body() body: unknown) {
    const request = SmartGuidedCreate.parse(body);
    this.access.require(request.model, request.platform);
    if (
      SMART_PROFILES[request.model].deviceCounter
        ? request.counter === null
        : request.counter !== null
    )
      throw new BadRequestException(
        "Starting counter does not match this model",
      );
    await this.limit(r, "start", 12, 86400);
    const context = SmartLessonContext.parse({
      model: request.model,
      platform: request.platform,
      reference: SMART_FIRST_SOLVE_REFERENCE,
      epoch: randomUUID(),
      nextSequence: 0,
      counter: request.counter,
      recoveryRun: 0,
      lastTime: null,
      independentState: true,
      continuity: SMART_PROFILES[request.model].deviceCounter
        ? "counter"
        : "net-state",
    });
    let state: CubeState;
    try {
      state = smartLessonState(context, request.faces);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const courseId = request.lessonId || "3-first-solve";
    if (lessonStage(courseId)) requireLessonStage(state, courseId);
    if (!lessonStage(courseId) && practiceSolved(state))
      throw new BadRequestException(
        "This cube is solved; scramble it before starting a complete practice",
      );
    await this.course(this.db, request.courseVersion, courseId);
    const plan = scopedLessonPlan(await this.solver.solve(state), courseId);
    return learningWrite(this.db, this.infra.config, r, async (tx) => {
      this.access.require(context.model, context.platform);
      await this.course(tx, request.courseVersion, courseId);
      await tx.guidedSolve.updateMany({
        where: {
          userId: r.user.id,
          input: "smart",
          status: "ACTIVE",
          OR: [
            { smartSeenAt: { lt: new Date(Date.now() - SMART_LESSON_LEASE) } },
            { expiresAt: { lte: new Date() } },
          ],
        },
        data: {
          status: "INTERRUPTED",
          finishedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (
        await tx.guidedSolve.findFirst({
          where: { userId: r.user.id, input: "smart", status: "ACTIVE" },
        })
      )
        throw new ConflictException(
          "End the existing smart first-solve connection before starting again",
        );
      return view(
        await tx.guidedSolve.create({
          data: {
            userId: r.user.id,
            input: "smart",
            puzzle: "3x3",
            courseId,
            courseVersion: request.courseVersion,
            initialFaces: json(plan.startingFaces),
            currentFaces: json(plan.startingFaces),
            checkpointFaces: json(plan.startingFaces),
            plan: json(plan),
            stage: scopedLessonStart(state, plan, courseId),
            smart: json(context),
            smartSeenAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 86400000),
          },
        }),
      );
    });
  }
  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(@Req() r: Authed, @Query("lessonId") lessonId?: string) {
    const courseId = lessonId || "3-first-solve";
    if (lessonId && lessonStage(lessonId)?.puzzle !== "3x3")
      throw new BadRequestException("Unsupported lesson target");
    return learningWrite(this.db, this.infra.config, r, async (tx) => {
      const rows = await tx.guidedSolve.findMany({
        where: { userId: r.user.id, input: "smart", courseId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
      });
      const active = await tx.guidedSolve.findFirst({
        where: {
          userId: r.user.id,
          input: "smart",
          courseId,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
          smartSeenAt: { gt: new Date(Date.now() - SMART_LESSON_LEASE) },
        },
        select: { id: true },
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          status: guidedView(row).status,
          stage: row.stage,
          total: planOf(row).steps.length,
          createdAt: row.createdAt,
        })),
        active: active?.id || null,
      };
    });
  }
  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  async get(@Req() r: Authed, @Param("id") id: string) {
    z.string().uuid().parse(id);
    return learningWrite(this.db, this.infra.config, r, async (tx) => {
      const row = await tx.guidedSolve.findFirst({
        where: { id, userId: r.user.id, input: "smart", puzzle: "3x3" },
      });
      if (!row) throw new NotFoundException();
      return view(row);
    });
  }
  @Post(":id") async action(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    z.string().uuid().parse(id);
    const request = SmartGuidedAction.parse(body);
    await this.limit(r, "events", 600, 60);
    let planned: GuidedSolvePlan | undefined;
    if (request.action === "checkpoint" || request.action === "replan") {
      const before = await this.owned(r, id),
        context = this.check(before, request),
        state = currentOf(before),
        step = planOf(before).steps[before.stage];
      try {
        checkSmartLessonSnapshot(
          context,
          state,
          request.faces,
          request.counter,
        );
        if (!context.independentState || context.recoveryRun)
          throw Error("Refresh the device position before verifying guidance");
        if (
          request.action === "checkpoint" &&
          (!step || !guidedGoal(state, step))
        )
          throw Error(
            "This stage is not ready; check the cube or update guidance",
          );
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      const expected =
        request.action === "checkpoint"
          ? practiceApply(
              guidedState(
                "3x3",
                before.checkpointFaces as Record<string, string[]>,
              ),
              step!.moves,
            )
          : null;
      if (
        request.action === "replan" ||
        practiceKey(expected!) !== practiceKey(state)
      ) {
        await this.limit(r, "planning", 20);
        if (request.action === "replan" && lessonStage(before.courseId))
          requireLessonStage(state, before.courseId);
        planned = scopedLessonPlan(
          await this.solver.solve(state),
          before.courseId,
        );
      }
    }
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const row = await tx.guidedSolve.findFirst({
        where: { id, userId: r.user.id, input: "smart", puzzle: "3x3" },
      });
      if (!row) throw new NotFoundException();
      const context = this.check(
        row,
        request,
        until,
        request.action === "interrupt",
      );
      if (request.action === "interrupt")
        return view(
          await tx.guidedSolve.update({
            where: { id },
            data: {
              status: "INTERRUPTED",
              finishedAt: new Date(),
              version: { increment: 1 },
            },
          }),
        );
      await this.course(tx, row.courseVersion, row.courseId);
      const state = currentOf(row),
        checkpoints = row.checkpoints as any[];
      if (request.action === "turns") {
        if (row.moves.length + request.turns.length > 2000)
          throw new BadRequestException(
            "Begin a new synchronized practice after 2000 received turns",
          );
        let accepted: ReturnType<typeof smartLessonTurns>;
        try {
          accepted = smartLessonTurns(context, state, request);
        } catch (error) {
          throw new BadRequestException((error as Error).message);
        }
        const stageMoves = [...row.stageMoves];
        for (const move of accepted.moves) {
          if (stageMoves.at(-1) === guidedInverse("3x3", [move])[0])
            stageMoves.pop();
          else stageMoves.push(move);
        }
        if (stageMoves.length > 500)
          throw new BadRequestException(
            "Update guidance or begin again after 500 stage turns",
          );
        return view(
          await tx.guidedSolve.update({
            where: { id },
            data: {
              smart: json(accepted.context),
              smartSeenAt: new Date(),
              currentFaces: json(guidedFacelets(accepted.state)),
              moves: [...row.moves, ...accepted.moves],
              stageMoves,
              version: { increment: 1 },
            },
          }),
        );
      }
      try {
        checkSmartLessonSnapshot(
          context,
          state,
          request.faces,
          request.counter,
        );
        if (!context.independentState || context.recoveryRun)
          throw Error("Refresh the device position first");
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      if (checkpoints.length >= 100)
        throw new BadRequestException(
          "Begin a new practice after 100 guidance checkpoints",
        );
      if (request.action === "replan") {
        return view(
          await tx.guidedSolve.update({
            where: { id },
            data: {
              plan: json(planned!),
              stage: scopedLessonStart(state, planned!, row.courseId),
              stageMoves: [],
              checkpointFaces: json(guidedFacelets(state)),
              smartSeenAt: new Date(),
              checkpoints: json([
                ...checkpoints,
                {
                  kind: "REPLAN",
                  at: new Date().toISOString(),
                  faces: guidedFacelets(state),
                },
              ]),
              version: { increment: 1 },
            },
          }),
        );
      }
      const oldPlan = planOf(row),
        step = oldPlan.steps[row.stage],
        plan = planned || oldPlan;
      if (!step || !guidedGoal(state, step))
        throw new BadRequestException("The current stage is not ready");
      const completed = lessonStage(row.courseId)
        ? lessonStageComplete(state, row.courseId)
        : row.stage + 1 === plan.steps.length;
      if (completed && !lessonStage(row.courseId) && !practiceSolved(state))
        throw new BadRequestException(
          "The complete cube must be solved before final progress",
        );
      const saved = await tx.guidedSolve.update({
        where: { id },
        data: {
          plan: json(plan),
          stage: completed
            ? plan.steps.length
            : lessonStage(row.courseId)
              ? scopedLessonStart(state, plan, row.courseId)
              : { increment: 1 },
          stageMoves: [],
          currentFaces: json(guidedFacelets(state)),
          checkpointFaces: json(guidedFacelets(state)),
          smartSeenAt: new Date(),
          checkpoints: json([
            ...checkpoints,
            {
              kind: "CHECKPOINT",
              goal: step.goal,
              ...(step.target === undefined ? {} : { target: step.target }),
              at: new Date().toISOString(),
              faces: guidedFacelets(state),
            },
          ]),
          version: { increment: 1 },
          ...(completed ? { status: "COMPLETED", finishedAt: new Date() } : {}),
        },
      });
      if (completed)
        await saveLessonProgress(
          tx,
          r.user.id,
          row.courseId,
          saved.moves,
          row.courseVersion,
        );
      return view(saved);
    });
  }
}
