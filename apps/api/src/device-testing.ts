import {
  Injectable,
  Inject,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Header,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import type { Prisma, DeviceTestReport } from "@prisma/client";
import { z } from "zod";
import {
  DeviceTestContent,
  DeviceTestCreate,
  DeviceTestEdit,
  DeviceTestChange,
  DeviceTestReview,
  DeviceTestModel,
  DeviceTestStatus,
  deviceTestApprovalProblems,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import type { Authed } from "./security";
type Tx = Prisma.TransactionClient;
const Id = z.string().uuid(),
  YEAR = 365 * 86400000;
@Injectable()
export class DeviceTesting {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
  ) {}
  private async staff(tx: Tx, r: Authed, write = false) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.user.id}::uuid FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "Session" WHERE id=${r.sessionId}::uuid FOR SHARE`;
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
      throw new ForbiddenException(
        "Current regional staff MFA and authority required",
      );
    return user.role === "ADMIN";
  }
  private checked(value: unknown) {
    const c = DeviceTestContent.parse(value),
      now = Date.now(),
      tested = Date.parse(c.testedAt);
    if (tested > now + 60000 || tested + YEAR <= now)
      throw new BadRequestException("Use a test date within the past 365 days");
    return c;
  }
  private async quota(r: Authed) {
    if (!(await this.infra.limit(`device-test-write:${r.user.id}`, 60, 3600)))
      throw new HttpException("Device report editing limit reached", 429);
  }
  private async contribute(tx: Tx, id: string, userId: string) {
    if (
      await tx.deviceTestContributor.findUnique({
        where: { reportId_userId: { reportId: id, userId } },
      })
    )
      return;
    if (
      (await tx.deviceTestContributor.count({ where: { reportId: id } })) >= 20
    )
      throw new ConflictException(
        "Contributor limit reached; create a new report",
      );
    await tx.deviceTestContributor.create({ data: { reportId: id, userId } });
  }
  private async archive(
    tx: Tx,
    r: Authed,
    row: DeviceTestReport,
    reason: string,
  ) {
    // Historical content never embeds staff identifiers; live associations use
    // ON DELETE SET NULL and the existing audit erasure path handles actors.
    await tx.deviceTestRevision.create({
      data: {
        reportId: row.id,
        version: row.version,
        reason,
        snapshot: {
          content: row.content,
          status: row.status,
          version: row.version,
          reviewedAt: row.reviewedAt?.toISOString() ?? null,
          reviewedVersion: row.reviewedVersion,
          expiresAt: row.expiresAt.toISOString(),
        },
      },
    });
    await tx.deviceTestRevision.deleteMany({
      where: { reportId: row.id, version: { lt: row.version - 19 } },
    });
    await tx.audit.create({
      data: {
        actorId: r.user.id,
        action: "device-test.change",
        targetId: row.id,
        detail: { version: row.version, status: row.status, model: row.model },
      },
    });
  }
  private async view(
    tx: Tx,
    r: Authed,
    row: DeviceTestReport,
    admin: boolean,
    detail = true,
  ) {
    const c = DeviceTestContent.parse(row.content);
    if (c.model !== row.model)
      throw new ConflictException("Report metadata is inconsistent");
    const contributedByYou = !!(await tx.deviceTestContributor.findUnique({
      where: { reportId_userId: { reportId: row.id, userId: r.user.id } },
    }));
    return {
      id: row.id,
      model: row.model,
      version: row.version,
      status: row.status,
      platform: c.platform,
      scope: c.scope,
      provenance: c.provenance,
      firmware: c.firmware,
      testedAt: c.testedAt,
      expiresAt: row.expiresAt.toISOString(),
      canReview: admin && !contributedByYou && row.status === "SUBMITTED",
      contributedByYou,
      activationAvailable: false,
      ...(detail
        ? {
            content: c,
            reviewedAt: row.reviewedAt?.toISOString() ?? null,
            reviewedVersion: row.reviewedVersion,
            createdAt: row.createdAt.toISOString(),
          }
        : {}),
    };
  }
  async list(r: Authed, query: unknown) {
    const q = z
      .object({
        cursor: Id.optional(),
        model: DeviceTestModel.optional(),
        status: DeviceTestStatus.optional(),
      })
      .strict()
      .parse(query);
    return this.db.$transaction(async (tx) => {
      const admin = await this.staff(tx, r);
      const rows = await tx.deviceTestReport.findMany({
        where: {
          ...(q.cursor ? { id: { gt: q.cursor } } : {}),
          model: q.model,
          status: q.status,
          expiresAt: { gt: new Date() },
        },
        orderBy: { id: "asc" },
        take: 21,
      });
      return {
        items: await Promise.all(
          rows.slice(0, 20).map((row) => this.view(tx, r, row, admin, false)),
        ),
        nextCursor: rows.length > 20 ? rows[19].id : null,
        canEdit: admin,
        activationAvailable: false,
      };
    });
  }
  private async current(tx: Tx, id: string) {
    const row = await tx.deviceTestReport.findUnique({ where: { id } });
    if (!row || row.expiresAt <= new Date())
      throw new NotFoundException("Report missing or expired");
    return row;
  }
  async detail(r: Authed, id: string) {
    Id.parse(id);
    return this.db.$transaction(async (tx) => {
      const admin = await this.staff(tx, r);
      return this.view(tx, r, await this.current(tx, id), admin);
    });
  }
  private async currentAfterStaff(tx: Tx, r: Authed, id: string) {
    await this.staff(tx, r);
    return this.current(tx, id);
  }
  async history(r: Authed, id: string) {
    Id.parse(id);
    return this.db.$transaction(async (tx) => {
      await this.currentAfterStaff(tx, r, id);
      return tx.deviceTestRevision.findMany({
        where: { reportId: id },
        orderBy: { version: "desc" },
        take: 20,
      });
    });
  }
  async create(r: Authed, value: unknown) {
    const b = DeviceTestCreate.parse(value);
    await this.quota(r);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472116)`;
      await this.staff(tx, r, true);
      const c = this.checked(b.content);
      if ((await tx.deviceTestReport.count()) >= 500)
        throw new ConflictException(
          "Regional report library is full; expired records require maintenance",
        );
      const row = await tx.deviceTestReport.create({
        data: {
          model: c.model,
          content: c,
          expiresAt: new Date(Date.parse(c.testedAt) + YEAR),
        },
      });
      await this.contribute(tx, row.id, r.user.id);
      await this.archive(tx, r, row, b.reason);
      return this.view(tx, r, row, true);
    });
  }
  private async change(
    r: Authed,
    id: string,
    version: number,
    reason: string,
    apply: (tx: Tx, row: DeviceTestReport) => Promise<DeviceTestReport>,
  ) {
    Id.parse(id);
    await this.quota(r);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472116)`;
      await this.staff(tx, r, true);
      const row = await this.current(tx, id);
      if (row.version !== version || row.version >= 2147483646)
        throw new ConflictException(
          "Report changed; refresh its current version",
        );
      const next = await apply(tx, row);
      await this.archive(tx, r, next, reason);
      return this.view(tx, r, next, true);
    });
  }
  async edit(r: Authed, id: string, value: unknown) {
    const b = DeviceTestEdit.parse(value);
    return this.change(r, id, b.expectedVersion, b.reason, async (tx, row) => {
      const c = this.checked(b.content);
      await this.contribute(tx, id, r.user.id);
      return tx.deviceTestReport.update({
        where: { id },
        data: {
          model: c.model,
          content: c,
          status: "DRAFT",
          reviewedAt: null,
          reviewerId: null,
          reviewedVersion: null,
          expiresAt: new Date(
            Math.min(row.expiresAt.getTime(), Date.parse(c.testedAt) + YEAR),
          ),
          version: { increment: 1 },
        },
      });
    });
  }
  async submit(r: Authed, id: string, value: unknown) {
    const b = DeviceTestChange.parse(value);
    return this.change(r, id, b.expectedVersion, b.reason, async (tx, row) => {
      if (row.status !== "DRAFT")
        throw new ConflictException("Only a draft can be submitted");
      this.checked(row.content);
      return tx.deviceTestReport.update({
        where: { id },
        data: { status: "SUBMITTED", version: { increment: 1 } },
      });
    });
  }
  async review(r: Authed, id: string, value: unknown) {
    const b = DeviceTestReview.parse(value);
    return this.change(r, id, b.expectedVersion, b.reason, async (tx, row) => {
      if (row.status !== "SUBMITTED")
        throw new ConflictException("Review a submitted version");
      if (
        await tx.deviceTestContributor.findUnique({
          where: { reportId_userId: { reportId: id, userId: r.user.id } },
        })
      )
        throw new ForbiddenException(
          "A content contributor cannot independently review this report",
        );
      const c = this.checked(row.content);
      if (b.approve) {
        const problems = deviceTestApprovalProblems(c);
        if (problems.length)
          throw new BadRequestException({
            message: "Physical acceptance is incomplete for this scope",
            problems,
          });
      }
      return tx.deviceTestReport.update({
        where: { id },
        data: {
          status: b.approve ? "APPROVED" : "REJECTED",
          reviewedAt: new Date(),
          reviewerId: r.user.id,
          reviewedVersion: row.version,
          version: { increment: 1 },
        },
      });
    });
  }
  async withdraw(r: Authed, id: string, value: unknown) {
    const b = DeviceTestChange.parse(value);
    return this.change(r, id, b.expectedVersion, b.reason, (tx, row) => {
      if (row.status === "WITHDRAWN")
        throw new ConflictException("Report already withdrawn");
      return tx.deviceTestReport.update({
        where: { id },
        data: {
          status: "WITHDRAWN",
          reviewedAt: null,
          reviewerId: null,
          reviewedVersion: null,
          version: { increment: 1 },
        },
      });
    });
  }
}
@Controller("v1/admin/device-tests")
export class DeviceTestingController {
  constructor(@Inject(DeviceTesting) private testing: DeviceTesting) {}
  @Get() @Header("Cache-Control", "private, no-store") list(
    @Req() r: Authed,
    @Query() q: unknown,
  ) {
    return this.testing.list(r, q);
  }
  @Get(":id") @Header("Cache-Control", "private, no-store") detail(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    return this.testing.detail(r, id);
  }
  @Get(":id/history") @Header("Cache-Control", "private, no-store") history(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    return this.testing.history(r, id);
  }
  @Post() create(@Req() r: Authed, @Body() b: unknown) {
    return this.testing.create(r, b);
  }
  @Post(":id/content") edit(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.testing.edit(r, id, b);
  }
  @Post(":id/submit") submit(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.testing.submit(r, id, b);
  }
  @Post(":id/review") review(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.testing.review(r, id, b);
  }
  @Post(":id/withdraw") withdraw(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.testing.withdraw(r, id, b);
  }
}
export async function expireDeviceTests(db: Db, now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472116)`;
    const rows = await tx.deviceTestReport.findMany({
      where: { expiresAt: { lte: now } },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true },
    });
    return tx.deviceTestReport.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
  });
}
