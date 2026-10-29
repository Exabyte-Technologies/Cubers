import { appAttestationKeySummary } from "./app-attestation";
import { requestAccountDeletion } from "./recovery";
import { recordMediaRecovery } from "./media-recovery";
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  Inject,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  Param,
} from "@nestjs/common";
import { z } from "zod";
import {
  Register,
  Login,
  ageOn,
  isYoungChild,
  permissions,
} from "@cubers/core";
import { checkedMfaStep } from "./staff-access";
import { Db, Infrastructure } from "./services";
import { Public, eligibleGuardian, type Authed } from "./security";
import type { User, Prisma } from "@prisma/client";
import { Connections, connectionPreferences } from "./connections";
import { Profiles, profilePreferences } from "./profiles";
import { CommunityRegion } from "./community-region";
import { notificationScope, notificationPreferences } from "./notifications";
import {
  hash,
  opaque,
  passwordHash,
  passwordMatches,
  DUMMY_PASSWORD_HASH,
} from "./crypto";
const account = (u: {
  id: string;
  displayName: string;
  region: string;
  bio: string;
  privateProfile: boolean;
  role: string;
}) => ({
  id: u.id,
  displayName: u.displayName,
  region: u.region,
  bio: u.bio,
  privateProfile: u.privateProfile,
  role: u.role,
});
@Controller("v1")
export class AuthController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(Connections) private connections: Connections,
    @Inject(Profiles) private profiles: Profiles,
    @Inject(CommunityRegion) private communityRegion: CommunityRegion,
  ) {}
  private async issue(
    userId: string,
    mfaVerified = false,
    scope: "FULL" | "DELETION" = "FULL",
    store: Pick<Prisma.TransactionClient, "session"> = this.db,
  ) {
    const token = opaque();
    await store.session.create({
      data: {
        userId,
        tokenHash: hash(token),
        mfaVerified,
        scope,
        expiresAt: new Date(
          Date.now() + (scope === "DELETION" ? 10 * 60000 : 7 * 86400000),
        ),
      },
    });
    return token;
  }
  @Public() @Post("auth/register") async register(
    @Req() r: Authed,
    @Body() body: unknown,
  ) {
    await this.communityRegion.requireMatchingConnection(r.ip);
    const b = Register.parse(body);
    if (b.region !== this.infra.config.REGION)
      throw new BadRequestException("Select the matching regional server");
    let age: number;
    try {
      age = ageOn(b.birthDate);
    } catch {
      throw new BadRequestException("Invalid birth date");
    }
    if (isYoungChild({ age, region: b.region }))
      throw new ForbiddenException(
        "A verified guardian must create and manage this child account",
      );
    const email = b.email.toLowerCase();
    if (!(await this.infra.limit(`register:${hash(email)}`, 4, 3600)))
      throw new HttpException("Try again later", 429);
    const existing = await this.db.user.findUnique({ where: { email } });
    if (!existing) {
      const user = await this.db.user.create({
        data: {
          email,
          passwordHash: await passwordHash(b.password),
          displayName: b.displayName,
          birthDate: b.birthDate,
          region: b.region,
          privateProfile: age < 18,
        },
      });
      await this.sendToken(user.id, email, "VERIFY");
    }
    return {
      message:
        "Check your email for a verification link, or use password recovery if you already registered.",
    };
  }
  private async sendToken(userId: string, email: string, purpose: string) {
    const token = opaque();
    await this.db.authToken.deleteMany({ where: { userId, purpose } });
    await this.db.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
    const path = purpose === "VERIFY" ? "verify" : "reset-password";
    await this.infra.mail(
      email,
      purpose === "VERIFY"
        ? "Verify your Cubers email / 验证 Cubers 邮箱"
        : "Reset your Cubers password / 重置 Cubers 密码",
      `${purpose === "VERIFY" ? "Verify your Cubers email / 验证 Cubers 邮箱" : "Reset your Cubers password / 重置 Cubers 密码"}\n\n${this.infra.config.APP_ORIGIN}/${path}?token=${token}&community=${this.infra.config.REGION}\n\nThis link expires in 30 minutes. If you did not request this, ignore it.\n此链接将在30分钟后失效。如果不是您本人发起的请求，请忽略此邮件。`,
    );
  }
  @Public() @Post("auth/resend") async resend(@Body() body: unknown) {
    const b = z.object({ email: z.string().email() }).strict().parse(body);
    if (
      !(await this.infra.limit(`email:${hash(b.email.toLowerCase())}`, 3, 3600))
    )
      throw new HttpException("Try again later", 429);
    const u = await this.db.user.findUnique({
      where: { email: b.email.toLowerCase() },
    });
    if (u && !u.emailVerified && !u.deletedAt)
      await this.sendToken(u.id, u.email, "VERIFY");
    return { message: "If eligible, a verification link has been sent." };
  }
  @Public() @Post("auth/verify") async verify(@Body() body: unknown) {
    const { token } = z
      .object({ token: z.string().min(20).max(200) })
      .strict()
      .parse(body);
    const t = await this.db.authToken.findUnique({
      where: { tokenHash: hash(token) },
    });
    if (!t || t.purpose !== "VERIFY" || t.expiresAt < new Date())
      throw new BadRequestException("Link expired");
    await this.db.$transaction(async (tx) => {
      const consumed = await tx.authToken.deleteMany({ where: { id: t.id } });
      if (consumed.count !== 1)
        throw new BadRequestException("Link already used");
      await tx.user.update({
        where: { id: t.userId },
        data: { emailVerified: true },
      });
    });
    return { message: "Email verified. You can sign in." };
  }
  @Public() @Post("auth/login") async login(
    @Req() r: Authed,
    @Body() body: unknown,
  ) {
    await this.communityRegion.requireMatchingConnection(r.ip);
    return this.passwordLogin(body, false);
  }
  @Public() @Post("auth/deletion-login") deletionLogin(@Body() body: unknown) {
    // Erasure remains usable while traveling. This short-lived session cannot
    // read core/profile/admin data or join any realtime transport.
    return this.passwordLogin(body, true);
  }
  private async passwordLogin(body: unknown, deletionOnly: boolean) {
    const b = Login.parse(body),
      email = b.email.toLowerCase();
    if (!(await this.infra.limit(`login:${hash(email)}`, 10, 900)))
      throw new HttpException("Try again later", 429);
    const u = await this.db.user.findUnique({ where: { email } });
    const valid = await passwordMatches(
      b.password,
      u?.passwordHash || DUMMY_PASSWORD_HASH,
    );
    if (!u || !valid || u.deletedAt || u.region !== this.infra.config.REGION)
      throw new UnauthorizedException("Invalid email or password");
    if (!u.emailVerified)
      throw new ForbiddenException("Verify your email first");
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: u.id } });
      if (
        current.deletedAt ||
        !current.emailVerified ||
        current.region !== this.infra.config.REGION ||
        current.passwordHash !== u.passwordHash ||
        current.role !== u.role ||
        current.mfaSecret !== u.mfaSecret ||
        current.mfaGeneration !== u.mfaGeneration
      )
        throw new UnauthorizedException("Account changed; sign in again");
      const admin = ["ADMIN", "MODERATOR"].includes(current.role);
      if (admin) {
        let step: number;
        try {
          step = checkedMfaStep(current, b.otp);
        } catch {
          throw new ForbiddenException(
            "A fresh valid administrator MFA code is required; wait for the next code if already used",
          );
        }
        await tx.user.update({
          where: { id: current.id },
          data: { mfaLastStep: step },
        });
      }
      const token = await this.issue(
        current.id,
        admin,
        deletionOnly ? "DELETION" : "FULL",
        tx,
      );
      return deletionOnly
        ? { token, region: this.infra.config.REGION }
        : { token, user: account(current) };
    });
  }

  @Public() @Post("auth/forgot") async forgot(@Body() body: unknown) {
    const b = z.object({ email: z.string().email() }).strict().parse(body);
    if (
      !(await this.infra.limit(`email:${hash(b.email.toLowerCase())}`, 3, 3600))
    )
      throw new HttpException("Try again later", 429);
    const u = await this.db.user.findUnique({
      where: { email: b.email.toLowerCase() },
    });
    if (u && !u.deletedAt) await this.sendToken(u.id, u.email, "RESET");
    return { message: "If this account exists, a reset link has been sent." };
  }
  @Public() @Post("auth/reset") async reset(@Body() body: unknown) {
    const b = z
      .object({
        token: z.string().max(200),
        password: z.string().min(12).max(128),
      })
      .strict()
      .parse(body);
    const t = await this.db.authToken.findUnique({
      where: { tokenHash: hash(b.token) },
    });
    if (!t || t.purpose !== "RESET" || t.expiresAt < new Date())
      throw new BadRequestException("Link expired");
    const newHash = await passwordHash(b.password);
    await this.db.$transaction(async (tx) => {
      const c = await tx.authToken.deleteMany({ where: { id: t.id } });
      if (c.count !== 1) throw new BadRequestException("Link already used");
      await tx.user.update({
        where: { id: t.userId },
        data: { passwordHash: newHash },
      });
      await tx.session.deleteMany({ where: { userId: t.userId } });
    });
    return { message: "Password updated; all sessions revoked." };
  }
  @Post("auth/logout") async logout(@Req() r: Authed) {
    await this.db.session.deleteMany({ where: { id: r.sessionId } });
    return { ok: true };
  }
  @Delete("auth/sessions") async revoke(@Req() r: Authed) {
    await this.db.session.deleteMany({ where: { userId: r.user.id } });
    return { ok: true };
  }
  @Get("me") async me(@Req() r: Authed) {
    return {
      ...account(r.user),
      permissions: permissions(r.policy),
      guardianEligible: r.policy.age >= 18 && r.user.adultVerified,
      ageBand:
        r.policy.age < 14 ? "child" : r.policy.age < 18 ? "teen" : "adult",
      notifications: await this.db.notification.findMany({
        where: notificationScope(
          r.user,
          Date.now(),
          this.infra.config.REGION !== "CN" ||
            this.infra.config.CN_SOCIAL_APPROVED === "true",
        ),
        take: 30,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    };
  }
  @Post("me") async profile(@Req() r: Authed, @Body() body: unknown) {
    return this.profiles.save(r, body, true);
  }
  @Get("me/export") async export(@Req() r: Authed) {
    return this.exportUser(r.user);
  }
  private async exportUser(user: User) {
    return {
      schemaVersion: 3,
      exportedAt: new Date(),
      deviceTestReports: await this.db.deviceTestReport.findMany({
        where: {
          OR: [
            { reviewerId: user.id },
            { contributors: { some: { userId: user.id } } },
          ],
        },
        select: {
          id: true,
          model: true,
          status: true,
          version: true,
          reviewedVersion: true,
          expiresAt: true,
        },
        orderBy: { id: "asc" },
      }),
      profile: {
        ...account(user),
        email: user.email,
        birthDate: user.birthDate,
        connectionSettings: connectionPreferences(user),
        notificationSettings: notificationPreferences(user),
        notificationRevision: user.notificationRevision,
        profileSettings: profilePreferences(user),
        profileReview: {
          revision: user.profileRevision,
          status: user.profileStatus,
          reason: user.profileReason,
          includesBio: user.profileBioReviewed,
        },
      },
      competitionEntries: await this.db.competitionEntry.findMany({
        where: { userId: user.id },
        include: {
          publications: { omit: { guardianId: true, consentDigest: true } },
          competition: {
            select: {
              title: true,
              puzzle: true,
              input: true,
              status: true,
              startsAt: true,
              endsAt: true,
              expiresAt: true,
            },
          },
        },
      }),
      posts: await this.db.post.findMany({ where: { authorId: user.id } }),
      comments: await this.db.comment.findMany({
        where: { authorId: user.id },
      }),
      progress: await this.db.progress.findMany({
        where: { userId: user.id },
      }),
      lessonSessions: await this.db.lessonSession.findMany({
        where: { userId: user.id },
      }),
      assessments: await this.db.learningAssessment.findMany({
        where: { userId: user.id },
      }),
      guidedSolves: await this.db.guidedSolve.findMany({
        where: { userId: user.id },
      }),
      attempts: await this.db.attempt.findMany({
        where: { userId: user.id },
        omit: { nonce: true },
      }),
      social: await this.db.social.findMany({ where: { actorId: user.id } }),
      connections: await Promise.all(
        (
          await this.db.connection.findMany({
            where: { OR: [{ requesterId: user.id }, { recipientId: user.id }] },
          })
        ).map((row) => this.connections.view(this.db, row)),
      ),
      goals: await this.db.practiceGoal.findMany({
        where: { userId: user.id },
      }),
      memberships: await this.db.membership.findMany({
        where: { userId: user.id },
      }),
      ownedClubs: await this.db.club.findMany({ where: { ownerId: user.id } }),
      notifications: await this.db.notification.findMany({
        where: { userId: user.id },
      }),
      appVerificationKeys: (
        await this.db.appAttestationKey.findMany({
          where: { userId: user.id },
          orderBy: { id: "asc" },
        })
      ).map(appAttestationKeySummary),
      replayShares: await this.db.replayShare.findMany({
        where: { userId: user.id },
        omit: {
          tokenHash: true,
          reviewerId: true,
          guardianId: true,
          sourceDigest: true,
        },
      }),
      achievementCards: await this.db.achievementCard.findMany({
        where: { userId: user.id },
        omit: { reviewerId: true, guardianId: true },
      }),
      media: await this.db.media.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          type: true,
          purpose: true,
          size: true,
          aiLabel: true,
          aiMetadata: true,
          aiDeclared: true,
          status: true,
          createdAt: true,
        },
      }),
      consent: await this.db.consent.findUnique({
        where: { childId: user.id },
        select: {
          status: true,
          publicPosting: true,
          recording: true,
          reviewedAt: true,
        },
      }),
    };
  }
  @Delete("me") async delete(@Req() r: Authed, @Body() body: unknown) {
    const b = z
      .object({ confirmation: z.literal("DELETE") })
      .strict()
      .parse(body);
    void b;
    await requestAccountDeletion(this.db, this.infra.config, r);
    return {
      message:
        "Account disabled. Content and media are queued for deletion. Encrypted backups expire within 30 days.",
    };
  }
  @Get("guardian/children") async children(@Req() r: Authed) {
    if (!eligibleGuardian(r.user, r.user.region))
      throw new ForbiddenException("Current guardian eligibility is required");
    const rows = await this.db.consent.findMany({
      where: { guardianId: r.user.id },
      select: {
        id: true,
        childId: true,
        status: true,
        publicPosting: true,
        recording: true,
        reason: true,
      },
    });
    const children = await this.db.user.findMany({
      where: { id: { in: rows.map((row) => row.childId) } },
      select: { id: true, displayName: true, birthDate: true, deletedAt: true },
    });
    return rows.flatMap((row) => {
      const child = children.find((child) => child.id === row.childId);
      return child && ageOn(child.birthDate) < 18
        ? [
            {
              ...row,
              child: {
                displayName: child.displayName,
                deletedAt: child.deletedAt,
              },
            },
          ]
        : [];
    });
  }
  @Post("guardian/children") async createChild(
    @Req() r: Authed,
    @Body() body: unknown,
  ) {
    if (r.policy.age < 18 || !r.user.adultVerified)
      throw new ForbiddenException(
        "Guardian eligibility must be reviewed first",
      );
    const b = z
      .object({
        displayName: z.string().min(2).max(40),
        birthDate: z.string(),
        documentId: z.string().uuid(),
        publicPosting: z.boolean(),
        recording: z.boolean(),
        signedConsent: z.literal(true),
      })
      .strict()
      .parse(body);
    const age = ageOn(b.birthDate);
    if (!isYoungChild({ age, region: r.policy.region }))
      throw new BadRequestException("This workflow is for younger children");
    const media = await this.db.media.findFirst({
      where: {
        id: b.documentId,
        userId: r.user.id,
        purpose: "consent",
        status: "READY",
      },
    });
    if (!media)
      throw new BadRequestException("Upload a signed consent document first");
    if (!(await this.infra.limit(`child-create:${r.user.id}`, 5, 3600)))
      throw new HttpException("Child account creation limit reached", 429);
    const password = await passwordHash(opaque());
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.user.id}::uuid FOR UPDATE`;
      const guardian = await tx.user.findUnique({ where: { id: r.user.id } }),
        session = await tx.session.findUnique({ where: { id: r.sessionId } });
      if (
        !eligibleGuardian(guardian, this.infra.config.REGION) ||
        !session ||
        session.userId !== r.user.id ||
        session.scope !== "FULL" ||
        session.expiresAt <= new Date()
      )
        throw new ForbiddenException("Current guardian access required");
      const child = await tx.user.create({
        data: {
          email: `child-${opaque()}@child.cubers.invalid`,
          passwordHash: password,
          emailVerified: true,
          birthDate: b.birthDate,
          region: r.user.region,
          displayName: b.displayName,
          privateProfile: true,
        },
      });
      const consent = await tx.consent.create({
        data: {
          childId: child.id,
          guardianId: r.user.id,
          documentId: b.documentId,
          publicPosting: b.publicPosting,
          recording: b.recording,
        },
      });
      await tx.audit.create({
        data: {
          actorId: r.user.id,
          action: "guardian.child-create",
          targetId: child.id,
          detail: { consentId: consent.id },
        },
      });
      return consent;
    });
  }
  private async linkedChild(r: Authed, id: string) {
    if (
      !eligibleGuardian(r.user, r.user.region) ||
      !(await this.db.consent.findFirst({
        where: { childId: id, guardianId: r.user.id },
      }))
    )
      throw new ForbiddenException("Current linked guardian required");
    const child = await this.db.user.findUniqueOrThrow({ where: { id } });
    if (child.region !== r.user.region || ageOn(child.birthDate) >= 18)
      throw new ForbiddenException("This account is independently managed");
    return child;
  }
  @Get("guardian/children/:id/export") async exportChild(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    return this.exportUser(await this.linkedChild(r, id));
  }
  @Delete("guardian/children/:id") async deleteChild(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    z.object({ confirmation: z.literal("DELETE") })
      .strict()
      .parse(body);
    await this.linkedChild(r, id);
    await requestAccountDeletion(this.db, this.infra.config, r, id);
    return { ok: true };
  }
  @Post("guardian/children/:id/session") async childSession(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    const c = await this.db.consent.findFirst({
      where: { childId: id, guardianId: r.user.id, status: "APPROVED" },
    });
    if (!c) throw new ForbiddenException("Approved linked child required");
    const u = await this.linkedChild(r, id);
    if (u.deletedAt) throw new ForbiddenException("Account deleted");
    return { token: await this.issue(id), user: account(u) };
  }
  @Delete("guardian/children/:id/consent") async revokeConsent(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    await this.linkedChild(r, id);
    const c = await this.db.consent.findFirst({
      where: { childId: id, guardianId: r.user.id },
    });
    if (!c) throw new ForbiddenException();
    await this.db.$transaction(
      async (tx) => {
        for (const userId of [r.user.id, id].sort())
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
        const actor = await tx.user.findUniqueOrThrow({
            where: { id: r.user.id },
          }),
          child = await tx.user.findUniqueOrThrow({ where: { id } }),
          session = await tx.session.findUnique({ where: { id: r.sessionId } }),
          consent = await tx.consent.findUnique({ where: { childId: id } });
        if (
          !eligibleGuardian(actor, this.infra.config.REGION) ||
          child.deletedAt ||
          child.region !== actor.region ||
          ageOn(child.birthDate) >= 18 ||
          consent?.guardianId !== actor.id ||
          !session ||
          session.userId !== actor.id ||
          session.scope !== "FULL" ||
          session.expiresAt <= new Date()
        )
          throw new ForbiddenException(
            "Current linked guardian access is required",
          );
        const clock = await tx.$queryRaw<
          Array<{ now: Date }>
        >`SELECT clock_timestamp() AS now`;
        const recorded = await recordMediaRecovery(tx, this.infra.config, id, {
          kind: "CONSENT_WITHDRAWAL",
          cutoff: clock[0].now.toISOString(),
        });
        if (!recorded) {
          await tx.consent.update({
            where: { id: c.id },
            data: { status: "REVOKED", publicPosting: false, recording: false },
          });
          await tx.session.deleteMany({ where: { userId: id } });
          await tx.replayShare.updateMany({
            where: {
              userId: id,
              status: { in: ["PENDING_GUARDIAN", "PENDING_REVIEW", "READY"] },
            },
            data: {
              status: "CANCELLED",
              tokenHash: null,
              revision: { increment: 1 },
            },
          });
          await tx.competitionPublication.updateMany({
            where: { entry: { userId: id } },
            data: { status: "CANCELLED", revision: { increment: 1 } },
          });
          await tx.post.updateMany({
            where: { authorId: id },
            data: { status: "PENDING", guardianApproved: false },
          });
          await tx.attempt.updateMany({
            where: {
              userId: id,
              room: { ranked: true, input: { not: "virtual" } },
              status: {
                in: [
                  "CREATED",
                  "INSPECTION",
                  "SOLVING",
                  "AWAITING_EVIDENCE",
                  "PROVISIONAL",
                  "APPROVED",
                ],
              },
            },
            data: {
              status: "REJECTED",
              reason: "Guardian withdrew recording permission",
              finalizedAt: new Date(),
              evidenceDeleteAt: new Date(),
            },
          });
          await tx.media.updateMany({
            where: { userId: id, purpose: "evidence" },
            data: { status: "DELETING" },
          });
        }
        await tx.audit.create({
          data: {
            actorId: r.user.id,
            action: "guardian.consent-revoke",
            targetId: id,
            detail: {},
          },
        });
      },
      { timeout: 30000 },
    );
    return { ok: true };
  }
  @Get("guardian/children/:id/activity") async childActivity(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    await this.linkedChild(r, id);
    return {
      connections: await Promise.all(
        (
          await this.db.connection.findMany({
            where: { OR: [{ requesterId: id }, { recipientId: id }] },
            orderBy: { createdAt: "desc" },
            take: 30,
          })
        ).map((row) => this.connections.view(this.db, row)),
      ),
      competitionEntries: await this.db.competitionEntry.findMany({
        where: { userId: id },
        include: {
          publications: { omit: { guardianId: true, consentDigest: true } },
          competition: {
            select: {
              title: true,
              puzzle: true,
              input: true,
              status: true,
              startsAt: true,
              endsAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      progress: await this.db.progress.findMany({ where: { userId: id } }),
      assessments: await this.db.learningAssessment.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      guidedSolves: await this.db.guidedSolve.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      lessonSessions: await this.db.lessonSession.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      posts: await this.db.post.findMany({ where: { authorId: id } }),
      attempts: await this.db.attempt.findMany({
        where: { userId: id },
        omit: { nonce: true },
      }),
      appVerificationKeys: (
        await this.db.appAttestationKey.findMany({
          where: { userId: id },
          orderBy: { id: "asc" },
        })
      ).map(appAttestationKeySummary),
      replayShares: await this.db.replayShare.findMany({
        where: {
          userId: id,
          createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
        omit: {
          tokenHash: true,
          reviewerId: true,
          guardianId: true,
          sourceDigest: true,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      achievementCards: await this.db.achievementCard.findMany({
        where: {
          userId: id,
          createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
        omit: { guardianId: true, reviewerId: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    };
  }
}
