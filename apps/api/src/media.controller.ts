import { Campaigns } from "./campaigns";
import { recordMediaRecovery } from "./media-recovery";
import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  Body,
  Inject,
  BadRequestException,
  ForbiddenException,
  Delete,
  Query,
  HttpException,
} from "@nestjs/common";
import { z } from "zod";
import { permissions, ageOn } from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { accountPolicy, eligibleGuardian, type Authed } from "./security";
import { consentDocumentPreview } from "./consent-document";
import { eligiblePostIds } from "./publication";
import { readableClub, communityAvailable } from "./community-access";
@Controller("v1")
export class MediaController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(Campaigns) private campaigns: Campaigns,
  ) {}
  @Post("media") async create(@Req() r: Authed, @Body() body: unknown) {
    const b = z
      .object({
        type: z.enum([
          "image/jpeg",
          "image/png",
          "video/mp4",
          "video/quicktime",
          "application/pdf",
        ]),
        size: z
          .number()
          .int()
          .positive()
          .max(250 * 1024 * 1024),
        purpose: z.enum(["post", "evidence", "consent"]),
        attemptId: z.string().uuid().optional(),
        aiDeclared: z.boolean().default(false),
      })
      .strict()
      .parse(body);
    if (b.aiDeclared && b.purpose !== "post")
      throw new BadRequestException(
        "AI declarations are only for post attachments",
      );
    if (b.purpose === "post" && !permissions(r.policy).canPost)
      throw new ForbiddenException("Posting permission required");
    if (b.purpose === "post") {
      communityAvailable(this.infra.config);
      if (!(await this.infra.limit(`post-media:${r.user.id}`, 40, 3600)))
        throw new HttpException("Media upload limit reached", 429);
    }
    if (
      b.purpose === "evidence" &&
      (!permissions(r.policy).canRecord || b.type !== "video/mp4")
    )
      throw new ForbiddenException("Recording permission and MP4 required");
    if (b.purpose === "evidence") {
      const attempt =
        b.attemptId &&
        (await this.db.attempt.findFirst({
          where: {
            id: b.attemptId,
            userId: r.user.id,
            status: "AWAITING_EVIDENCE",
            recordingAt: { not: null },
          },
          include: { room: true },
        }));
      if (!attempt || !attempt.room.ranked || attempt.room.input === "virtual")
        throw new BadRequestException(
          "Evidence must belong to your completed physical attempt",
        );
    } else if (b.attemptId)
      throw new BadRequestException("Only evidence can be bound to an attempt");
    if (
      b.purpose === "consent" &&
      (r.policy.age < 18 ||
        !r.user.adultVerified ||
        b.type !== "application/pdf")
    )
      throw new ForbiddenException("Verified guardian and PDF required");
    if (b.purpose === "consent" && b.size > 10 * 1024 * 1024)
      throw new BadRequestException("Consent PDF exceeds 10 MB");
    if (
      b.purpose === "post" &&
      (b.type === "application/pdf" ||
        b.size > (b.type.startsWith("image") ? 10 : 50) * 1024 * 1024)
    )
      throw new BadRequestException("Post media exceeds limits");
    const id = crypto.randomUUID(),
      key = `${this.infra.config.REGION}/${r.user.id}/${id}/upload`;
    if (!(await this.infra.limit(`media-create:${r.user.id}`, 60, 3600)))
      throw new HttpException("Media upload limit reached", 429);
    const media = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${r.user.id}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: r.user.id },
      });
      const access = permissions(await accountPolicy(tx, user));
      if (
        user.deletedAt ||
        (b.purpose === "post" && !access.canPost) ||
        (b.purpose === "evidence" && !access.canRecord)
      )
        throw new ForbiddenException();
      if (
        (await tx.media.count({
          where: { userId: user.id, status: { in: ["PENDING", "PROCESSING"] } },
        })) >= 12
      )
        throw new HttpException("Finish or remove pending uploads first", 429);
      if (
        b.attemptId &&
        (await tx.media.count({
          where: {
            attemptId: b.attemptId,
            status: { in: ["PENDING", "PROCESSING", "READY"] },
          },
        }))
      )
        throw new BadRequestException(
          "An evidence upload already exists for this attempt",
        );
      // Reserve declared bytes even for abandoned/deleted files. Deleting a
      // reservation must not reset the abuse budget. Content-Length is signed.
      const reserved = await this.infra.redis.eval(
        `
        local used = tonumber(redis.call('GET', KEYS[1]) or '0')
        if used + tonumber(ARGV[1]) > tonumber(ARGV[2]) then return 0 end
        redis.call('INCRBY', KEYS[1], ARGV[1])
        if used == 0 then redis.call('EXPIRE', KEYS[1], 86400) end
        return 1`,
        1,
        `${this.infra.config.REGION}:media-bytes:${user.id}`,
        b.size,
        this.infra.config.MEDIA_DAILY_BYTES,
      );
      if (reserved !== 1)
        throw new HttpException("Daily upload size limit reached", 429);
      return tx.media.create({ data: { id, userId: user.id, key, ...b } });
    });
    return {
      id: media.id,
      uploadUrl: await this.infra.uploadUrl(key, b.type, b.size),
      expiresIn: 300,
    };
  }
  @Post("media/:id/complete") async complete(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    const m = await this.db.media.findFirst({
      where: { id, userId: r.user.id, status: "PENDING" },
    });
    if (!m) throw new BadRequestException("Pending upload not found");
    const head = await this.infra.head(m.key);
    if (head.ContentLength !== m.size || head.ContentType !== m.type)
      throw new BadRequestException(
        "Uploaded file does not match its declaration",
      );
    const result = await this.db.media.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    if (!result.count) throw new BadRequestException("Upload state changed");
    return { status: "PROCESSING" };
  }
  @Get("media/:id") async get(
    @Req() r: Authed,
    @Param("id") id: string,
    @Query("postId") postId?: string,
  ) {
    if (postId) z.string().uuid().parse(postId);
    const m = await this.db.media.findUniqueOrThrow({ where: { id } });
    let retentionDeadline: number | undefined;
    if (m.purpose === "evidence") {
      const attempt = m.attemptId
        ? await this.db.attempt.findUnique({ where: { id: m.attemptId } })
        : null;
      const state = await this.db.mediaRecoveryState.findUnique({
        where: { id: m.id },
      });
      const withdrawal = await this.db.consentWithdrawalRecovery.findUnique({
        where: { id: m.userId },
      });
      retentionDeadline = Math.min(
        attempt ? attempt.createdAt.getTime() + 30 * 86400000 : 0,
        attempt?.evidenceDeleteAt?.getTime() ?? Infinity,
        state?.deadline?.getTime() ?? Infinity,
      );
      if (
        !attempt ||
        attempt.userId !== m.userId ||
        state?.erasedAt ||
        (withdrawal && m.createdAt <= withdrawal.cutoff) ||
        retentionDeadline <= Date.now()
      )
        throw new ForbiddenException(
          "Evidence retention expired or permission was withdrawn",
        );
    }
    if (m.userId !== r.user.id) {
      const admin = ["ADMIN", "MODERATOR"].includes(r.user.role);
      const session = admin
        ? await this.db.session.findUnique({ where: { id: r.sessionId } })
        : null;
      const reviewer = admin && !!r.user.mfaSecret && !!session?.mfaVerified;
      const child =
        m.purpose === "post"
          ? await this.db.user.findUnique({
              where: { id: m.userId },
              select: { region: true, birthDate: true },
            })
          : null;
      const guardian =
        !!child &&
        ageOn(child.birthDate) < 18 &&
        eligibleGuardian(r.user, child.region) &&
        m.purpose === "post" &&
        !!(await this.db.consent.findFirst({
          where: {
            childId: m.userId,
            guardianId: r.user.id,
            reviewedAt: { not: null },
            status: { in: ["APPROVED", "REVOKED"] },
          },
        }));
      if (m.purpose !== "post" && !reviewer)
        throw new ForbiddenException("Private reviewer evidence");
      if (m.purpose === "post" && !reviewer && !guardian) {
        communityAvailable(this.infra.config);
        const posts = await this.db.post.findMany({
          where: {
            ...(postId ? { id: postId } : {}),
            authorId: m.userId,
            mediaIds: { has: id },
            status: "PUBLISHED",
          },
          take: 20,
        });
        const eligible = await eligiblePostIds(this.db, posts);
        let accessible = false;
        for (const post of posts) {
          if (
            eligible.has(post.id) &&
            (!post.clubId ||
              (await readableClub(this.db, r.user.id, post.clubId)))
          ) {
            accessible = true;
            break;
          }
        }
        if (!accessible) throw new ForbiddenException();
        if (
          await this.db.social.findFirst({
            where: {
              kind: "block",
              OR: [
                {
                  actorId: r.user.id,
                  targetId: { equals: m.userId, mode: "insensitive" },
                },
                {
                  actorId: m.userId,
                  targetId: { equals: r.user.id, mode: "insensitive" },
                },
              ],
            },
          })
        )
          throw new ForbiddenException();
      }
    }
    return {
      id,
      status: m.status,
      type: m.type,
      durationMs: m.durationMs,
      aiLabel: m.aiLabel,
      aiDeclared: m.aiDeclared,
      ...(m.status === "READY" && m.purpose !== "consent"
        ? { url: await this.infra.downloadUrl(m.key, retentionDeadline) }
        : {}),
    };
  }
  @Get("media/:id/document-review") documentReview(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    z.string().uuid().parse(id);
    return consentDocumentPreview(this.db, this.infra, r, id);
  }
  @Delete("media/:id") async remove(@Req() r: Authed, @Param("id") id: string) {
    z.string().uuid().parse(id);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${r.user.id}::uuid FOR UPDATE`;
      const media = await tx.media.findFirst({
        where: { id, userId: r.user.id, purpose: "post" },
      });
      if (!media) throw new ForbiddenException();
      if (await tx.post.findFirst({ where: { mediaIds: { has: id } } }))
        throw new BadRequestException(
          "Remove the attachment from its posts before deleting it",
        );
      await recordMediaRecovery(tx, this.infra.config, media.userId, {
        kind: "MEDIA_ERASE",
        mediaId: media.id,
        key: media.key,
      });
      await tx.media.update({ where: { id }, data: { status: "DELETING" } });
    });
    return { ok: true };
  }
  @Get("sponsors") sponsors(@Req() r: Authed) {
    return this.campaigns.cards(r);
  }
  @Post("sponsors/:id/open") openSponsor(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.campaigns.open(r, id, body);
  }
}
