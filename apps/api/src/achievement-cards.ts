import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { z } from "zod";
import type { AchievementCard, Prisma, User } from "@prisma/client";
import {
  CARD_TEMPLATE_VERSION,
  PrepareAchievementCard,
  CardApproval,
  CardExport,
  permissions,
  isYoungChild,
  type AchievementCardView,
  type CardImage,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { Profiles } from "./profiles";
import { accountPolicy, eligibleGuardian, type Authed } from "./security";
import { renderAchievementCard } from "./achievement-card-image";
import { notifyUser } from "./notifications";
type Tx = Prisma.TransactionClient;
type Role = "owner" | "guardian" | "staff";
const Window = 7 * 86400000;
const pageQuery = z.object({ cursor: z.string().uuid().optional() }).strict();
@Injectable()
export class AchievementCards {
  private renderer = renderAchievementCard;
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(Profiles) private profiles: Profiles,
  ) {}
  view(row: AchievementCard): AchievementCardView {
    return {
      id: row.id,
      achievementId: row.achievementId as AchievementCardView["achievementId"],
      locale: row.locale as "en" | "zh",
      namedLabel: row.namedLabel,
      status: row.status,
      revision: row.revision,
      imageDigest: row.imageDigest,
      templateVersion: row.templateVersion,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      expired: row.expiresAt <= new Date(),
    };
  }
  private async actor(tx: Tx, r: Authed, role: Role) {
    const session = await tx.session.findFirst({
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
    if (!session)
      throw new ForbiddenException("Current account access is required");
    if (
      role === "staff" &&
      (!["ADMIN", "MODERATOR"].includes(session.user.role) ||
        !session.user.mfaSecret ||
        !session.mfaVerified)
    )
      throw new ForbiddenException("Current staff role and MFA are required");
    if (
      role === "guardian" &&
      !eligibleGuardian(session.user, this.infra.config.REGION)
    )
      throw new ForbiddenException("Current guardian eligibility is required");
    return session.user;
  }
  private async eligible(tx: Tx, user: User, row?: AchievementCard) {
    if (
      user.deletedAt ||
      !user.emailVerified ||
      user.region !== this.infra.config.REGION
    )
      throw new ForbiddenException("Current account eligibility is required");
    const policy = await accountPolicy(tx, user);
    if (
      !permissions(policy).canLearn ||
      !permissions(policy).canPost ||
      (policy.age >= 18 && !user.adultVerified) ||
      (user.region === "CN" && this.infra.config.CN_SOCIAL_APPROVED !== "true")
    )
      throw new ForbiddenException("Current sharing permission is required");
    const consent = isYoungChild(policy)
      ? await tx.consent.findUnique({ where: { childId: user.id } })
      : null;
    if (row) {
      if (
        row.templateVersion !== CARD_TEMPLATE_VERSION ||
        row.expiresAt <= new Date()
      )
        throw new ConflictException(
          "Prepare a new card; this export window expired or changed",
        );
      if (
        isYoungChild(policy) !== !!row.guardianId ||
        (row.guardianId && consent?.guardianId !== row.guardianId)
      )
        throw new ConflictException(
          "Guardian conditions changed; prepare a new card",
        );
      if (
        row.namedLabel &&
        (policy.age < 18 ||
          user.profileStatus === "REMOVED" ||
          row.namedLabel !== user.displayName ||
          row.namedRevision !== user.profileRevision)
      )
        throw new ConflictException("Identity changed; prepare a new card");
      if (
        user.region === "CN" &&
        ["virtual-solve", "reviewed-physical"].includes(row.achievementId) &&
        this.infra.config.CN_GAMES_APPROVED !== "true"
      )
        throw new ForbiddenException(
          "Current game-service approval is required",
        );
      if (
        !(await this.profiles.achievements(tx, user)).some(
          (a) => a.id === row.achievementId,
        )
      )
        throw new ConflictException("This milestone is no longer available");
    }
    return { policy, consent };
  }
  private async owned(tx: Tx, r: Authed, id: string, role: Role) {
    const actor = await this.actor(tx, r, role);
    const row = await tx.achievementCard.findFirst({
      where: {
        id: z.string().uuid().parse(id).toLowerCase(),
        ...(role === "owner"
          ? { userId: actor.id }
          : role === "guardian"
            ? { guardianId: actor.id }
            : {}),
        user: { region: this.infra.config.REGION, deletedAt: null },
      },
      include: { user: true },
    });
    if (!row) throw new NotFoundException("Card is unavailable");
    if (
      role === "staff" &&
      (actor.id === row.userId || actor.id === row.guardianId)
    )
      throw new ForbiddenException("An independent reviewer is required");
    if (role === "guardian") {
      const policy = await accountPolicy(tx, row.user),
        consent = await tx.consent.findUnique({
          where: { childId: row.userId },
        });
      if (
        !isYoungChild(policy) ||
        !policy.guardianVerified ||
        consent?.guardianId !== actor.id
      )
        throw new NotFoundException("Card is unavailable");
    }
    return { row, user: row.user, actor };
  }
  async catalogue(r: Authed) {
    if (!(await this.infra.limit(`card-list:${r.user.id}`, 60, 60)))
      throw new HttpException("Too many card requests", 429);
    const user = await this.actor(this.db, r, "owner");
    let sharingAvailable = true;
    try {
      await this.eligible(this.db, user);
    } catch (e) {
      if (e instanceof ForbiddenException) sharingAvailable = false;
      else throw e;
    }
    const policy = await accountPolicy(this.db, user);
    return {
      achievements: await this.profiles.achievements(this.db, user),
      sharingAvailable,
      namedCardsAvailable:
        sharingAvailable &&
        policy.age >= 18 &&
        user.profileStatus !== "REMOVED" &&
        user.displayName.length >= 2 &&
        user.displayName.length <= 40 &&
        !/[\p{Cc}\p{Cf}]/u.test(user.displayName),
      youngChild: isYoungChild(policy),
      minor: policy.age < 18,
    };
  }
  async list(r: Authed, role: Role, query: unknown) {
    if (!(await this.infra.limit(`card-list:${r.user.id}`, 60, 60)))
      throw new HttpException("Too many card requests", 429);
    const b = pageQuery.parse(query),
      actor = await this.actor(this.db, r, role);
    const where: Prisma.AchievementCardWhereInput = {
      createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
      user: { region: this.infra.config.REGION, deletedAt: null },
      ...(role === "owner"
        ? { userId: actor.id }
        : role === "guardian"
          ? {
              guardianId: actor.id,
              expiresAt: { gt: new Date() },
              status: { in: ["PENDING_GUARDIAN", "PENDING_REVIEW", "READY"] },
            }
          : { status: "PENDING_REVIEW", expiresAt: { gt: new Date() } }),
    };
    let position: { createdAt: Date; id: string } | null = null;
    if (b.cursor) {
      position = await this.db.achievementCard.findFirst({
        where: {
          id: b.cursor,
          user: { region: this.infra.config.REGION, deletedAt: null },
          ...(role === "owner"
            ? { userId: actor.id }
            : role === "guardian"
              ? { guardianId: actor.id }
              : {}),
        },
        select: { createdAt: true, id: true },
      });
      if (!position)
        throw new ConflictException("Card history changed; refresh");
    }
    const rows = await this.db.achievementCard.findMany({
      where: {
        ...where,
        ...(position
          ? {
              OR: [
                { createdAt: { lt: position.createdAt } },
                { createdAt: position.createdAt, id: { lt: position.id } },
              ],
            }
          : {}),
      },
      include: { user: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
    });
    const items: any[] = [];
    for (const row of rows.slice(0, 30)) {
      if (role === "guardian") {
        try {
          await this.owned(this.db, r, row.id, role);
        } catch (e) {
          if (e instanceof NotFoundException || e instanceof ForbiddenException)
            continue;
          throw e;
        }
      }
      items.push({
        ...this.view(row),
        ...(role === "staff"
          ? {
              independentReviewer:
                actor.id !== row.userId && actor.id !== row.guardianId,
            }
          : {}),
        ...(role !== "owner"
          ? { subject: { id: row.userId, displayName: row.user.displayName } }
          : {}),
      });
    }
    return { items, nextCursor: rows.length > 30 ? rows[29].id : null };
  }
  async detail(r: Authed, id: string) {
    const { row, user } = await this.owned(this.db, r, id, "staff");
    return {
      ...this.view(row),
      subject: { id: user.id, displayName: user.displayName },
    };
  }
  async prepare(r: Authed, body: unknown) {
    const b = PrepareAchievementCard.parse(body);
    if (!(await this.infra.limit(`card-prepare:${r.user.id}`, 10, 86400)))
      throw new HttpException("Too many card preparations", 429);
    const user = await this.actor(this.db, r, "owner"),
      context = await this.eligible(this.db, user);
    if (
      !(await this.profiles.achievements(this.db, user)).some(
        (a) => a.id === b.achievementId,
      )
    )
      throw new BadRequestException(
        "Only currently earned milestones can be shared",
      );
    if (
      b.includeName &&
      (context.policy.age < 18 ||
        user.profileStatus === "REMOVED" ||
        /[\p{Cc}\p{Cf}]/u.test(user.displayName) ||
        user.displayName.length > 40)
    )
      throw new BadRequestException(
        "Use an anonymous card for this account or label",
      );
    if (
      user.region === "CN" &&
      ["virtual-solve", "reviewed-physical"].includes(b.achievementId) &&
      this.infra.config.CN_GAMES_APPROVED !== "true"
    )
      throw new ForbiddenException("Current game-service approval is required");
    const namedLabel = b.includeName ? user.displayName : null;
    const rendered = await this.renderer(b.achievementId, b.locale, namedLabel);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
      const current = await this.actor(tx, r, "owner"),
        fresh = await this.eligible(tx, current);
      if (b.includeName && current.profileStatus === "REMOVED")
        throw new ConflictException(
          "Identity sharing changed; use an anonymous card",
        );
      if (
        current.profileRevision !== user.profileRevision ||
        current.displayName !== user.displayName ||
        isYoungChild(fresh.policy) !== isYoungChild(context.policy)
      )
        throw new ConflictException("Account changed; prepare the card again");
      if (
        !(await this.profiles.achievements(tx, current)).some(
          (a) => a.id === b.achievementId,
        )
      )
        throw new ConflictException("Milestone changed; refresh");
      if (
        (await tx.achievementCard.count({
          where: {
            userId: user.id,
            expiresAt: { gt: new Date() },
            status: { in: ["PENDING_GUARDIAN", "PENDING_REVIEW", "READY"] },
          },
        })) >= 10
      )
        throw new BadRequestException("Keep at most ten active card requests");
      const row = await tx.achievementCard.create({
        data: {
          userId: user.id,
          guardianId: fresh.consent?.guardianId ?? null,
          achievementId: b.achievementId,
          locale: b.locale,
          namedLabel,
          namedRevision: namedLabel ? current.profileRevision : null,
          templateVersion: CARD_TEMPLATE_VERSION,
          imageDigest: rendered.imageDigest,
          status: isYoungChild(fresh.policy)
            ? "PENDING_GUARDIAN"
            : fresh.policy.age < 18 || namedLabel
              ? "PENDING_REVIEW"
              : "READY",
          expiresAt: new Date(Date.now() + Window),
        },
      });
      if (row.guardianId)
        await notifyUser(
          tx,
          current.region,
          row.guardianId,
          "REVIEW",
          "Achievement card review / 成就卡片审核",
          "A linked child's anonymous card awaits your review. / 关联儿童的匿名卡片等待你审核。",
        );
      return this.view(row);
    });
  }
  async image(
    r: Authed,
    id: string,
    role: Role,
    exportBody?: unknown,
  ): Promise<CardImage> {
    const approval =
      exportBody === undefined ? null : CardExport.parse(exportBody);
    if (!(await this.infra.limit(`card-image:${r.user.id}`, 20, 60)))
      throw new HttpException("Too many card images", 429);
    const initial = await this.owned(this.db, r, id, role);
    if (
      (role === "staff" &&
        !["PENDING_REVIEW", "READY"].includes(initial.row.status)) ||
      (role === "guardian" &&
        !["PENDING_GUARDIAN", "PENDING_REVIEW", "READY"].includes(
          initial.row.status,
        ))
    )
      throw new ConflictException(
        "This card is no longer available for review",
      );
    if (role !== "staff")
      await this.eligible(this.db, initial.user, initial.row);
    if (
      initial.row.templateVersion !== CARD_TEMPLATE_VERSION ||
      initial.row.expiresAt <= new Date()
    )
      throw new ConflictException("Prepare a new card");
    if (
      approval &&
      (role !== "owner" ||
        initial.row.status !== "READY" ||
        approval.revision !== initial.row.revision ||
        approval.imageDigest !== initial.row.imageDigest)
    )
      throw new ConflictException(
        "The exact image must be approved and current before export",
      );
    const rendered = await this.renderer(
      initial.row.achievementId,
      initial.row.locale,
      initial.row.namedLabel,
      role === "owner" && !approval,
    );
    if (rendered.cleanDigest !== initial.row.imageDigest)
      throw new ConflictException(
        "Image rendering changed; prepare a new card for review",
      );
    const fresh = await this.owned(this.db, r, id, role);
    if (role !== "staff") await this.eligible(this.db, fresh.user, fresh.row);
    if (
      fresh.row.revision !== initial.row.revision ||
      fresh.row.expiresAt <= new Date() ||
      (approval && fresh.row.status !== "READY")
    )
      throw new ConflictException("Card changed; refresh before continuing");
    return {
      cardId: fresh.row.id,
      imageDigest: rendered.imageDigest,
      base64: rendered.image.toString("base64"),
      mime: "image/png",
      width: 1200,
      height: 1500,
      filename: "cubers-milestone.png",
      approvalDigest: fresh.row.imageDigest,
      watermarked: role === "owner" && !approval,
    };
  }
  async review(
    r: Authed,
    id: string,
    role: "guardian" | "staff",
    body: unknown,
  ) {
    const b = CardApproval.parse(body);
    if (!(await this.infra.limit(`card-review:${r.user.id}`, 30, 60)))
      throw new HttpException("Too many card reviews", 429);
    return this.db.$transaction(async (tx) => {
      const { row, user, actor } = await this.owned(tx, r, id, role);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
      if (
        row.revision !== b.revision ||
        row.imageDigest !== b.imageDigest ||
        row.templateVersion !== CARD_TEMPLATE_VERSION ||
        row.expiresAt <= new Date() ||
        !(
          b.approve
            ? [role === "guardian" ? "PENDING_GUARDIAN" : "PENDING_REVIEW"]
            : role === "guardian"
              ? ["PENDING_GUARDIAN", "PENDING_REVIEW", "READY"]
              : ["PENDING_REVIEW", "READY"]
        ).includes(row.status)
      )
        throw new ConflictException(
          "Card changed or is no longer awaiting this review",
        );
      if (
        role === "staff" &&
        (actor.id === row.userId || actor.id === row.guardianId)
      )
        throw new ForbiddenException("An independent reviewer is required");
      if (b.approve)
        await this.eligible(
          tx,
          await tx.user.findUniqueOrThrow({ where: { id: user.id } }),
          row,
        );
      const changed = await tx.achievementCard.updateMany({
        where: { id: row.id, revision: row.revision, status: row.status },
        data: {
          status: !b.approve
            ? "REJECTED"
            : role === "guardian"
              ? "PENDING_REVIEW"
              : "READY",
          revision: { increment: 1 },
          reason: b.approve ? null : b.reason,
          ...(role === "staff" ? { reviewerId: actor.id } : {}),
        },
      });
      if (!changed.count) throw new ConflictException("Card changed; refresh");
      await tx.audit.create({
        data: {
          actorId: actor.id,
          action: role === "staff" ? "card.review" : "card.guardian-review",
          targetId: row.id,
          detail: {
            approved: b.approve,
            revision: row.revision,
            imageDigest: row.imageDigest,
            templateVersion: row.templateVersion,
          },
        },
      });
      await notifyUser(
        tx,
        user.region,
        user.id,
        "REVIEW",
        "Achievement card status / 成就卡片状态",
        "Your card review status changed. / 你的卡片审核状态已更新。",
      );
      return this.view(
        await tx.achievementCard.findUniqueOrThrow({ where: { id: row.id } }),
      );
    });
  }
  async cancel(r: Authed, id: string, body: unknown) {
    if (!(await this.infra.limit(`card-cancel:${r.user.id}`, 30, 60)))
      throw new HttpException("Too many card changes", 429);
    z.object({}).strict().parse(body);
    const { row } = await this.owned(this.db, r, id, "owner");
    await this.db.achievementCard.updateMany({
      where: { id: row.id, userId: r.user.id, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED", revision: { increment: 1 } },
    });
    return { ok: true };
  }
}
