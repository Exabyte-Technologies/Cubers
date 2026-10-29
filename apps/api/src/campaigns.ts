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
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { z } from "zod";
import type { Prisma, Campaign } from "@prisma/client";
import {
  CampaignContent,
  CampaignCreate,
  CampaignEdit,
  CampaignReview,
  CampaignEnable,
  SponsorSetting,
  SponsorCard,
  campaignArchiveExpiry,
  permissions,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { accountPolicy, type Authed } from "./security";
const Id = z.string().uuid();
type Tx = Prisma.TransactionClient;
@Injectable()
export class Campaigns {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
  ) {}
  private async staff(tx: Tx, r: Authed, write = false) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.user.id}::uuid FOR SHARE`;
    const u = await tx.user.findUnique({ where: { id: r.user.id } }),
      s = await tx.session.findUnique({ where: { id: r.sessionId } });
    if (
      !u ||
      u.deletedAt ||
      !u.emailVerified ||
      u.region !== this.infra.config.REGION ||
      !(write ? u.role === "ADMIN" : ["ADMIN", "MODERATOR"].includes(u.role)) ||
      !u.mfaSecret ||
      u.mfaGeneration !== r.user.mfaGeneration ||
      !s ||
      s.userId !== u.id ||
      !s.mfaVerified ||
      s.scope !== "FULL" ||
      s.expiresAt <= new Date()
    )
      throw new ForbiddenException("Current staff MFA and authority required");
    return u;
  }
  private async quota(r: Authed) {
    if (!(await this.infra.limit(`campaign-write:${r.user.id}`, 60, 3600)))
      throw new HttpException("Campaign editing limit reached", 429);
  }
  private setting(value: unknown) {
    const p = z
      .object({
        enabled: z.boolean(),
        version: z.number().int().min(1).max(2147483646),
      })
      .strict()
      .safeParse(value);
    return p.success ? p.data : { enabled: false, version: 1 };
  }
  private gate() {
    return (
      this.infra.config.SPONSORS_APPROVED === "true" &&
      (this.infra.config.REGION !== "CN" ||
        this.infra.config.CN_SOCIAL_APPROVED === "true")
    );
  }
  private async archive(tx: Tx, row: Campaign, reason: string) {
    const snapshot = JSON.parse(
      JSON.stringify({
        id: row.id,
        version: row.version,
        title: row.title,
        destination: row.destination,
        content: row.content,
        enabled: row.enabled,
        reviewed: row.reviewed,
        reviewedAt: row.reviewedAt,
        archiveReference: row.archiveReference,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
      }),
    );
    await tx.campaignRevision.create({
      data: {
        campaignId: row.id,
        version: row.version,
        snapshot,
        reason,
        retainUntil: campaignArchiveExpiry(row.endsAt),
      },
    });
  }
  private async audit(
    tx: Tx,
    r: Authed,
    action: string,
    id: string,
    version: number,
  ) {
    await tx.audit.create({
      data: { actorId: r.user.id, action, targetId: id, detail: { version } },
    });
  }
  private checked(content: unknown) {
    const c = CampaignContent.parse(content);
    if (
      Date.parse(c.startsAt) > Date.now() + 366 * 86400000 ||
      Date.parse(c.endsAt) < Date.now() - 366 * 86400000
    )
      throw new BadRequestException(
        "Use a campaign within the one-year scheduling window",
      );
    return c;
  }
  async library(r: Authed, query: unknown) {
    const q = z.object({ cursor: Id.optional() }).strict().parse(query);
    return this.db.$transaction(async (tx) => {
      const staff = await this.staff(tx, r);
      const rows = await tx.campaign.findMany({
        where: q.cursor ? { id: { gt: q.cursor } } : {},
        take: 31,
        orderBy: { id: "asc" },
      });
      return {
        items: rows.slice(0, 30),
        nextCursor: rows.length > 30 ? rows[29].id : null,
        canEdit: staff.role === "ADMIN",
        setting: this.setting(
          (await tx.setting.findUnique({ where: { key: "sponsors-enabled" } }))
            ?.value,
        ),
        deliveryApproved: this.gate(),
        region: this.infra.config.REGION,
      };
    });
  }
  async create(r: Authed, value: unknown) {
    const b = CampaignCreate.parse(value),
      content = this.checked(b.content);
    await this.quota(r);
    return this.db.$transaction(async (tx) => {
      await this.staff(tx, r, true);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472114)`;
      if ((await tx.campaign.count()) >= 500)
        throw new ConflictException(
          "Regional campaign archive capacity reached",
        );
      const row = await tx.campaign.create({
        data: {
          title: content.title.en,
          destination: content.destination,
          startsAt: new Date(content.startsAt),
          endsAt: new Date(content.endsAt),
          content,
        },
      });
      await this.archive(tx, row, b.reason);
      await this.audit(tx, r, "campaign.create", row.id, row.version);
      return row;
    });
  }
  private async change(
    r: Authed,
    id: string,
    expectedVersion: number,
    reason: string,
    apply: (tx: Tx, row: Campaign) => Promise<Campaign>,
  ) {
    Id.parse(id);
    await this.quota(r);
    return this.db.$transaction(async (tx) => {
      await this.staff(tx, r, true);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472114)`;
      const row = await tx.campaign.findUnique({ where: { id } });
      if (!row) throw new NotFoundException();
      if (row.version !== expectedVersion || row.version >= 2147483646)
        throw new ConflictException(
          "Campaign changed; refresh the current version",
        );
      const updated = await apply(tx, row);
      await this.archive(tx, updated, reason);
      await this.audit(tx, r, "campaign.update", id, updated.version);
      return updated;
    });
  }
  async edit(r: Authed, id: string, value: unknown) {
    const b = CampaignEdit.parse(value),
      c = this.checked(b.content);
    return this.change(r, id, b.expectedVersion, b.reason, (tx) =>
      tx.campaign.update({
        where: { id },
        data: {
          title: c.title.en,
          destination: c.destination,
          startsAt: new Date(c.startsAt),
          endsAt: new Date(c.endsAt),
          content: c,
          enabled: false,
          reviewed: false,
          reviewedAt: null,
          archiveReference: null,
          version: { increment: 1 },
        },
      }),
    );
  }
  async review(r: Authed, id: string, value: unknown) {
    const b = CampaignReview.parse(value);
    return this.change(r, id, b.expectedVersion, b.reason, (tx, row) => {
      if (
        b.decision === "approve" &&
        (!CampaignContent.safeParse(row.content).success ||
          row.endsAt <= new Date())
      )
        throw new BadRequestException(
          "A complete current bilingual campaign and future end date are required",
        );
      return tx.campaign.update({
        where: { id },
        data: {
          enabled: false,
          reviewed: b.decision === "approve",
          reviewedAt: b.decision === "approve" ? new Date() : null,
          archiveReference:
            b.decision === "approve" ? b.archiveReference : null,
          version: { increment: 1 },
        },
      });
    });
  }
  async enable(r: Authed, id: string, value: unknown) {
    const b = CampaignEnable.parse(value);
    return this.change(r, id, b.expectedVersion, b.reason, (tx, row) => {
      if (
        b.enabled &&
        (!row.reviewed ||
          !row.reviewedAt ||
          !row.archiveReference ||
          row.endsAt <= new Date() ||
          !CampaignContent.safeParse(row.content).success)
      )
        throw new ConflictException(
          "Review this exact current campaign before enabling it",
        );
      return tx.campaign.update({
        where: { id },
        data: { enabled: b.enabled, version: { increment: 1 } },
      });
    });
  }
  async switch(r: Authed, value: unknown) {
    const b = SponsorSetting.parse(value);
    await this.quota(r);
    return this.db.$transaction(async (tx) => {
      await this.staff(tx, r, true);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472114)`;
      const current = this.setting(
        (await tx.setting.findUnique({ where: { key: "sponsors-enabled" } }))
          ?.value,
      );
      if (
        current.version !== b.expectedVersion ||
        current.version >= 2147483646
      )
        throw new ConflictException("Sponsor configuration changed; refresh");
      if (b.enabled && !this.gate())
        throw new ForbiddenException(
          "Regional advertising and archive-custody review is not approved",
        );
      const next = { enabled: b.enabled, version: current.version + 1 };
      await tx.setting.upsert({
        where: { key: "sponsors-enabled" },
        create: { key: "sponsors-enabled", value: next },
        update: { value: next },
      });
      await this.audit(
        tx,
        r,
        "settings.sponsors",
        "sponsors-enabled",
        next.version,
      );
      return next;
    });
  }
  async history(r: Authed, id: string, query: unknown) {
    Id.parse(id);
    const q = z
      .object({ before: z.coerce.number().int().positive().optional() })
      .strict()
      .parse(query);
    return this.db.$transaction(async (tx) => {
      await this.staff(tx, r);
      const rows = await tx.campaignRevision.findMany({
        where: {
          campaignId: id,
          ...(q.before ? { version: { lt: q.before } } : {}),
        },
        take: 21,
        orderBy: { version: "desc" },
      });
      return {
        items: rows.slice(0, 20),
        nextBefore: rows.length > 20 ? rows[19].version : null,
      };
    });
  }
  private async viewer(tx: Tx, r: Authed) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.user.id}::uuid FOR SHARE`;
    const u = await tx.user.findUnique({ where: { id: r.user.id } }),
      s = await tx.session.findUnique({ where: { id: r.sessionId } });
    return !!(
      u &&
      !u.deletedAt &&
      u.emailVerified &&
      u.region === this.infra.config.REGION &&
      s &&
      s.userId === u.id &&
      s.scope === "FULL" &&
      s.expiresAt > new Date() &&
      permissions(await accountPolicy(tx, u)).canSeeSponsors &&
      (u.region !== "CN" || u.identityVerified)
    );
  }
  private card(row: Campaign) {
    const c = CampaignContent.safeParse(row.content);
    if (!c.success) return null;
    const p = SponsorCard.safeParse({
      id: row.id,
      version: row.version,
      title: c.data.title,
      summary: c.data.summary,
      destination: c.data.destination,
      endsAt: row.endsAt.toISOString(),
      validForMs: Math.min(30000, row.endsAt.getTime() - Date.now()),
    });
    return p.success ? p.data : null;
  }
  async cards(r: Authed) {
    return this.db.$transaction(async (tx) => {
      if (!this.gate() || !(await this.viewer(tx, r))) return [];
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(83472114)`;
      if (
        !this.setting(
          (await tx.setting.findUnique({ where: { key: "sponsors-enabled" } }))
            ?.value,
        ).enabled
      )
        return [];
      const rows = await tx.campaign.findMany({
        where: {
          enabled: true,
          reviewed: true,
          reviewedAt: { not: null },
          archiveReference: { not: null },
          startsAt: { lte: new Date() },
          endsAt: { gt: new Date() },
        },
        orderBy: [{ startsAt: "desc" }, { id: "asc" }],
        take: 3,
      });
      return rows
        .map((row) => this.card(row))
        .filter((c): c is NonNullable<typeof c> => !!c);
    });
  }
  async open(r: Authed, id: string, value: unknown) {
    Id.parse(id);
    const b = z
      .object({ expectedVersion: z.number().int().positive() })
      .strict()
      .parse(value);
    return this.db.$transaction(async (tx) => {
      if (!this.gate() || !(await this.viewer(tx, r)))
        throw new ForbiddenException("Current adult sponsor access required");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(83472114)`;
      if (
        !this.setting(
          (await tx.setting.findUnique({ where: { key: "sponsors-enabled" } }))
            ?.value,
        ).enabled
      )
        throw new NotFoundException("Sponsor cards are off");
      const row = await tx.campaign.findUnique({ where: { id } }),
        now = new Date();
      if (
        !row ||
        !row.enabled ||
        !row.reviewed ||
        !row.reviewedAt ||
        !row.archiveReference ||
        row.version !== b.expectedVersion ||
        row.startsAt > now ||
        row.endsAt <= now
      )
        throw new ConflictException(
          "This advertisement changed or expired; refresh",
        );
      const c = this.card(row);
      if (!c) throw new NotFoundException();
      return { destination: c.destination, version: c.version };
    });
  }
}
@Controller("v1/admin/campaigns")
export class CampaignsController {
  constructor(@Inject(Campaigns) private campaigns: Campaigns) {}
  @Get() list(@Req() r: Authed, @Query() q: unknown) {
    return this.campaigns.library(r, q);
  }
  @Post() create(@Req() r: Authed, @Body() b: unknown) {
    return this.campaigns.create(r, b);
  }
  @Post(":id/content") edit(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.campaigns.edit(r, id, b);
  }
  @Post(":id/review") review(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.campaigns.review(r, id, b);
  }
  @Post(":id/enabled") enable(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.campaigns.enable(r, id, b);
  }
  @Get(":id/history") history(
    @Req() r: Authed,
    @Param("id") id: string,
    @Query() q: unknown,
  ) {
    return this.campaigns.history(r, id, q);
  }
}
export async function expireCampaignArchives(db: Db, now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472114)`;
    const rows = await tx.campaignRevision.findMany({
      where: { retainUntil: { lte: now } },
      select: { id: true },
      take: 500,
      orderBy: { id: "asc" },
    });
    const revisions = rows.length
      ? (
          await tx.campaignRevision.deleteMany({
            where: {
              id: { in: rows.map((r) => r.id) },
              retainUntil: { lte: now },
            },
          })
        ).count
      : 0;
    const end = new Date(now);
    end.setUTCFullYear(end.getUTCFullYear() - 3);
    const old = await tx.campaign.findMany({
      where: { endsAt: { lte: end }, revisions: { none: {} } },
      select: { id: true },
      take: 100,
    });
    const campaigns = old.length
      ? (
          await tx.campaign.deleteMany({
            where: {
              id: { in: old.map((r) => r.id) },
              endsAt: { lte: end },
              revisions: { none: {} },
            },
          })
        ).count
      : 0;
    return { revisions, campaigns };
  });
}
