import { Campaigns } from "./campaigns";
import { Competitions } from "./competitions";
import { recordMediaRecovery } from "./media-recovery";
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Inject,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { z } from "zod";
import { requireConsentPreview } from "./consent-document";
import {
  ageOn,
  permissions,
  practiceSetup,
  practiceApply,
  practiceSolved,
  smartDeviceCatalogue,
  type Lesson,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { accountPolicy, type Authed } from "./security";
import { AiTutor, validateAiUrl } from "./ai";
import { eligiblePostIds } from "./publication";
import { notifyUser } from "./notifications";
import { communityWrite } from "./community-authority";
@Controller("v1/admin")
export class AdminController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(Competitions) private competitions: Competitions,
    @Inject(Campaigns) private campaignsService: Campaigns,
  ) {}
  private audit(r: Authed, action: string, targetId: string, detail: object) {
    return this.db.audit.create({
      data: { actorId: r.user.id, action, targetId, detail },
    });
  }
  private admin(r: Authed) {
    if (r.user.role !== "ADMIN")
      throw new ForbiddenException("Administrator role required");
  }
  @Get("overview") async overview() {
    return {
      region: this.infra.config.REGION,
      pendingPosts: await this.db.post.count({ where: { status: "PENDING" } }),
      pendingConsent: await this.db.consent.count({
        where: { status: "PENDING" },
      }),
      provisionalAttempts: await this.db.attempt.count({
        where: { status: "PROVISIONAL" },
      }),
      openReports: await this.db.report.count({ where: { status: "OPEN" } }),
      users: await this.db.user.count({ where: { deletedAt: null } }),
    };
  }
  @Get("queue") async queue() {
    return {
      posts: await this.db.post.findMany({
        where: { status: "PENDING" },
        include: { author: { select: { displayName: true, id: true } } },
        take: 100,
      }),
      consents: await this.db.consent.findMany({
        where: { status: "PENDING" },
        take: 100,
      }),
      attempts: await this.db.attempt.findMany({
        where: {
          OR: [
            { status: "PROVISIONAL" },
            { status: "REJECTED", appealed: true },
          ],
        },
        include: { room: true },
        take: 100,
      }),
      reports: await this.db.report.findMany({
        where: { status: "OPEN" },
        take: 100,
      }),
      comments: await this.db.comment.findMany({
        where: { status: "PENDING" },
        take: 100,
      }),
      clubs: await this.db.club.findMany({
        where: { status: "PENDING" },
        take: 100,
      }),
    };
  }
  @Post("posts/:id/review") async post(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
      .object({
        approve: z.boolean(),
        revision: z.number().int(),
        reason: z.string().min(3).max(1000),
      })
      .strict()
      .parse(body);
    const p = await this.db.post.findUniqueOrThrow({
      where: { id },
      include: { author: true },
    });
    await communityWrite(
      this.db,
      this.infra.config,
      r,
      "staff",
      [p.authorId],
      async (tx) => {
        const currentPost = await tx.post.findUniqueOrThrow({ where: { id } });
        if (currentPost.authorId !== p.authorId)
          throw new BadRequestException("Post changed; reopen the review");
        if (b.approve && currentPost.clubId) {
          await tx.$queryRaw`SELECT id FROM "Club" WHERE id = ${currentPost.clubId}::uuid FOR UPDATE`;
          const club = await tx.club.findUnique({
            where: { id: currentPost.clubId },
          });
          const member = await tx.membership.findFirst({
            where: {
              clubId: currentPost.clubId,
              userId: currentPost.authorId,
              status: "APPROVED",
            },
          });
          if (
            !club ||
            club.status !== "APPROVED" ||
            !member ||
            (currentPost.kind === "ANNOUNCEMENT" &&
              club.ownerId !== currentPost.authorId)
          )
            throw new ForbiddenException(
              "Current club publication eligibility is required",
            );
        }
        const currentAuthor = await tx.user.findUniqueOrThrow({
          where: { id: p.authorId },
        });
        const policy = await accountPolicy(tx, currentAuthor);
        const consent = await tx.consent.findUnique({
          where: { childId: currentAuthor.id },
        });
        if (
          b.approve &&
          permissions(policy).needsPostApproval &&
          consent?.guardianId === r.user.id
        )
          throw new ForbiddenException(
            "A separate moderator must review the child's post",
          );
        if (
          b.approve &&
          (currentAuthor.deletedAt ||
            !currentAuthor.emailVerified ||
            currentAuthor.region !== this.infra.config.REGION ||
            (currentPost.kind === "ANNOUNCEMENT" &&
              (!currentAuthor.adultVerified ||
                ageOn(currentAuthor.birthDate) < 18)) ||
            !permissions(policy).canPost ||
            (permissions(policy).needsPostApproval &&
              !currentPost.guardianApproved))
        )
          throw new ForbiddenException(
            "Current guardian consent, identity eligibility, and post approval are required",
          );
        const result = await tx.post.updateMany({
          where: { id, revision: b.revision, status: "PENDING" },
          data: {
            status: b.approve ? "PUBLISHED" : "REJECTED",
            moderatorApproved: b.approve,
            reason: b.reason,
          },
        });
        if (!result.count)
          throw new BadRequestException(
            "Post changed; review the current revision",
          );
        await tx.audit.create({
          data: {
            actorId: r.user.id,
            action: "post.review",
            targetId: id,
            detail: b,
          },
        });
        await tx.notification.create({
          data: {
            userId: p.authorId,
            category: "REVIEW",
            title: "Post review updated · 帖子审核有更新",
            body: "Open Profile to check your post status. 请在个人页查看帖子状态。",
          },
        });
      },
    );
    return { ok: true };
  }
  @Post("consents/:id/review") async consent(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
      .object({
        approve: z.boolean(),
        reason: z.string().min(10).max(1000),
        signedDocumentChecked: z.boolean().default(false),
        guardianIdentityChecked: z.boolean().default(false),
        relationshipChecked: z.boolean().default(false),
        documentReviewId: z.string().uuid().optional(),
      })
      .strict()
      .parse(body);
    if (
      b.approve &&
      (!b.signedDocumentChecked ||
        !b.guardianIdentityChecked ||
        !b.relationshipChecked)
    )
      throw new BadRequestException(
        "Complete all independent guardian checks before approval",
      );
    const c = await this.db.consent.findUniqueOrThrow({ where: { id } });
    await communityWrite(
      this.db,
      this.infra.config,
      r,
      "staff",
      [c.guardianId, c.childId],
      async (tx) => {
        const current = await tx.consent.findUniqueOrThrow({ where: { id } });
        if ([current.guardianId, current.childId].includes(r.user.id))
          throw new ForbiddenException("Independent consent reviewer required");
        if (
          current.childId !== c.childId ||
          current.guardianId !== c.guardianId
        )
          throw new BadRequestException("Consent changed; reopen the review");
        if (current.status !== "PENDING")
          throw new BadRequestException(
            "Consent request has changed; withdrawn consent cannot be reapproved",
          );
        if (b.approve)
          await requireConsentPreview(
            tx,
            r,
            current.documentId,
            b.documentReviewId,
            this.infra.config.REGION,
          );
        if (
          b.approve &&
          (
            await tx.media.findUnique({
              where: { id: current.documentId },
              select: { userId: true },
            })
          )?.userId !== current.guardianId
        )
          throw new ForbiddenException(
            "Consent document must belong to its current guardian",
          );
        const guardian = await tx.user.findUniqueOrThrow({
          where: { id: current.guardianId },
        });
        const child = await tx.user.findUnique({
          where: { id: current.childId },
        });
        if (
          !child ||
          child.deletedAt ||
          child.region !== this.infra.config.REGION ||
          ageOn(child.birthDate) >= 18
        )
          throw new ForbiddenException("Current linked child is required");
        if (
          !guardian.adultVerified ||
          ageOn(guardian.birthDate) < 18 ||
          guardian.deletedAt ||
          !guardian.emailVerified ||
          guardian.region !== this.infra.config.REGION
        )
          throw new ForbiddenException("Verified adult guardian required");
        await tx.consent.update({
          where: { id },
          data: {
            status: b.approve ? "APPROVED" : "REJECTED",
            reason: b.reason,
            reviewerId: r.user.id,
            reviewedAt: new Date(),
          },
        });
        await tx.audit.create({
          data: {
            actorId: r.user.id,
            action: "consent.review",
            targetId: id,
            detail: b,
          },
        });
        for (const recipient of [current.guardianId, current.childId])
          await notifyUser(
            tx,
            this.infra.config.REGION,
            recipient,
            "REVIEW",
            "Guardian consent review updated · 监护授权审核有更新",
            "Open Family & safety to check the current status. · 请在家庭与安全中查看当前状态。",
          );
      },
    );
    return { ok: true };
  }
  @Post("attempts/:id/review") async attempt(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
      .object({
        approve: z.boolean(),
        reason: z.string().min(10).max(1000),
        evidenceChecked: z.literal(true),
        uninterrupted: z.boolean(),
        scrambleMatches: z.boolean(),
        cubeAndHandsVisible: z.boolean(),
        finalStateSolved: z.boolean(),
      })
      .strict()
      .parse(body);
    if (
      b.approve &&
      (!b.uninterrupted ||
        !b.scrambleMatches ||
        !b.cubeAndHandsVisible ||
        !b.finalStateSolved)
    )
      throw new BadRequestException("All evidence checks must pass");
    const owner = await this.db.attempt.findUniqueOrThrow({
      where: { id },
      select: { userId: true },
    });
    if (owner.userId === r.user.id)
      throw new ForbiddenException(
        "Reviewers cannot approve their own attempts",
      );
    await communityWrite(
      this.db,
      this.infra.config,
      r,
      "staff",
      [owner.userId],
      async (tx, current) => {
        await this.competitions.evidenceReviewer(tx, r, owner.userId);
        await this.competitions.lockEvidenceCompetition(tx, id);
        await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id = ${id}::uuid FOR UPDATE`;
        const a = await tx.attempt.findUniqueOrThrow({
          where: { id },
          include: { user: true },
        });
        if (a.userId !== owner.userId)
          throw new BadRequestException(
            "Attempt owner changed; reopen the review",
          );
        if (
          !["PROVISIONAL", "REJECTED", "APPROVED"].includes(a.status) ||
          !a.evidenceId
        )
          throw new BadRequestException("Reviewable evidence required");
        if (Date.now() - a.createdAt.getTime() > 30 * 86400000)
          throw new BadRequestException("Unresolved attempt expired");
        if (
          b.approve &&
          (a.user.deletedAt ||
            !a.user.emailVerified ||
            !permissions(await accountPolicy(tx, a.user)).canRecord)
        )
          throw new ForbiddenException("Current recording consent is required");
        if (a.evidenceDeleteAt && a.evidenceDeleteAt <= new Date())
          throw new BadRequestException("Evidence retention expired");
        await tx.$queryRaw`SELECT id FROM "Media" WHERE id = ${a.evidenceId}::uuid FOR SHARE`;
        if (
          !(await tx.media.findFirst({
            where: {
              id: a.evidenceId,
              userId: a.userId,
              attemptId: a.id,
              purpose: "evidence",
              status: "READY",
            },
          }))
        )
          throw new BadRequestException(
            "Current reviewable evidence is required",
          );
        if (b.approve) {
          await tx.$queryRaw`SELECT id FROM "Media" WHERE id = ${a.evidenceId}::uuid FOR SHARE`;
          if (
            a.user.deletedAt ||
            !a.user.emailVerified ||
            !permissions(await accountPolicy(tx, a.user)).canRecord ||
            !(await tx.media.findFirst({
              where: { id: a.evidenceId, attemptId: a.id, status: "READY" },
            }))
          )
            throw new ForbiddenException(
              "Current recording consent and ready evidence are required",
            );
        }
        const deadline = new Date(
          Math.min(
            Date.now() + 7 * 86400000,
            a.createdAt.getTime() + 30 * 86400000,
            a.evidenceDeleteAt?.getTime() ?? Infinity,
          ),
        );
        await recordMediaRecovery(
          tx,
          this.infra.config,
          a.userId,
          {
            kind: "EVIDENCE_DEADLINE",
            mediaId: a.evidenceId,
            attemptId: a.id,
            attemptCreatedAt: a.createdAt.toISOString(),
            deadline: deadline.toISOString(),
          },
          current.session.expiresAt,
        );
        await tx.attempt.update({
          where: { id },
          data: {
            status: b.approve ? "APPROVED" : "REJECTED",
            reviewerId: r.user.id,
            reason: b.reason,
            finalizedAt: new Date(),
            evidenceDeleteAt: deadline,
            version: { increment: 1 },
          },
        });
        await tx.audit.create({
          data: {
            actorId: r.user.id,
            action: "attempt.review",
            targetId: id,
            detail: b,
          },
        });
        await this.competitions.correctedResult(
          tx,
          id,
          a.status,
          b.approve ? "APPROVED" : "REJECTED",
        );
        await notifyUser(
          tx,
          this.infra.config.REGION,
          a.userId,
          "REVIEW",
          "Attempt review updated · 实物成绩审核有更新",
          "Open your private solve history to check the current status. · 请在私密还原记录中查看当前状态。",
        );
      },
    );
    return { ok: true };
  }
  @Post("review/:kind/:id") async review(
    @Req() r: Authed,
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
      .object({
        approve: z.boolean(),
        reason: z.string().min(5).max(1000),
        revision: z.number().int().positive().optional(),
      })
      .strict()
      .parse(body);
    z.string().uuid().parse(id);
    const roots: string[] = [];
    if (kind === "club")
      roots.push(
        (await this.db.club.findUniqueOrThrow({ where: { id } })).ownerId,
      );
    else if (kind === "comment") {
      const original = await this.db.comment.findUniqueOrThrow({
        where: { id },
        include: { post: true },
      });
      roots.push(original.authorId, original.post.authorId);
    } else if (kind !== "report")
      throw new BadRequestException("Unknown review type");
    await communityWrite(
      this.db,
      this.infra.config,
      r,
      "staff",
      roots,
      async (tx, current, locked) => {
        if (kind === "club") {
          const original = await tx.club.findUniqueOrThrow({ where: { id } });
          if (!locked.has(original.ownerId))
            throw new BadRequestException(
              "Club owner changed; reopen the review",
            );
          await tx.$queryRaw`SELECT id FROM "Club" WHERE id = ${id}::uuid FOR UPDATE`;
          const club = await tx.club.findUniqueOrThrow({ where: { id } });
          if (
            !b.revision ||
            b.revision !== club.revision ||
            !["PENDING", ...(b.approve ? [] : ["APPROVED"])].includes(
              club.status,
            )
          )
            throw new BadRequestException(
              "Club changed; review its current revision",
            );
          const owner = await tx.user.findUniqueOrThrow({
            where: { id: club.ownerId },
          });
          if (
            b.approve &&
            (owner.deletedAt ||
              !owner.emailVerified ||
              owner.region !== this.infra.config.REGION ||
              !owner.adultVerified ||
              ageOn(owner.birthDate) < 18 ||
              !permissions(await accountPolicy(tx, owner)).canPost)
          )
            throw new ForbiddenException(
              "Current verified adult owner eligibility is required",
            );
          await tx.club.update({
            where: { id },
            data: {
              status: b.approve ? "APPROVED" : "REJECTED",
              reason: b.reason,
            },
          });
          if (b.approve)
            await tx.membership.upsert({
              where: { clubId_userId: { clubId: id, userId: club.ownerId } },
              create: { clubId: id, userId: club.ownerId, status: "APPROVED" },
              update: { status: "APPROVED" },
            });
          await tx.notification.create({
            data: {
              userId: club.ownerId,
              category: "REVIEW",
              title: "Club review updated · 社团审核有更新",
              body: "Open your clubs to check its status. 请在我的社团中查看状态。",
            },
          });
        } else if (kind === "comment") {
          const comment = await tx.comment.findUniqueOrThrow({
            where: { id },
            include: { author: true, post: true },
          });
          if (
            !locked.has(comment.authorId) ||
            !locked.has(comment.post.authorId)
          )
            throw new BadRequestException(
              "Discussion changed; reopen the review",
            );
          const user = await tx.user.findUniqueOrThrow({
              where: { id: comment.authorId },
            }),
            policy = permissions(await accountPolicy(tx, user));
          if (
            b.approve &&
            (comment.status !== "PENDING" ||
              user.deletedAt ||
              !user.emailVerified ||
              user.region !== this.infra.config.REGION ||
              !policy.canPost ||
              policy.needsPostApproval ||
              !(await eligiblePostIds(tx, [comment.post])).has(
                comment.postId,
              ) ||
              (comment.parentId &&
                !(await tx.comment.findFirst({
                  where: {
                    id: comment.parentId,
                    postId: comment.postId,
                    status: "PUBLISHED",
                  },
                }))))
          )
            throw new ForbiddenException(
              "Current comment and conversation eligibility is required",
            );
          await tx.comment.update({
            where: { id },
            data: { status: b.approve ? "PUBLISHED" : "REJECTED" },
          });
          await tx.notification.create({
            data: {
              userId: comment.authorId,
              category: "REVIEW",
              title: "Reply review updated · 回复审核有更新",
              body: "Open the conversation to check your reply. 请在讨论中查看回复。",
            },
          });
        } else if (kind === "report") {
          await tx.report.update({
            where: { id },
            data: { status: "RESOLVED" },
          });
        } else throw new BadRequestException("Unknown review type");
        await tx.audit.create({
          data: {
            actorId: r.user.id,
            action: `${kind}.review`,
            targetId: id,
            detail: b,
          },
        });
      },
    );
    return { ok: true };
  }
  @Get("users") async users() {
    return this.db.user.findMany({
      select: {
        id: true,
        displayName: true,
        role: true,
        region: true,
        emailVerified: true,
        identityVerified: true,
        adultVerified: true,
        deletedAt: true,
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
  }
  @Post("users/:id/eligibility") async eligibility(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.admin(r);
    const b = z
      .object({
        identityVerified: z.boolean(),
        adultVerified: z.boolean(),
        reason: z.string().min(10).max(1000),
        proofReviewed: z.literal(true),
      })
      .strict()
      .parse(body);
    id = z.string().uuid().parse(id).toLowerCase();
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "admin",
      [id],
      async (tx, current) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id } });
        if (user.region !== this.infra.config.REGION || user.deletedAt)
          throw new ForbiddenException("Current regional account required");
        if (b.adultVerified && ageOn(user.birthDate) < 18)
          throw new BadRequestException("Minor cannot be marked adult");
        if (id === current.user.id)
          throw new ForbiddenException("Independent reviewer required");
        await tx.user.update({
          where: { id },
          data: {
            identityVerified: b.identityVerified,
            adultVerified: b.adultVerified,
          },
        });
        await tx.audit.create({
          data: {
            actorId: current.user.id,
            action: "user.eligibility",
            targetId: id,
            detail: b,
          },
        });
        return { ok: true };
      },
    );
  }
  @Get("courses") async courses() {
    return this.db.course.findMany({ orderBy: { id: "asc" } });
  }
  @Get("settings") async settings(@Req() r: Authed) {
    this.admin(r);
    const c = this.infra.config;
    return {
      ai: await this.db.setting.findUnique({ where: { key: "ai" } }),
      mode: c.AI_MODE,
      baseUrl: c.AI_BASE_URL,
      model: c.AI_MODEL,
      moderationModel: c.REGION === "INTL" ? c.AI_MODERATION_MODEL : null,
      guardrailReviewApproved:
        c.REGION === "CN" ? c.AI_CN_GUARDRAILS_APPROVED === "true" : null,
      keyConfigured: !!(
        c.AI_API_KEY || (c.REGION === "CN" ? c.QWEN_API_KEY : c.OPENAI_API_KEY)
      ),
      allowedHosts:
        c.REGION === "CN" ? c.AI_CN_APPROVED_HOSTS : c.AI_ALLOWED_HOSTS,
      devices: { value: smartDeviceCatalogue() },
      sponsors: await this.db.setting.findUnique({
        where: { key: "sponsors-enabled" },
      }),
    };
  }
  @Post("settings/ai") async ai(@Req() r: Authed, @Body() body: unknown) {
    this.admin(r);
    const b = z
      .object({
        baseUrl: z.string().url(),
        model: z.string().min(1).max(100),
        enabled: z.boolean(),
      })
      .strict()
      .parse(body);
    await communityWrite(
      this.db,
      this.infra.config,
      r,
      "admin",
      [],
      async () => {},
    );
    await validateAiUrl(b.baseUrl, this.infra.config);
    if (b.enabled) {
      try {
        await new AiTutor(this.infra.config).validateModel(b, true);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : "AI connection validation failed",
        );
      }
    }
    const value = {
      ...b,
      validatedAt: b.enabled ? new Date().toISOString() : null,
    };
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "admin",
      [],
      async (tx, current) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cubers-ai-settings'))`;
        await tx.$queryRaw`SELECT key FROM "Setting" WHERE key='ai' FOR UPDATE`;
        await tx.setting.upsert({
          where: { key: "ai" },
          create: { key: "ai", value },
          update: { value },
        });
        await tx.audit.create({
          data: {
            actorId: current.user.id,
            action: "settings.ai",
            targetId: "ai",
            detail: b,
          },
        });
        return { ok: true };
      },
    );
  }
  @Get("audit") async auditLog() {
    return this.db.audit.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
    });
  }
  @Post("settings/sponsors") async sponsors(
    @Req() r: Authed,
    @Body() body: unknown,
  ) {
    return this.campaignsService.switch(r, body);
  }
}
