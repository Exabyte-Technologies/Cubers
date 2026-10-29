import {
  Injectable,
  Inject,
  Controller,
  Get,
  Post,
  Req,
  Body,
  Param,
  Query,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  HttpException,
} from "@nestjs/common";
import { z } from "zod";
import { Prisma, type Course } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  CourseLesson,
  CourseCreate,
  CourseEdit,
  CoursePublish,
  checkedCourseLesson,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { hash } from "./crypto";
import type { Authed } from "./security";
const CourseId = z.string().regex(/^[a-z0-9-]{1,100}$/);
@Injectable()
export class CourseEditing {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
  ) {}
  private async editor(tx: Prisma.TransactionClient, r: Authed) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.user.id}::uuid FOR SHARE`;
    const user = await tx.user.findUnique({ where: { id: r.user.id } }),
      session = await tx.session.findUnique({ where: { id: r.sessionId } });
    if (
      !user ||
      user.deletedAt ||
      !user.emailVerified ||
      user.region !== this.infra.config.REGION ||
      user.role !== "ADMIN" ||
      !user.mfaSecret ||
      user.mfaGeneration !== r.user.mfaGeneration ||
      !session ||
      session.userId !== user.id ||
      !session.mfaVerified ||
      session.scope !== "FULL" ||
      session.expiresAt <= new Date()
    )
      throw new ForbiddenException("Current administrator MFA is required");
  }
  private checked(value: unknown, puzzle?: string) {
    try {
      return checkedCourseLesson(value, puzzle);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "Invalid course content",
      );
    }
  }
  private async quota(r: Authed) {
    if (r.user.role !== "ADMIN")
      throw new ForbiddenException("Administrator role required");
    if (!(await this.infra.limit(`course-edit:${r.user.id}`, 60, 3600)))
      throw new HttpException("Course editing limit reached", 429);
  }
  private digest(content: unknown) {
    const parsed = CourseLesson.safeParse(content);
    return hash(JSON.stringify(parsed.success ? parsed.data : content));
  }
  private async snapshot(tx: Prisma.TransactionClient, row: Course) {
    await tx.courseRevision.upsert({
      where: { courseId_version: { courseId: row.id, version: row.version } },
      create: {
        courseId: row.id,
        version: row.version,
        content: row.content as Prisma.InputJsonValue,
        published: row.published,
        digest: this.digest(row.content),
      },
      update: {},
    });
    const recent = await tx.courseRevision.findMany({
      where: { courseId: row.id },
      orderBy: { version: "desc" },
      take: 50,
      select: { version: true },
    });
    await tx.courseRevision.deleteMany({
      where: {
        courseId: row.id,
        version: { notIn: recent.map((x) => x.version) },
      },
    });
  }
  async library(r: Authed, value: unknown) {
    const q = z
        .object({
          q: z.string().max(100).optional(),
          cursor: CourseId.optional(),
        })
        .strict()
        .parse(value),
      pattern = `%${(q.q || "").replace(/[\\%_]/g, "\\$&")}%`,
      cursor = q.cursor || "";
    const rows = await this.db.$queryRaw<
      {
        id: string;
        puzzle: string;
        level: string;
        version: number;
        published: boolean;
        title: unknown;
        summary: unknown;
      }[]
    >`SELECT id,puzzle,level,version,published,content->'title' AS title,content->'summary' AS summary FROM "Course" WHERE id>${cursor} AND (id ILIKE ${pattern} OR content->'title'->>'en' ILIKE ${pattern} OR content->'title'->>'zh' ILIKE ${pattern}) ORDER BY id ASC LIMIT 31`;
    return {
      items: rows.slice(0, 30),
      nextCursor: rows.length > 30 ? rows[29].id : null,
      canEdit: r.user.role === "ADMIN",
    };
  }
  async detail(id: string) {
    CourseId.parse(id);
    const row = await this.db.course.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }
  async revisions(id: string, version?: unknown) {
    CourseId.parse(id);
    if (version !== undefined) {
      const number = z.coerce.number().int().positive().parse(version);
      const row = await this.db.courseRevision.findUnique({
        where: { courseId_version: { courseId: id, version: number } },
      });
      if (!row) throw new NotFoundException();
      return row;
    }
    return {
      limit: 50,
      items: await this.db.courseRevision.findMany({
        where: { courseId: id },
        select: {
          version: true,
          published: true,
          digest: true,
          createdAt: true,
        },
        orderBy: { version: "desc" },
        take: 50,
      }),
    };
  }
  async create(r: Authed, value: unknown) {
    await this.quota(r);
    const body = CourseCreate.parse(value),
      lesson = this.checked({ ...body.lesson, id: `custom-${randomUUID()}` });
    return this.db.$transaction(async (tx) => {
      await this.editor(tx, r);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472107)`;
      if (
        (await tx.course.count({ where: { id: { startsWith: "custom-" } } })) >=
        1000
      )
        throw new ConflictException("Regional custom-course capacity reached");
      const row = await tx.course.create({
        data: {
          id: lesson.id,
          puzzle: lesson.puzzle,
          level: lesson.level,
          content: lesson as Prisma.InputJsonValue,
          published: false,
        },
      });
      await this.snapshot(tx, row);
      await tx.audit.create({
        data: {
          actorId: r.user.id,
          action: "course.create",
          targetId: row.id,
          detail: {
            version: row.version,
            reason: body.reason,
            digest: this.digest(lesson),
          },
        },
      });
      return row;
    });
  }
  async edit(r: Authed, id: string, value: unknown) {
    CourseId.parse(id);
    await this.quota(r);
    const body = CourseEdit.parse(value);
    if (body.lesson.id !== id)
      throw new BadRequestException("Course identity does not match");
    const lesson = this.checked(body.lesson);
    return this.db.$transaction(async (tx) => {
      await this.editor(tx, r);
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${id} FOR UPDATE`;
      const previous = await tx.course.findUnique({ where: { id } });
      if (!previous) throw new NotFoundException();
      if (previous.version !== body.expectedVersion)
        throw new ConflictException("Course changed; refresh before editing");
      this.checked(lesson, previous.puzzle);
      if (this.digest(previous.content) === this.digest(lesson))
        return previous;
      await this.snapshot(tx, previous);
      const row = await tx.course.update({
        where: { id },
        data: {
          content: lesson as Prisma.InputJsonValue,
          level: lesson.level,
          published: false,
          version: { increment: 1 },
        },
      });
      await this.snapshot(tx, row);
      await tx.audit.create({
        data: {
          actorId: r.user.id,
          action: "course.edit",
          targetId: id,
          detail: {
            previousVersion: previous.version,
            version: row.version,
            wasPublished: previous.published,
            reason: body.reason,
            digest: this.digest(lesson),
          },
        },
      });
      return row;
    });
  }
  async publish(r: Authed, id: string, value: unknown) {
    CourseId.parse(id);
    await this.quota(r);
    const body = CoursePublish.parse(value);
    return this.db.$transaction(async (tx) => {
      await this.editor(tx, r);
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${id} FOR UPDATE`;
      const previous = await tx.course.findUnique({ where: { id } });
      if (!previous) throw new NotFoundException();
      if (previous.version !== body.expectedVersion)
        throw new ConflictException(
          "Course changed; refresh before publishing",
        );
      if (body.published) this.checked(previous.content, previous.puzzle);
      if (previous.published === body.published) return previous;
      await this.snapshot(tx, previous);
      const row = await tx.course.update({
        where: { id },
        data: { published: body.published, version: { increment: 1 } },
      });
      await this.snapshot(tx, row);
      await tx.audit.create({
        data: {
          actorId: r.user.id,
          action: "course.publish",
          targetId: id,
          detail: { ...body, version: row.version },
        },
      });
      return row;
    });
  }
}
@Controller("v1/admin")
export class CourseEditingController {
  constructor(@Inject(CourseEditing) private courses: CourseEditing) {}
  @Get("course-library") library(@Req() r: Authed, @Query() q: unknown) {
    return this.courses.library(r, q);
  }
  @Get("courses/:id") detail(@Param("id") id: string) {
    return this.courses.detail(id);
  }
  @Get("courses/:id/revisions") revisions(@Param("id") id: string) {
    return this.courses.revisions(id);
  }
  @Get("courses/:id/revisions/:version") revision(
    @Param("id") id: string,
    @Param("version") version: string,
  ) {
    return this.courses.revisions(id, version);
  }
  @Post("courses") create(@Req() r: Authed, @Body() body: unknown) {
    return this.courses.create(r, body);
  }
  @Post("courses/:id/content") edit(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.courses.edit(r, id, body);
  }
  @Post("courses/:id") publish(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.courses.publish(r, id, body);
  }
}
