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
  Header,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  HttpException,
} from "@nestjs/common";
import { Prisma, type Announcement } from "@prisma/client";
import { z } from "zod";
import {
  AnnouncementContent,
  AnnouncementCreate,
  AnnouncementEdit,
  AnnouncementPublish,
  AnnouncementPreview,
  AnnouncementDetail,
  permissions,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { accountPolicy, type Authed } from "./security";
import { opaque, hash } from "./crypto";
type Tx = Prisma.TransactionClient;
const Id = z.string().uuid();
const cursorSchema = z
  .object({
    owner: Id,
    region: z.enum(["CN", "INTL"]),
    learning: z.boolean(),
    before: z.string().datetime(),
    id: Id,
  })
  .strict();
const cursorKey = (value: string) => `announcements-page:${hash(value)}`;
@Injectable()
export class Announcements {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
  ) {}
  private async staff(tx: Tx, r: Authed, write = false) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.user.id}::uuid FOR SHARE`;
    const user = await tx.user.findUnique({ where: { id: r.user.id } }),
      session = await tx.session.findUnique({ where: { id: r.sessionId } });
    if (
      !user ||
      user.deletedAt ||
      !user.emailVerified ||
      user.region !== this.infra.config.REGION ||
      !(write
        ? user.role === "ADMIN"
        : ["ADMIN", "MODERATOR"].includes(user.role)) ||
      !user.mfaSecret ||
      user.mfaGeneration !== r.user.mfaGeneration ||
      !session ||
      session.userId !== user.id ||
      session.scope !== "FULL" ||
      !session.mfaVerified ||
      session.expiresAt <= new Date()
    )
      throw new ForbiddenException("Current staff MFA and authority required");
  }
  private async viewer(tx: Tx, r: Authed) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.user.id}::uuid FOR SHARE`;
    const user = await tx.user.findUnique({ where: { id: r.user.id } }),
      session = await tx.session.findUnique({ where: { id: r.sessionId } });
    if (
      !user ||
      user.deletedAt ||
      !user.emailVerified ||
      user.region !== this.infra.config.REGION ||
      !session ||
      session.userId !== user.id ||
      session.scope !== "FULL" ||
      session.expiresAt <= new Date()
    )
      throw new ForbiddenException("Current full account session required");
    return permissions(await accountPolicy(tx, user)).canLearn;
  }
  private checked(value: unknown) {
    const content = AnnouncementContent.parse(value);
    if (
      Date.parse(content.startsAt) > Date.now() + 366 * 86400000 ||
      Date.parse(content.endsAt) <= Date.now()
    )
      throw new BadRequestException(
        "Use an unexpired schedule beginning within one year",
      );
    return content;
  }
  private async archive(tx: Tx, r: Authed, row: Announcement, reason: string) {
    await tx.announcementRevision.create({
      data: {
        announcementId: row.id,
        version: row.version,
        snapshot: JSON.parse(JSON.stringify(row)),
        reason,
      },
    });
    await tx.announcementRevision.deleteMany({
      where: { announcementId: row.id, version: { lt: row.version - 19 } },
    });
    await tx.audit.create({
      data: {
        actorId: r.user.id,
        action: "announcement.change",
        targetId: row.id,
        detail: { version: row.version, published: row.published },
      },
    });
  }
  private async quota(r: Authed) {
    if (!(await this.infra.limit(`announcement-write:${r.user.id}`, 60, 3600)))
      throw new HttpException("Announcement editing limit reached", 429);
  }
  private async readQuota(r: Authed) {
    if (!(await this.infra.limit(`announcement-read:${r.user.id}`, 600, 3600)))
      throw new HttpException("Update reading limit reached", 429);
  }
  async list(r: Authed, query: unknown) {
    const q = z.object({ cursor: Id.optional() }).strict().parse(query);
    return this.db.$transaction(async (tx) => {
      await this.staff(tx, r);
      const rows = await tx.announcement.findMany({
        where: q.cursor ? { id: { gt: q.cursor } } : {},
        orderBy: { id: "asc" },
        take: 21,
      });
      return {
        items: rows.slice(0, 20),
        nextCursor: rows.length > 20 ? rows[19].id : null,
      };
    });
  }
  async create(r: Authed, value: unknown) {
    const b = AnnouncementCreate.parse(value),
      c = this.checked(b.content);
    await this.quota(r);
    return this.db.$transaction(async (tx) => {
      await this.staff(tx, r, true);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472115)`;
      if ((await tx.announcement.count()) >= 500)
        throw new ConflictException(
          "Regional update library is full; expired updates are removed by maintenance",
        );
      if (
        c.courseId &&
        !(await tx.course.findUnique({ where: { id: c.courseId } }))
      )
        throw new BadRequestException("Choose an existing lesson");
      const row = await tx.announcement.create({
        data: {
          kind: c.kind,
          content: c,
          courseId: c.courseId,
          startsAt: new Date(c.startsAt),
          endsAt: new Date(c.endsAt),
        },
      });
      await this.archive(tx, r, row, b.reason);
      return row;
    });
  }
  private async change(
    r: Authed,
    id: string,
    version: number,
    reason: string,
    apply: (tx: Tx, row: Announcement) => Promise<Announcement>,
  ) {
    Id.parse(id);
    await this.quota(r);
    return this.db.$transaction(async (tx) => {
      await this.staff(tx, r, true);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472115)`;
      const row = await tx.announcement.findUnique({ where: { id } });
      if (!row) throw new NotFoundException();
      if (row.version !== version || row.version >= 2147483646)
        throw new ConflictException(
          "Update changed; refresh its current version",
        );
      const updated = await apply(tx, row);
      await this.archive(tx, r, updated, reason);
      return updated;
    });
  }
  async edit(r: Authed, id: string, value: unknown) {
    const b = AnnouncementEdit.parse(value),
      c = this.checked(b.content);
    return this.change(r, id, b.expectedVersion, b.reason, async (tx) => {
      if (
        c.courseId &&
        !(await tx.course.findUnique({ where: { id: c.courseId } }))
      )
        throw new BadRequestException("Choose an existing lesson");
      return tx.announcement.update({
        where: { id },
        data: {
          kind: c.kind,
          content: c,
          courseId: c.courseId || null,
          courseVersion: null,
          published: false,
          reviewedAt: null,
          startsAt: new Date(c.startsAt),
          endsAt: new Date(c.endsAt),
          version: { increment: 1 },
        },
      });
    });
  }
  async publish(r: Authed, id: string, value: unknown) {
    const b = AnnouncementPublish.parse(value);
    return this.change(r, id, b.expectedVersion, b.reason, async (tx, row) => {
      let courseVersion: number | null = null;
      if (b.published) {
        const c = this.checked(row.content);
        if (c.courseId) {
          await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${c.courseId} FOR SHARE`;
          const course = await tx.course.findFirst({
            where: {
              id: c.courseId,
              published: true,
              version: b.courseVersion ?? -1,
            },
          });
          if (!course)
            throw new ConflictException(
              "Review the current published lesson version before publishing this update",
            );
          courseVersion = course.version;
        } else if (b.courseVersion !== undefined)
          throw new BadRequestException("This update has no linked lesson");
      }
      return tx.announcement.update({
        where: { id },
        data: {
          published: b.published,
          reviewedAt: b.published ? new Date() : null,
          courseVersion,
          version: { increment: 1 },
        },
      });
    });
  }
  async history(r: Authed, id: string) {
    Id.parse(id);
    return this.db.$transaction(async (tx) => {
      await this.staff(tx, r);
      return tx.announcementRevision.findMany({
        where: { announcementId: id },
        orderBy: { version: "desc" },
        take: 20,
      });
    });
  }
  private preview(row: Announcement, now: number) {
    const c = AnnouncementContent.safeParse(row.content);
    if (
      !c.success ||
      c.data.kind !== row.kind ||
      (c.data.courseId || null) !== row.courseId ||
      Date.parse(c.data.startsAt) !== row.startsAt.getTime() ||
      Date.parse(c.data.endsAt) !== row.endsAt.getTime()
    )
      return null;
    const validForMs = Math.min(30_000, row.endsAt.getTime() - now);
    if (validForMs <= 0) return null;
    return AnnouncementPreview.parse({
      id: row.id,
      version: row.version,
      kind: row.kind,
      title: c.data.title,
      summary: c.data.summary,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      validForMs,
    });
  }
  private scope(learning: boolean, now: Date) {
    // Prisma Date parameters in raw queries are timestamptz, while these
    // Prisma DateTime columns are UTC timestamp without time zone. Bind UTC
    // text explicitly to avoid applying the connection's timezone twice.
    return Prisma.sql`a."published"=true AND a."reviewedAt" IS NOT NULL AND a."startsAt"<=${now.toISOString()}::timestamp AND a."endsAt">${now.toISOString()}::timestamp
      AND (a."kind"='service' OR (a."kind"='learning' AND ${learning}))
      AND (a."courseId" IS NULL OR (c."published"=true AND c."version"=a."courseVersion"))`;
  }
  async feed(r: Authed, query: unknown) {
    const q = z
      .object({
        cursor: z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/)
          .optional(),
      })
      .strict()
      .parse(query);
    await this.readQuota(r);
    return this.db.$transaction(async (tx) => {
      const learning = await this.viewer(tx, r);
      let before: z.infer<typeof cursorSchema> | undefined;
      if (q.cursor) {
        try {
          before = cursorSchema.parse(
            JSON.parse(
              (await this.infra.redis.get(cursorKey(q.cursor))) || "null",
            ),
          );
        } catch {
          throw new BadRequestException(
            "Update page expired; reload current updates",
          );
        }
        if (
          before.owner !== r.user.id ||
          before.region !== this.infra.config.REGION ||
          before.learning !== learning
        )
          throw new BadRequestException(
            "Update page scope changed; reload current updates",
          );
      }
      const now = new Date();
      const boundary = before
        ? Prisma.sql`AND (a."startsAt"<${before.before}::timestamp OR (a."startsAt"=${before.before}::timestamp AND a."id"<${before.id}::uuid))`
        : Prisma.empty;
      const rows = await tx.$queryRaw<
        Announcement[]
      >`SELECT a.* FROM "Announcement" a LEFT JOIN "Course" c ON c."id"=a."courseId" WHERE ${this.scope(learning, now)} ${boundary} ORDER BY a."startsAt" DESC,a."id" DESC LIMIT 11`;
      const items = rows
        .slice(0, 10)
        .map((row) => this.preview(row, now.getTime()))
        .filter((row) => row !== null);
      let nextCursor: string | null = null;
      if (rows.length > 10) {
        const last = rows[9];
        nextCursor = opaque();
        await this.infra.redis.set(
          cursorKey(nextCursor),
          JSON.stringify({
            owner: r.user.id,
            region: this.infra.config.REGION,
            learning,
            before: last.startsAt.toISOString(),
            id: last.id,
          }),
          "EX",
          300,
        );
      }
      return { items, nextCursor };
    });
  }
  async detail(r: Authed, id: string, query: unknown) {
    Id.parse(id);
    const q = z
      .object({ version: z.coerce.number().int().positive() })
      .strict()
      .parse(query);
    await this.readQuota(r);
    return this.db.$transaction(async (tx) => {
      const learning = await this.viewer(tx, r),
        now = new Date();
      const rows = await tx.$queryRaw<
        Announcement[]
      >`SELECT a.* FROM "Announcement" a LEFT JOIN "Course" c ON c."id"=a."courseId" WHERE a."id"=${id}::uuid AND ${this.scope(learning, now)} LIMIT 1`;
      const row = rows[0],
        card = row && this.preview(row, now.getTime());
      if (!card) throw new NotFoundException();
      if (row.version !== q.version)
        throw new ConflictException("Update changed; reload current updates");
      const c = AnnouncementContent.parse(row.content);
      return AnnouncementDetail.parse({
        ...card,
        body: c.body,
        ...(c.courseId ? { courseId: c.courseId } : {}),
      });
    });
  }
}
@Controller("v1/admin/announcements")
export class AdminAnnouncementsController {
  constructor(@Inject(Announcements) private updates: Announcements) {}
  @Get() @Header("Cache-Control", "private, no-store") list(
    @Req() r: Authed,
    @Query() q: unknown,
  ) {
    return this.updates.list(r, q);
  }
  @Post() create(@Req() r: Authed, @Body() b: unknown) {
    return this.updates.create(r, b);
  }
  @Post(":id/content") edit(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.updates.edit(r, id, b);
  }
  @Post(":id/publication") publish(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.updates.publish(r, id, b);
  }
  @Get(":id/history") @Header("Cache-Control", "private, no-store") history(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    return this.updates.history(r, id);
  }
}
@Controller("v1/announcements")
export class AnnouncementsController {
  constructor(@Inject(Announcements) private updates: Announcements) {}
  @Get() @Header("Cache-Control", "private, no-store") feed(
    @Req() r: Authed,
    @Query() q: unknown,
  ) {
    return this.updates.feed(r, q);
  }
  @Get(":id") @Header("Cache-Control", "private, no-store") detail(
    @Req() r: Authed,
    @Param("id") id: string,
    @Query() q: unknown,
  ) {
    return this.updates.detail(r, id, q);
  }
}
export async function expireAnnouncements(db: Db, now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472115)`;
    const rows = await tx.announcement.findMany({
      where: { endsAt: { lt: new Date(now.getTime() - 90 * 86400000) } },
      orderBy: [{ endsAt: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true },
    });
    return tx.announcement.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
  });
}
