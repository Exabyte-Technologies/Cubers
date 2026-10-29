import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Req,
  Body,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  HttpException,
} from "@nestjs/common";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { Prisma, type LearningAssessment } from "@prisma/client";
import {
  AssessmentAnswer,
  StartAssessment,
  ASSESSMENT_VERSION,
  assessmentDefinitions,
  practiceApply,
  practiceSolved,
  solvedPuzzle,
  inverse,
  pyraminxInverse,
  Puzzle,
  lessons,
  type AssessmentTask,
  type AssessmentResult,
  type AssessmentView,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { type Authed } from "./security";
import { learningWrite } from "./learning-authority";

const tasksOf = (row: LearningAssessment) =>
  row.tasks as unknown as AssessmentTask[];
const answersOf = (row: LearningAssessment) =>
  row.answers as unknown as AssessmentResult[];
const json = (value: unknown) => value as Prisma.InputJsonValue;
function view(row: LearningAssessment): AssessmentView {
  const tasks = tasksOf(row),
    answers = answersOf(row);
  const status =
    row.status === "ACTIVE" && row.expiresAt <= new Date()
      ? "EXPIRED"
      : row.status;
  const current = status === "ACTIVE" ? tasks[answers.length] : null;
  return {
    id: row.id,
    puzzle: Puzzle.parse(row.puzzle),
    status,
    version: row.version,
    definitionVersion: row.definitionVersion,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() || null,
    total: tasks.length,
    current: current
      ? {
          id: current.id,
          title: current.title,
          question: current.question,
          choices: current.choices,
          setup: current.setup,
        }
      : null,
    feedback: answers.map((answer, index) => {
      const task = tasks[index];
      return {
        title: task.title,
        question: task.question,
        correctAnswer: task.choices.find((c) => c.id === task.correctOptionId)!
          .text,
        explanation: task.explanation,
        knowledge: answer.knowledge,
        puzzle: answer.puzzle,
        skipped: answer.kind === "skip",
        lessonId: task.lessonId,
      };
    }),
  };
}

@Controller("v1")
export class AssessmentController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
  ) {}
  @Get("assessments") async list(
    @Req() r: Authed,
    @Query("puzzle") raw: unknown,
  ) {
    const puzzle = Puzzle.parse(raw);
    const rows = await this.db.learningAssessment.findMany({
      where: { userId: r.user.id, puzzle },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    return rows.map((row) => ({
      id: row.id,
      puzzle,
      status: view(row).status,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
      completedChecks: answersOf(row).length,
      total: tasksOf(row).length,
    }));
  }
  @Post("assessments") async start(@Req() r: Authed, @Body() body: unknown) {
    const { puzzle } = StartAssessment.parse(body);
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const now = new Date();
      await tx.learningAssessment.updateMany({
        where: { userId: r.user.id, status: "ACTIVE", expiresAt: { lte: now } },
        data: { status: "EXPIRED", finishedAt: now, version: { increment: 1 } },
      });
      const active = await tx.learningAssessment.findFirst({
        where: { userId: r.user.id, puzzle, status: "ACTIVE" },
      });
      if (active) {
        until(active.expiresAt, "Check expired; start again");
        return view(active);
      }
      if (
        (await tx.learningAssessment.count({
          where: {
            userId: r.user.id,
            puzzle,
            createdAt: { gte: new Date(now.getTime() - 86400000) },
          },
        })) >= 3
      )
        throw new HttpException(
          "Three checks per puzzle per day; continue practice and return tomorrow",
          429,
        );
      const definitions = assessmentDefinitions[puzzle];
      const ids = definitions.map((definition) => definition.lessonId).sort();
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`;
      const published = await tx.course.count({
        where: {
          id: { in: definitions.map((d) => d.lessonId) },
          published: true,
        },
      });
      if (published !== definitions.length)
        throw new ConflictException(
          "This puzzle's placement check is temporarily unavailable",
        );
      const tasks = definitions.map((definition): AssessmentTask => {
        const order = [0, 1, 2];
        for (let i = 2; i > 0; i--) {
          const j = randomInt(i + 1);
          [order[i], order[j]] = [order[j], order[i]];
        }
        const ids = ["a", "b", "c"] as const;
        const algorithm =
          definition.algorithms[randomInt(definition.algorithms.length)];
        return {
          id: definition.id,
          lessonId: definition.lessonId,
          title: definition.title,
          question: definition.question,
          choices: order.map((original, index) => ({
            id: ids[index],
            text: definition.choices[original],
          })),
          correctOptionId: ids[order.indexOf(definition.correct)],
          setup:
            puzzle === "pyraminx"
              ? pyraminxInverse(algorithm)
              : inverse(algorithm),
          explanation: definition.explanation,
        };
      });
      return view(
        await tx.learningAssessment.create({
          data: {
            userId: r.user.id,
            puzzle,
            definitionVersion: ASSESSMENT_VERSION,
            tasks: json(tasks),
            expiresAt: new Date(now.getTime() + 86400000),
          },
        }),
      );
    });
  }
  @Get("assessments/:id") async get(@Req() r: Authed, @Param("id") id: string) {
    z.string().uuid().parse(id);
    const row = await this.db.learningAssessment.findFirst({
      where: { id, userId: r.user.id },
    });
    if (!row) throw new NotFoundException();
    return view(row);
  }
  @Post("assessments/:id/answers") async answer(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    z.string().uuid().parse(id);
    const request = AssessmentAnswer.parse(body);
    if (!(await this.infra.limit(`assessment-answer:${r.user.id}`, 120, 3600)))
      throw new HttpException(
        "Placement answer limit reached; return to lesson practice",
        429,
      );
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const row = await tx.learningAssessment.findFirst({
        where: { id, userId: r.user.id },
      });
      if (!row) throw new NotFoundException();
      if (row.version !== request.version || row.status !== "ACTIVE")
        throw new ConflictException(
          "Check changed or expired. Reload before continuing.",
        );
      until(row.expiresAt, "Check expired. Reload before continuing.");
      const tasks = tasksOf(row),
        answers = answersOf(row),
        task = tasks[answers.length];
      if (!task) throw new ConflictException("Check is already finished");
      let puzzleSolved = false;
      if (request.kind === "submit") {
        try {
          puzzleSolved = practiceSolved(
            practiceApply(
              practiceApply(solvedPuzzle(Puzzle.parse(row.puzzle)), task.setup),
              request.moves,
            ),
          );
        } catch {
          throw new BadRequestException("Invalid puzzle move");
        }
      }
      const knowledge =
        request.kind === "submit" && request.optionId === task.correctOptionId;
      answers.push({
        taskId: task.id,
        kind: request.kind,
        ...(request.kind === "submit" ? { optionId: request.optionId } : {}),
        moves: request.kind === "submit" ? request.moves : [],
        knowledge,
        puzzle: puzzleSolved,
        passed: knowledge && puzzleSolved,
      });
      const completed = answers.length === tasks.length;
      return view(
        await tx.learningAssessment.update({
          where: { id },
          data: {
            answers: json(answers),
            version: { increment: 1 },
            ...(completed
              ? { status: "COMPLETED", finishedAt: new Date() }
              : {}),
          },
        }),
      );
    });
  }
  @Delete("assessments/:id") async cancel(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    z.string().uuid().parse(id);
    const { version } = z
      .object({ version: z.number().int().min(0) })
      .strict()
      .parse(body);
    return learningWrite(this.db, this.infra.config, r, async (tx, until) => {
      const row = await tx.learningAssessment.findFirst({
        where: { id, userId: r.user.id },
      });
      if (!row) throw new NotFoundException();
      if (row.version !== version || row.status !== "ACTIVE")
        throw new ConflictException("Check changed; reload");
      until(row.expiresAt, "Check expired; reload");
      return view(
        await tx.learningAssessment.update({
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
  @Get("learning-plan") async plan(
    @Req() r: Authed,
    @Query("puzzle") raw: unknown,
  ) {
    const puzzle = Puzzle.parse(raw);
    const [courses, progress, latest, active] = await Promise.all([
      // Extract only catalog metadata; recommendations need neither complete
      // bilingual lessons nor the learner's stored move histories.
      this.db.$queryRaw<
        { id: string; level: string; version: number }[]
      >`SELECT id, version, content->>'level' AS level FROM "Course" WHERE published = true AND content->>'puzzle' = ${puzzle}`,
      this.db.progress.findMany({
        where: { userId: r.user.id },
        orderBy: [{ reviewAt: "asc" }, { id: "asc" }],
        select: {
          lessonId: true,
          completed: true,
          reviewAt: true,
          courseVersion: true,
        },
      }),
      this.db.learningAssessment.findFirst({
        where: { userId: r.user.id, puzzle, status: "COMPLETED" },
        orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      }),
      this.db.learningAssessment.findFirst({
        where: {
          userId: r.user.id,
          puzzle,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }),
    ]);
    const order = new Map(lessons.map((l, i) => [l.id, i]));
    const levels = ["beginner", "intermediate", "advanced"];
    const available = courses
      .filter((c) => levels.includes(c.level))
      .sort(
        (a, b) =>
          (order.get(a.id) ?? 10000) - (order.get(b.id) ?? 10000) ||
          a.id.localeCompare(b.id),
      );
    const ids = new Set(available.map((c) => c.id)),
      completed = new Set(
        progress
          .filter(
            (p) =>
              p.completed &&
              p.courseVersion !== null &&
              available.some(
                (c) => c.id === p.lessonId && c.version === p.courseVersion,
              ),
          )
          .map((p) => p.lessonId),
      );
    const queue: {
      lessonId: string;
      reason: "review" | "placement" | "next";
    }[] = [];
    const add = (lessonId: string, reason: "review" | "placement" | "next") => {
      if (
        ids.has(lessonId) &&
        !queue.some((item) => item.lessonId === lessonId) &&
        queue.length < 6
      )
        queue.push({ lessonId, reason });
    };
    const now = new Date();
    for (const item of progress.filter(
      (p) => p.completed && p.reviewAt <= now,
    )) {
      add(item.lessonId, "review");
      if (queue.length >= 3) break;
    }
    const answers = latest ? answersOf(latest) : [];
    if (latest)
      tasksOf(latest).forEach((task, i) => {
        if (!answers[i]?.passed) add(task.lessonId, "placement");
      });
    const firstGap = answers.findIndex((a) => !a.passed);
    const focus =
      !latest || firstGap === 0
        ? "beginner"
        : firstGap === 1
          ? "intermediate"
          : "advanced";
    for (const course of available.filter(
      (c) => levels.indexOf(c.level) >= levels.indexOf(focus),
    ))
      if (!completed.has(course.id)) add(course.id, "next");
    for (const course of available)
      if (!completed.has(course.id)) add(course.id, "next");
    return {
      puzzle,
      queue,
      activeAssessmentId: active?.id || null,
      assessment: latest
        ? {
            id: latest.id,
            completedAt: latest.finishedAt,
            checksPassed: answers.filter((a) => a.passed).length,
            total: tasksOf(latest).length,
          }
        : null,
    };
  }
}
