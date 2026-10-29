import { attemptInputWhere } from "./attempt-input";
import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  HttpException,
} from "@nestjs/common";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import {
  playInput,
  ProfileSettings,
  ProfileSections,
  ProfileIdentity,
  UpdateProfile,
  AchievementCatalog,
  ageOn,
  permissions,
  type ProfileSection,
  type SharedProfile,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { Connections, connectionPair } from "./connections";
import { accountPolicy, eligibleGuardian, type Authed } from "./security";
import { communityAvailable, readableClub } from "./community-access";
import { hash, opaque } from "./crypto";
export const profilePreferences = (user: User) =>
  ProfileSettings.parse(user.profileSettings);
const exposure = { PRIVATE: 0, FRIENDS: 1, PUBLIC: 2 };
@Injectable()
export class Profiles {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(Connections) private connections: Connections,
  ) {}
  async achievements(db: Prisma.TransactionClient, user: User) {
    const policy = await accountPolicy(db, user);
    if (!permissions(policy).canLearn) return [];
    const [lessons, practice, virtual, physical] = await Promise.all([
      db.progress.count({ where: { userId: user.id, completed: true } }),
      db.progress.aggregate({
        where: { userId: user.id, completed: true },
        _sum: { repetitions: true },
      }),
      db.attempt.count({
        where: {
          userId: user.id,
          status: "APPROVED",
          ...attemptInputWhere("virtual"),
          room: { mode: { in: ["race", "daily"] } },
        },
      }),
      permissions(policy).canRecord &&
      (user.region !== "CN" || user.identityVerified)
        ? db.attempt.count({
            where: {
              userId: user.id,
              status: "APPROVED",
              reviewerId: { not: null },
              room: {
                input: { in: ["scan", "smart"] },
                ranked: true,
                mixed: false,
                mode: { in: ["race", "daily"] },
              },
            },
          })
        : Promise.resolve(0),
    ]);
    const earned = new Set<string>();
    if (lessons > 0) earned.add("first-checkpoint");
    if (lessons >= 5) earned.add("five-lessons");
    if (lessons >= 20) earned.add("twenty-lessons");
    if ((practice._sum.repetitions || 0) >= 10) earned.add("ten-checkpoints");
    if (virtual > 0) earned.add("virtual-solve");
    if (physical > 0) earned.add("reviewed-physical");
    return AchievementCatalog.filter((a) => earned.has(a.id));
  }
  async own(r: Authed) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: r.user.id },
    });
    return {
      displayName: user.displayName,
      bio: user.bio,
      privateProfile: user.privateProfile,
      settings: profilePreferences(user),
      review: {
        revision: user.profileRevision,
        status: user.profileStatus,
        reason: user.profileReason,
        includesBio: user.profileBioReviewed,
      },
      achievements: await this.achievements(this.db, user),
      sharingEligible:
        eligibleGuardian(user, this.infra.config.REGION) &&
        (user.region !== "CN" ||
          (user.identityVerified &&
            this.infra.config.CN_SOCIAL_APPROVED === "true")),
    };
  }
  async save(r: Authed, body: unknown, identityOnly = false) {
    const parsed = identityOnly
      ? ProfileIdentity.parse(body)
      : UpdateProfile.parse(body);
    if (!(await this.infra.limit("profile-write:" + r.user.id, 30, 3600)))
      throw new HttpException("Profile update limit reached", 429);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${r.user.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: r.user.id },
      });
      const full = identityOnly
        ? {
            ...parsed,
            settings: profilePreferences(current),
            revision: current.profileRevision,
          }
        : (parsed as UpdateProfile);
      if (full.revision !== current.profileRevision)
        throw new ConflictException("Profile changed; reload before saving");
      const old = profilePreferences(current),
        next = full.settings,
        age = ageOn(current.birthDate);
      if (age < 18 && !full.privateProfile)
        throw new ForbiddenException("Minor profiles remain private");
      if (
        age < 18 &&
        /\b\d{6,}\b|@|https?:|www\.|学校|school|address|地址|电话|手机|wechat|weixin|微信/i.test(
          full.displayName + "\n" + full.bio,
        )
      )
        throw new BadRequestException(
          "Do not include contact, school, or location details",
        );
      const sharing =
        !full.privateProfile &&
        ProfileSections.some((s) => next.visibility[s] !== "PRIVATE");
      if (sharing) {
        communityAvailable(this.infra.config);
        if (
          !eligibleGuardian(current, this.infra.config.REGION) ||
          (current.region === "CN" && !current.identityVerified)
        )
          throw new ForbiddenException(
            "Verified adult eligibility is required for profile sharing",
          );
        const increased =
          current.privateProfile ||
          ProfileSections.some(
            (s) => exposure[next.visibility[s]] > exposure[old.visibility[s]],
          );
        if (increased && full.sharingConfirmed !== true)
          throw new BadRequestException(
            "Confirm sharing your nickname, avatar and selected profile sections",
          );
      }
      const earned = await this.achievements(tx, current);
      if (
        next.selectedAchievements.some(
          (id) =>
            !earned.some((a) => a.id === id) &&
            !old.selectedAchievements.includes(id),
        )
      )
        throw new BadRequestException(
          "Only currently earned achievements can be selected",
        );
      const identityChanged =
        current.displayName !== full.displayName || current.bio !== full.bio;
      if (current.displayName !== full.displayName) {
        // Every reviewed author identity is versioned, including adult accounts.
        await tx.post.updateMany({
          where: {
            authorId: current.id,
            status: { in: ["PUBLISHED", "PENDING"] },
          },
          data: {
            status: "PENDING",
            guardianApproved: false,
            moderatorApproved: false,
            revision: { increment: 1 },
          },
        });
        await tx.comment.updateMany({
          where: {
            authorId: current.id,
            status: { in: ["PUBLISHED", "APPROVED"] },
          },
          data: { status: "PENDING" },
        });
      }
      const biographyNeedsReview =
        sharing &&
        next.visibility.about !== "PRIVATE" &&
        (!current.profileBioReviewed || current.bio !== full.bio);
      const status =
        current.displayName !== full.displayName ||
        biographyNeedsReview ||
        current.profileStatus !== "APPROVED"
          ? sharing
            ? "PENDING"
            : "DRAFT"
          : "APPROVED";
      const updated = await tx.user.update({
        where: { id: current.id },
        data: {
          displayName: full.displayName,
          bio: full.bio,
          privateProfile: full.privateProfile,
          profileSettings: next as unknown as Prisma.InputJsonValue,
          profileRevision: { increment: 1 },
          profileStatus: status,
          ...(identityChanged ? { profileBioReviewed: false } : {}),
          ...(identityChanged || status !== current.profileStatus
            ? { profileReason: null }
            : {}),
        },
      });
      await tx.audit.create({
        data: {
          actorId: current.id,
          targetId: current.id,
          action: "profile.update",
          detail: {
            revision: updated.profileRevision,
            privateProfile: updated.privateProfile,
            visibility: next.visibility,
          },
        },
      });
      return {
        id: updated.id,
        displayName: updated.displayName,
        bio: updated.bio,
        privateProfile: updated.privateProfile,
        revision: updated.profileRevision,
        status: updated.profileStatus,
      };
    });
  }
  eligible(user: User) {
    return (
      !user.privateProfile &&
      user.profileStatus === "APPROVED" &&
      eligibleGuardian(user, this.infra.config.REGION) &&
      (user.region !== "CN" || user.identityVerified)
    );
  }
  async blocked(db: Prisma.TransactionClient, a: string, b: string) {
    return !!(await db.social.findFirst({
      where: {
        kind: "block",
        OR: [
          { actorId: a, targetId: { equals: b, mode: "insensitive" } },
          { actorId: b, targetId: { equals: a, mode: "insensitive" } },
        ],
      },
    }));
  }
  async friends(db: Prisma.TransactionClient, a: string, b: string) {
    if (a === b) return true;
    const connection = await db.connection.findUnique({
      where: { pairKey: connectionPair("FRIEND", a, b) },
    });
    return !!connection && (await this.connections.view(db, connection)).active;
  }
  async visible(
    db: Prisma.TransactionClient,
    subject: User,
    viewer: string,
    section: ProfileSection,
  ) {
    if (section === "about" && !subject.profileBioReviewed) return false;
    if (!this.eligible(subject) || (await this.blocked(db, subject.id, viewer)))
      return false;
    const visibility = profilePreferences(subject).visibility[section];
    return (
      visibility === "PUBLIC" ||
      (visibility === "FRIENDS" && (await this.friends(db, subject.id, viewer)))
    );
  }
  async subject(r: Authed, id: string) {
    communityAvailable(this.infra.config);
    if (!(await this.infra.limit("profile-read:" + r.user.id, 90, 60)))
      throw new HttpException("Profile request limit reached", 429);
    id = z.string().uuid().parse(id).toLowerCase();
    const user = await this.db.user.findUnique({ where: { id } });
    if (
      !user ||
      !this.eligible(user) ||
      (await this.blocked(this.db, user.id, r.user.id))
    )
      throw new NotFoundException("Profile unavailable");
    return user;
  }
  async cursor(r: Authed, subject: string, kind: string, token?: string) {
    if (!token) return undefined;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new BadRequestException("Invalid profile cursor");
    const saved = await this.infra.redis.get(
      this.infra.config.REGION + ":profile-cursor:" + hash(token),
    );
    const value = saved ? JSON.parse(saved) : null;
    if (
      !value ||
      value.viewer !== r.user.id ||
      value.subject !== subject ||
      value.kind !== kind
    )
      throw new BadRequestException(
        "Profile cursor expired or belongs to another view",
      );
    return z.string().uuid().parse(value.last) as string;
  }
  async nextCursor(r: Authed, subject: string, kind: string, last: string) {
    const token = opaque();
    await this.infra.redis.set(
      this.infra.config.REGION + ":profile-cursor:" + hash(token),
      JSON.stringify({ viewer: r.user.id, subject, kind, last }),
      "EX",
      900,
    );
    return token;
  }
  async connectionsPage(r: Authed, user: User, token?: string) {
    if (!(await this.visible(this.db, user, r.user.id, "friends")))
      throw new NotFoundException("Section unavailable");
    const last = await this.cursor(r, user.id, "friends", token);
    const rows = await this.db.connection.findMany({
      where: {
        kind: "FRIEND",
        status: "ACCEPTED",
        OR: [{ requesterId: user.id }, { recipientId: user.id }],
        ...(last ? { id: { lt: last } } : {}),
      },
      orderBy: { id: "desc" },
      take: 20,
    });
    const items: NonNullable<SharedProfile["friends"]>["items"] = [];
    for (const row of rows) {
      if (!(await this.connections.view(this.db, row)).active) continue;
      const peerId =
        row.requesterId === user.id ? row.recipientId : row.requesterId;
      const peer = await this.db.user.findUnique({ where: { id: peerId } });
      // A friendship is disclosed only when both participants consent to its
      // visibility for this viewer. Minors and private peers never appear.
      if (!peer || !(await this.visible(this.db, peer, r.user.id, "friends")))
        continue;
      items.push({
        id: peer.id,
        displayName: peer.displayName,
        avatar: profilePreferences(peer).avatar,
      });
    }
    return {
      items,
      nextCursor:
        rows.length === 20
          ? await this.nextCursor(r, user.id, "friends", rows[19].id)
          : null,
    };
  }
  async clubsPage(r: Authed, user: User, token?: string) {
    if (!(await this.visible(this.db, user, r.user.id, "clubs")))
      throw new NotFoundException("Section unavailable");
    const last = await this.cursor(r, user.id, "clubs", token);
    const rows = await this.db.membership.findMany({
      where: {
        userId: user.id,
        status: "APPROVED",
        ...(last ? { id: { lt: last } } : {}),
      },
      orderBy: { id: "desc" },
      take: 20,
    });
    const items: NonNullable<SharedProfile["clubs"]>["items"] = [];
    for (const row of rows) {
      const club = await readableClub(this.db, r.user.id, row.clubId);
      if (!club || club.status !== "APPROVED") continue;
      const owner = await this.db.user.findUnique({
        where: { id: club.ownerId },
      });
      if (!eligibleGuardian(owner, user.region)) continue;
      items.push({ id: club.id, name: club.name, private: club.private });
    }
    return {
      items,
      nextCursor:
        rows.length === 20
          ? await this.nextCursor(r, user.id, "clubs", rows[19].id)
          : null,
    };
  }
  async view(r: Authed, id: string): Promise<SharedProfile> {
    const user = await this.subject(r, id),
      settings = profilePreferences(user);
    const allowed = Object.fromEntries(
      await Promise.all(
        ProfileSections.map(async (s) => [
          s,
          await this.visible(this.db, user, r.user.id, s),
        ]),
      ),
    ) as Record<ProfileSection, boolean>;
    if (!Object.values(allowed).some(Boolean))
      throw new NotFoundException("Profile unavailable");
    let statistics: SharedProfile["statistics"] = null;
    if (allowed.statistics) {
      const policy = await accountPolicy(this.db, user);
      const rows = await this.db.attempt.findMany({
        where: {
          userId: user.id,
          status: "APPROVED",
          durationMs: { not: null },
          room: { mode: { in: ["race", "daily"] } },
          OR: [
            attemptInputWhere("virtual"),
            ...(permissions(policy).canRecord
              ? [
                  {
                    reviewerId: { not: null },
                    room: {
                      ranked: true,
                      mixed: false,
                      input: { in: ["scan", "smart"] },
                    },
                  },
                ]
              : []),
          ],
        },
        select: {
          durationMs: true,
          input: true,
          room: { select: { puzzle: true, input: true, mixed: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      const categories = new Map<
        string,
        { puzzle: string; input: string; solves: number; bestMs: number }
      >();
      for (const row of rows) {
        const input = playInput(row.room, row.input),
          key = row.room.puzzle + ":" + input,
          old = categories.get(key);
        categories.set(key, {
          puzzle: row.room.puzzle,
          input,
          solves: (old?.solves || 0) + 1,
          bestMs: Math.min(old?.bestMs ?? Infinity, row.durationMs!),
        });
      }
      statistics = {
        window:
          "Most recent 1000 currently eligible approved race/daily solves",
        categories: [...categories.values()],
      };
    }
    return {
      id: user.id,
      displayName: user.displayName,
      avatar: settings.avatar,
      about: allowed.about
        ? {
            bio: user.bio,
            favorites: settings.favorites,
            skills: settings.skills,
          }
        : null,
      achievements: allowed.achievements
        ? (await this.achievements(this.db, user)).filter((a) =>
            settings.selectedAchievements.includes(a.id),
          )
        : null,
      statistics,
      friends: allowed.friends ? await this.connectionsPage(r, user) : null,
      clubs: allowed.clubs ? await this.clubsPage(r, user) : null,
    };
  }
  async review(r: Authed, id: string, body: unknown) {
    id = z.string().uuid().parse(id).toLowerCase();
    const b = z
      .object({
        approve: z.boolean(),
        revision: z.number().int().positive(),
        reason: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(body);
    if (id === r.user.id)
      throw new ForbiddenException(
        "A different reviewer must review this profile",
      );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id } });
      if (
        user.region !== this.infra.config.REGION ||
        !["PENDING", ...(!b.approve ? ["APPROVED"] : [])].includes(
          user.profileStatus,
        ) ||
        user.profileRevision !== b.revision
      )
        throw new ConflictException(
          "Profile changed; review the current revision",
        );
      if (
        b.approve &&
        (!eligibleGuardian(user, this.infra.config.REGION) ||
          user.privateProfile ||
          (user.region === "CN" && !user.identityVerified))
      )
        throw new ForbiddenException(
          "Current public-profile eligibility required",
        );
      await tx.user.update({
        where: { id },
        data: {
          profileStatus: b.approve ? "APPROVED" : "REJECTED",
          profileBioReviewed:
            b.approve &&
            profilePreferences(user).visibility.about !== "PRIVATE",
          profileReason: b.reason,
        },
      });
      await tx.audit.create({
        data: {
          actorId: r.user.id,
          targetId: id,
          action: "profile.review",
          detail: {
            revision: b.revision,
            approve: b.approve,
            includesBio:
              profilePreferences(user).visibility.about !== "PRIVATE",
          },
        },
      });
      await tx.notification.create({
        data: {
          userId: id,
          category: "REVIEW",
          title: "Profile review updated · 个人页审核有更新",
          body: "Open Profile to check your sharing status. 请在个人页查看分享状态。",
        },
      });
      return { ok: true };
    });
  }
}
