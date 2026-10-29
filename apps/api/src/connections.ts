import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  HttpException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma, type Connection, type User } from "@prisma/client";
import {
  ConnectionSettings,
  ageOn,
  isYoungChild,
  permissions,
  type ConnectionView,
} from "@cubers/core";
import { z } from "zod";
import { notificationCategories } from "./notifications";
import { Db, Infrastructure } from "./services";
import { accountPolicies, eligibleGuardian, type Authed } from "./security";
import { hash } from "./crypto";
const approvalsSchema = z.record(z.string());
const clubApprovalSchema = z.object({
  clubId: z.string().uuid(),
  revision: z.number().int(),
  reviewerId: z.string().uuid(),
});
export const connectionPair = (kind: string, a: string, b: string) =>
  [kind, ...[a.toLowerCase(), b.toLowerCase()].sort()].join(":");
export async function lockConnectionUsers(
  db: Prisma.TransactionClient,
  ids: string[],
) {
  const sorted = [...new Set(ids)].sort();
  await db.$queryRaw`SELECT id FROM "User" WHERE id IN (${Prisma.join(sorted.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
}
export const connectionPreferences = (user: User) =>
  ConnectionSettings.parse(user.connectionSettings);
@Injectable()
export class Connections {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
  ) {}
  async context(db: Prisma.TransactionClient, row: Connection) {
    const users = await db.user.findMany({
      where: { id: { in: [row.requesterId, row.recipientId] } },
    });
    const requester = users.find((u) => u.id === row.requesterId),
      recipient = users.find((u) => u.id === row.recipientId);
    if (!requester || !recipient) throw new NotFoundException();
    const policies = await accountPolicies(db, users);
    let unavailable: string | null = null;
    if (
      users.some(
        (u) =>
          u.deletedAt ||
          !u.emailVerified ||
          u.region !== this.infra.config.REGION,
      )
    )
      unavailable = "ACCOUNT_UNAVAILABLE";
    if (users.some((u) => !permissions(policies.get(u.id)!).canLearn))
      unavailable = "CONSENT_REQUIRED";
    if (
      this.infra.config.REGION === "CN" &&
      users.some((u) => !u.identityVerified)
    )
      unavailable = "IDENTITY_REVIEW_REQUIRED";
    const blocked = await db.social.findFirst({
      where: {
        kind: "block",
        OR: [
          {
            actorId: requester.id,
            targetId: { equals: recipient.id, mode: "insensitive" },
          },
          {
            actorId: recipient.id,
            targetId: { equals: requester.id, mode: "insensitive" },
          },
        ],
      },
    });
    if (blocked) unavailable = "BLOCKED";
    const hasMinor = users.some((u) => ageOn(u.birthDate) < 18);
    if (
      hasMinor &&
      users.some((u) => ageOn(u.birthDate) >= 18 && !u.adultVerified)
    )
      unavailable = "ADULT_REVIEW_REQUIRED";
    if (
      row.kind === "MENTORSHIP" &&
      !eligibleGuardian(recipient, recipient.region)
    )
      unavailable = "MENTOR_UNAVAILABLE";
    const club = row.clubId
      ? await db.club.findUnique({ where: { id: row.clubId } })
      : null;
    if (row.clubRequired && !club) unavailable = "CLUB_UNAVAILABLE";
    if (row.clubId) {
      const members = await db.membership.count({
        where: {
          clubId: row.clubId,
          userId: { in: users.map((u) => u.id) },
          status: "APPROVED",
        },
      });
      const owner = club
        ? await db.user.findUnique({ where: { id: club.ownerId } })
        : null;
      if (
        !club ||
        club.status !== "APPROVED" ||
        members !== 2 ||
        !eligibleGuardian(owner, requester.region)
      )
        unavailable = "CLUB_UNAVAILABLE";
    }
    const consents = await db.consent.findMany({
      where: {
        childId: {
          in: users
            .filter((u) => isYoungChild(policies.get(u.id)!))
            .map((u) => u.id),
        },
      },
    });
    const expected = new Map(
      consents.map((c) => [
        c.childId,
        hash(`${c.id}:${c.guardianId}:${c.reviewedAt?.toISOString() || ""}`),
      ]),
    );
    const saved = approvalsSchema.safeParse(row.guardianApprovals);
    const guardianNeeded = users
      .filter((u) => isYoungChild(policies.get(u.id)!))
      .filter(
        (u) =>
          !expected.has(u.id) ||
          !saved.success ||
          saved.data[u.id] !== expected.get(u.id),
      );
    const needsClub =
      row.kind === "MENTORSHIP" && ageOn(requester.birthDate) < 18;
    let clubApproved = !needsClub;
    if (needsClub && club) {
      const approval = clubApprovalSchema.safeParse(row.clubApproval);
      if (
        approval.success &&
        approval.data.clubId === club.id &&
        approval.data.revision === club.revision &&
        !users.some((u) => u.id === approval.data.reviewerId)
      ) {
        const reviewer = await db.user.findUnique({
          where: { id: approval.data.reviewerId },
        });
        clubApproved =
          !!reviewer &&
          !reviewer.deletedAt &&
          reviewer.emailVerified &&
          reviewer.region === requester.region &&
          eligibleGuardian(reviewer, requester.region) &&
          (reviewer.id === club.ownerId ||
            (["ADMIN", "MODERATOR"].includes(reviewer.role) &&
              !!reviewer.mfaSecret));
      }
    }
    if (blocked) unavailable = "BLOCKED";
    return {
      requester,
      recipient,
      users,
      club,
      unavailable,
      expected,
      guardianNeeded,
      consents,
      needsClub,
      needs: {
        recipient: !row.recipientAccepted,
        guardian: guardianNeeded.length > 0,
        clubReview: !clubApproved,
      },
    };
  }
  async view(
    db: Prisma.TransactionClient,
    row: Connection,
  ): Promise<ConnectionView> {
    const c = await this.context(db, row);
    const expired = row.status === "PENDING" && row.expiresAt <= new Date();
    const unavailable = expired ? "EXPIRED" : c.unavailable;
    const safeName = (u: User) => ({
      id: u.id,
      displayName:
        u.deletedAt || c.unavailable === "BLOCKED"
          ? "Unavailable cuber · 暂不可用"
          : u.displayName,
    });
    return {
      id: row.id,
      kind: row.kind,
      status: expired ? "EXPIRED" : row.status,
      version: row.version,
      requester: safeName(c.requester),
      recipient: safeName(c.recipient),
      club: c.club
        ? {
            id: c.club.id,
            name:
              c.club.status === "APPROVED" &&
              c.unavailable !== "CLUB_UNAVAILABLE"
                ? c.club.name
                : "Unavailable club · 社团暂不可用",
          }
        : null,
      active:
        row.status === "ACCEPTED" &&
        !unavailable &&
        !Object.values(c.needs).some(Boolean),
      unavailable,
      recipientAccepted: row.recipientAccepted,
      needs: c.needs,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
  async pendingAllowed(db: Prisma.TransactionClient, row: Connection) {
    const c = await this.context(db, row);
    if (c.unavailable)
      throw new ForbiddenException(
        "Connection is unavailable; check account and club permissions",
      );
    const preference = connectionPreferences(c.recipient);
    if (
      preference.requests === "NONE" ||
      (preference.requests === "CLUB" && !row.clubId)
    )
      throw new ForbiddenException(
        "This account is not accepting these requests",
      );
    if (row.kind === "MENTORSHIP" && !preference.offerMentoring)
      throw new ForbiddenException("Mentorship is not offered by this account");
    return c;
  }
  async capacity(db: Prisma.TransactionClient, row: Connection) {
    if (row.kind !== "MENTORSHIP") return;
    const mentor = await db.user.findUniqueOrThrow({
      where: { id: row.recipientId },
    });
    const used = await db.connection.count({
      where: {
        recipientId: mentor.id,
        kind: "MENTORSHIP",
        id: { not: row.id },
        recipientAccepted: true,
        OR: [
          { status: "ACCEPTED" },
          { status: "PENDING", expiresAt: { gt: new Date() } },
        ],
      },
    });
    if (used >= connectionPreferences(mentor).mentorCapacity)
      throw new ConflictException("This mentor's available places are full");
  }
  async activate(db: Prisma.TransactionClient, row: Connection) {
    if (row.status !== "PENDING") return row;
    const c = await this.pendingAllowed(db, row);
    if (!Object.values(c.needs).some(Boolean)) {
      await this.capacity(db, row);
      return db.connection.update({
        where: { id: row.id },
        data: { status: "ACCEPTED" },
      });
    }
    return row;
  }
  async notify(db: Prisma.TransactionClient, row: Connection) {
    const c = await this.context(db, row);
    const ids = [
      row.requesterId,
      row.recipientId,
      ...c.consents.map((c) => c.guardianId),
      ...(c.needsClub && c.club ? [c.club.ownerId] : []),
    ];
    const active = await db.user.findMany({
      where: {
        id: { in: [...new Set(ids)] },
        deletedAt: null,
        region: this.infra.config.REGION,
      },
      select: { id: true, notificationSettings: true },
    });
    await db.notification.createMany({
      data: active
        .filter((user) => notificationCategories(user).includes("CONNECTION"))
        .map(({ id: userId }) => ({
          userId,
          category: "CONNECTION",
          title: "Connection update · 关系申请更新",
          body: "Review friends and mentorship in Cubers. · 请在 Cubers 中查看好友与指导申请。",
        })),
    });
  }
  async audit(
    db: Prisma.TransactionClient,
    actorId: string,
    row: Connection,
    action: string,
  ) {
    await db.audit.create({
      data: {
        actorId,
        action: `connection.${action}`,
        targetId: row.id,
        detail: { kind: row.kind, status: row.status, version: row.version },
      },
    });
  }
  async create(
    r: Authed,
    input: { targetId: string; kind: "FRIEND" | "MENTORSHIP"; clubId?: string },
  ) {
    if (r.user.id === input.targetId)
      throw new BadRequestException("Choose another cuber");
    if (!(await this.infra.limit(`connection-create:${r.user.id}`, 10, 86400)))
      throw new HttpException("Connection request limit reached", 429);
    return this.db.$transaction(async (tx) => {
      await lockConnectionUsers(tx, [r.user.id, input.targetId]);
      const users = await tx.user.findMany({
        where: {
          id: { in: [r.user.id, input.targetId] },
          deletedAt: null,
          emailVerified: true,
          region: r.user.region,
        },
      });
      if (users.length !== 2) throw new NotFoundException();
      const hasMinor = users.some((u) => ageOn(u.birthDate) < 18);
      if (hasMinor && !input.clubId)
        throw new ForbiddenException(
          "Minor connections require an approved shared club",
        );
      const pairKey = connectionPair(input.kind, r.user.id, input.targetId);
      const previous = await tx.connection.findUnique({ where: { pairKey } });
      if (
        previous &&
        ["PENDING", "ACCEPTED"].includes(previous.status) &&
        !(previous.status === "PENDING" && previous.expiresAt <= new Date())
      )
        throw new ConflictException("A connection or request already exists");
      if (previous?.retryAfter && previous.retryAfter > new Date())
        throw new ConflictException(
          "Please wait before sending another request",
        );
      if (
        (await tx.connection.count({
          where: {
            status: "PENDING",
            expiresAt: { gt: new Date() },
            OR: [{ requesterId: r.user.id }, { recipientId: input.targetId }],
          },
        })) >= 50
      )
        throw new HttpException("Pending request limit reached", 429);
      const values = {
        kind: input.kind,
        requesterId: r.user.id,
        recipientId: input.targetId,
        clubId: input.clubId || null,
        clubRequired: hasMinor || !!input.clubId,
        status: "PENDING" as const,
        recipientAccepted: false,
        guardianApprovals: {},
        clubApproval: Prisma.DbNull,
        expiresAt: new Date(Date.now() + 14 * 86400000),
        retryAfter: null,
        createdAt: new Date(),
      };
      const row = previous
        ? await tx.connection.update({
            where: { id: previous.id },
            data: { ...values, version: { increment: 1 } },
          })
        : await tx.connection.create({ data: { pairKey, ...values } });
      await this.pendingAllowed(tx, row);
      await this.audit(tx, r.user.id, row, "request");
      await this.notify(tx, row);
      return this.view(tx, row);
    });
  }
  async mutate(
    r: Authed,
    id: string,
    version: number,
    action: "ACCEPT" | "DECLINE" | "CANCEL" | "END",
  ) {
    return this.change(
      r,
      id,
      version,
      async (tx, row) => {
        const incoming = row.recipientId === r.user.id,
          outgoing = row.requesterId === r.user.id;
        if (!incoming && !outgoing) throw new NotFoundException();
        if (action === "ACCEPT") {
          if (!incoming || row.status !== "PENDING" || row.recipientAccepted)
            throw new ConflictException("This request cannot be accepted");
          await this.pendingAllowed(tx, row);
          await this.capacity(tx, row);
          row = await tx.connection.update({
            where: { id },
            data: { recipientAccepted: true, version: { increment: 1 } },
          });
          row = await this.activate(tx, row);
        } else {
          if (
            (action === "DECLINE" && (!incoming || row.status !== "PENDING")) ||
            (action === "CANCEL" && (!outgoing || row.status !== "PENDING")) ||
            (action === "END" && row.status !== "ACCEPTED")
          )
            throw new ConflictException(
              "This connection cannot enter that state",
            );
          row = await tx.connection.update({
            where: { id },
            data: {
              status:
                action === "DECLINE"
                  ? "DECLINED"
                  : action === "CANCEL"
                    ? "CANCELLED"
                    : "ENDED",
              retryAfter: new Date(
                Date.now() + (action === "DECLINE" ? 7 : 1) * 86400000,
              ),
              version: { increment: 1 },
            },
          });
        }
        return row;
      },
      action.toLowerCase(),
    );
  }
  async guardianAccess(
    db: Prisma.TransactionClient,
    r: Authed,
    childId: string,
  ) {
    const child = await db.user.findUnique({ where: { id: childId } });
    const consent = await db.consent.findFirst({
      where: {
        childId,
        guardianId: r.user.id,
        reviewedAt: { not: null },
        status: { in: ["APPROVED", "REVOKED"] },
      },
    });
    const guardian = await db.user.findUnique({ where: { id: r.user.id } });
    if (
      !child ||
      child.deletedAt ||
      ageOn(child.birthDate) >= 18 ||
      !consent ||
      !eligibleGuardian(guardian, child.region)
    )
      throw new NotFoundException();
    return { child, consent };
  }
  async guardianReview(
    r: Authed,
    id: string,
    childId: string,
    version: number,
    approve: boolean,
  ) {
    return this.change(
      r,
      id,
      version,
      async (tx, row) => {
        if (![row.requesterId, row.recipientId].includes(childId))
          throw new NotFoundException();
        const { child, consent } = await this.guardianAccess(tx, r, childId);
        if (!["PENDING", "ACCEPTED"].includes(row.status))
          throw new ConflictException("Request is closed");
        if (!approve)
          return tx.connection.update({
            where: { id },
            data: {
              status: row.status === "ACCEPTED" ? "ENDED" : "DECLINED",
              retryAfter: new Date(Date.now() + 7 * 86400000),
              version: { increment: 1 },
            },
          });
        const c = await this.context(tx, row);
        if (
          !isYoungChild({
            region: child.region as "CN" | "INTL",
            age: ageOn(child.birthDate),
          }) ||
          consent.status !== "APPROVED" ||
          c.unavailable
        )
          throw new ForbiddenException("Current child consent is required");
        const saved = approvalsSchema.parse(row.guardianApprovals);
        if (saved[childId] === c.expected.get(childId))
          throw new ConflictException(
            "This guardian approval is already current",
          );
        row = await tx.connection.update({
          where: { id },
          data: {
            guardianApprovals: {
              ...saved,
              [childId]: c.expected.get(childId)!,
            },
            version: { increment: 1 },
          },
        });
        return this.activate(tx, row);
      },
      approve ? "guardian-approve" : "guardian-decline",
      { childId },
    );
  }
  async canReviewClub(
    db: Prisma.TransactionClient,
    r: Authed,
    row: Connection,
  ) {
    if ([row.requesterId, row.recipientId].includes(r.user.id) || !row.clubId)
      return false;
    const club = await db.club.findUnique({ where: { id: row.clubId } });
    if (!club || club.status !== "APPROVED") return false;
    const reviewer = await db.user.findUnique({ where: { id: r.user.id } });
    if (!eligibleGuardian(reviewer, this.infra.config.REGION)) return false;
    if (club.ownerId === r.user.id) return true;
    if (
      !["ADMIN", "MODERATOR"].includes(reviewer!.role) ||
      !reviewer!.mfaSecret
    )
      return false;
    const session = await db.session.findUnique({ where: { id: r.sessionId } });
    return !!session?.mfaVerified;
  }
  async clubReview(
    r: Authed,
    id: string,
    version: number,
    approve: boolean,
    clubId?: string,
  ) {
    return this.change(
      r,
      id,
      version,
      async (tx, row) => {
        if (clubId && row.clubId !== clubId) throw new NotFoundException();
        if (!(await this.canReviewClub(tx, r, row)))
          throw new NotFoundException();
        const c = await this.context(tx, row);
        if (!c.needsClub || !["PENDING", "ACCEPTED"].includes(row.status))
          throw new ConflictException("No club review is required");
        if (approve && !c.needs.clubReview)
          throw new ConflictException("This club approval is already current");
        if (approve && c.unavailable)
          throw new ForbiddenException(
            "Current member and account eligibility required",
          );
        row = await tx.connection.update({
          where: { id },
          data: {
            ...(approve
              ? {
                  clubApproval: {
                    clubId: c.club!.id,
                    revision: c.club!.revision,
                    reviewerId: r.user.id,
                  },
                }
              : {
                  status: row.status === "ACCEPTED" ? "ENDED" : "DECLINED",
                  retryAfter: new Date(Date.now() + 7 * 86400000),
                }),
            version: { increment: 1 },
          },
        });
        return this.activate(tx, row);
      },
      approve ? "club-approve" : "club-decline",
      { clubId },
    );
  }
  private async change(
    r: Authed,
    id: string,
    version: number,
    run: (tx: Prisma.TransactionClient, row: Connection) => Promise<Connection>,
    action: string,
    scope: { childId?: string; clubId?: string } = {},
  ) {
    const original = await this.db.connection.findUnique({ where: { id } });
    if (!original) throw new NotFoundException();
    return this.db.$transaction(async (tx) => {
      await lockConnectionUsers(tx, [
        original.requesterId,
        original.recipientId,
      ]);
      const row = await tx.connection.findUnique({ where: { id } });
      if (!row) throw new NotFoundException();
      if (action.startsWith("guardian-")) {
        if (
          !scope.childId ||
          ![row.requesterId, row.recipientId].includes(scope.childId)
        )
          throw new NotFoundException();
        await this.guardianAccess(tx, r, scope.childId);
      } else if (action.startsWith("club-")) {
        if (
          (scope.clubId && scope.clubId !== row.clubId) ||
          !(await this.canReviewClub(tx, r, row))
        )
          throw new NotFoundException();
      } else if (![row.requesterId, row.recipientId].includes(r.user.id))
        throw new NotFoundException();
      if (row.version !== version)
        throw new ConflictException(
          "Request changed. Refresh and review it again",
        );
      if (row.status === "PENDING" && row.expiresAt <= new Date())
        throw new ConflictException("Request expired");
      const updated = await run(tx, row);
      await this.audit(tx, r.user.id, updated, action);
      await this.notify(tx, updated);
      return this.view(tx, updated);
    });
  }
}
