import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Prisma, type ReplayShare, type User } from "@prisma/client";
import {
  PrepareReplayShare,
  ReplayShareApproval,
  ReplaySharePublish,
  OpenReplayShare,
  ReplayPacket,
  ReplaySource,
  permissions,
  isYoungChild,
  type ReplayShareView,
  type ReplaySharePreview,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { Replays } from "./replays";
import { archivedReplayInput } from "./attempt-input";
import { accountPolicy, eligibleGuardian, type Authed } from "./security";
import { communityWrite } from "./community-authority";
import { communityAvailable } from "./community-access";
import { recordMediaRecovery } from "./media-recovery";
import { hash, opaque } from "./crypto";
import { notifyUser } from "./notifications";
type Tx = Prisma.TransactionClient;
type Role = "owner" | "guardian" | "staff";
const DAY = 86400000;
const cursor = z.object({ cursor: z.string().uuid().optional() }).strict();
const include = { room: true } as const;
const active = ["PENDING_GUARDIAN", "PENDING_REVIEW", "READY"];
@Injectable()
export class ReplayShares {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(Replays) private replays: Replays,
  ) {}
  private async limit(r: Authed, kind: string, max = 30, seconds = 60) {
    if (
      !(await this.infra.limit(
        `replay-share:${kind}:${r.user.id}`,
        max,
        seconds,
      ))
    )
      throw new HttpException("Too many replay sharing requests", 429);
  }
  private gates() {
    communityAvailable(this.infra.config);
    if (
      this.infra.config.REGION === "CN" &&
      this.infra.config.CN_GAMES_APPROVED !== "true"
    )
      throw new ForbiddenException("Current game-service review is required");
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
      throw new ForbiddenException("Current full account access required");
    if (
      role === "staff" &&
      (!["ADMIN", "MODERATOR"].includes(session.user.role) ||
        !session.mfaVerified ||
        !session.user.mfaSecret ||
        session.user.mfaGeneration !== r.user.mfaGeneration)
    )
      throw new ForbiddenException("Current independent staff MFA required");
    if (
      role === "guardian" &&
      !eligibleGuardian(session.user, this.infra.config.REGION)
    )
      throw new ForbiddenException("Current guardian eligibility required");
    return session.user;
  }
  private async owner(tx: Tx, user: User, row?: ReplayShare) {
    this.gates();
    const policy = await accountPolicy(tx, user),
      p = permissions(policy);
    if (
      user.deletedAt ||
      !user.emailVerified ||
      user.region !== this.infra.config.REGION ||
      !p.canLearn ||
      !p.canPost ||
      (policy.age >= 18 && !user.adultVerified)
    )
      throw new ForbiddenException(
        "Current replay sharing permission required",
      );
    const consent = isYoungChild(policy)
      ? await tx.consent.findUnique({ where: { childId: user.id } })
      : null;
    if (
      row &&
      (row.guardianRequired !== isYoungChild(policy) ||
        row.reviewRequired !== policy.age < 18 ||
        (row.guardianRequired &&
          (!row.guardianId || consent?.guardianId !== row.guardianId)))
    )
      throw new ConflictException(
        "Sharing conditions changed; prepare a new replay",
      );
    return { policy, consent };
  }
  private source(row: Prisma.AttemptGetPayload<{ include: typeof include }>) {
    if (row.status !== "APPROVED" || !["race", "daily"].includes(row.room.mode))
      throw new NotFoundException("Approved saved solve is unavailable");
    const input = archivedReplayInput(row);
    if (!input)
      throw new NotFoundException("Complete saved move replay required");
    let source;
    try {
      source = ReplaySource.parse({
        attemptId: row.id,
        puzzle: row.room.puzzle,
        input,
        mode: row.room.mode,
        durationMs: row.durationMs,
        createdAt: row.createdAt.toISOString(),
        scramble: row.scramble,
        events: row.moves,
        ...(input === "smart" ? { smart: row.smart } : {}),
      });
    } catch {
      throw new ConflictException("Saved replay is inconsistent");
    }
    return {
      source,
      digest: hash(
        JSON.stringify({
          source,
          version: row.version,
          smartSeenAt: row.smartSeenAt,
          scrambleVerifiedAt: row.scrambleVerifiedAt,
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
        }),
      ),
    };
  }
  private async archive(attemptId: string, userId: string) {
    const row = await this.db.attempt.findFirst({
      where: { id: attemptId, userId },
      include,
    });
    if (!row) throw new NotFoundException("Saved replay unavailable");
    const source = this.source(row),
      packet = await this.replays.validate(source.source);
    return { ...source, packet };
  }
  private async current(tx: Tx, row: ReplayShare) {
    const attempt = await tx.attempt.findFirst({
      where: { id: row.attemptId, userId: row.userId },
      include,
    });
    if (!attempt || this.source(attempt).digest !== row.sourceDigest)
      throw new ConflictException("Source solve changed; prepare a new share");
    const packet = ReplayPacket.parse(row.packet);
    if (
      packet.attemptId !== row.id ||
      packet.createdAt !== row.createdAt.toISOString() ||
      hash(JSON.stringify(packet)) !== row.packetDigest
    )
      throw new ConflictException("Shared replay snapshot changed");
    if (row.expiresAt <= new Date())
      throw new ConflictException("Replay sharing window expired");
    return packet;
  }
  private view(row: ReplayShare, role: Role = "owner"): ReplayShareView {
    const p = ReplayPacket.parse(row.packet);
    return {
      id: row.id,
      ...(role === "owner" ? { attemptId: row.attemptId } : {}),
      puzzle: p.puzzle,
      input: p.input,
      mode: p.mode,
      durationMs: p.durationMs,
      status: row.status as ReplayShareView["status"],
      revision: row.revision,
      packetDigest: row.packetDigest,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      reason: row.reason,
      expired: row.expiresAt <= new Date(),
    };
  }
  private async owned(tx: Tx, r: Authed, id: string, role: Role) {
    const actor = await this.actor(tx, r, role),
      row = await tx.replayShare.findFirst({
        where: {
          id: z.string().uuid().parse(id),
          ...(role === "owner"
            ? { userId: actor.id }
            : role === "guardian"
              ? { guardianId: actor.id }
              : {}),
          user: { region: this.infra.config.REGION, deletedAt: null },
        },
        include: { user: true },
      });
    if (!row) throw new NotFoundException("Replay share unavailable");
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
        throw new NotFoundException("Current linked child required");
    }
    return { row, actor };
  }
  async list(r: Authed, role: Role, query: unknown) {
    await this.limit(r, "list", 60);
    const b = cursor.parse(query),
      actor = await this.actor(this.db, r, role);
    if (role !== "owner") this.gates();
    const where: Prisma.ReplayShareWhereInput = {
      ...(role === "owner"
        ? { userId: actor.id }
        : role === "guardian"
          ? { guardianId: actor.id }
          : { status: { in: ["PENDING_REVIEW", "READY"] } }),
      createdAt: { gt: new Date(Date.now() - 30 * DAY) },
      user: { deletedAt: null, region: this.infra.config.REGION },
    };
    if (
      b.cursor &&
      !(await this.db.replayShare.findFirst({
        where: { ...where, id: b.cursor },
      }))
    )
      throw new BadRequestException("Invalid review cursor");
    const rows = await this.db.replayShare.findMany({
      where,
      include: { user: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
      ...(b.cursor ? { cursor: { id: b.cursor }, skip: 1 } : {}),
    });
    const items = [];
    for (const row of rows.slice(0, 30)) {
      if (role === "guardian") {
        try {
          await this.owned(this.db, r, row.id, role);
        } catch {
          continue;
        }
      }
      items.push({
        ...this.view(row, role),
        ...(role !== "owner"
          ? { subject: { id: row.user.id, displayName: row.user.displayName } }
          : {}),
      });
    }
    return { items, nextCursor: rows.length > 30 ? rows[29].id : null };
  }
  async prepare(r: Authed, body: unknown) {
    const b = PrepareReplayShare.parse(body);
    await this.limit(r, "prepare", 10, DAY / 1000);
    const user = await this.actor(this.db, r, "owner");
    await this.owner(this.db, user);
    const archive = await this.archive(b.attemptId, user.id),
      id = randomUUID(),
      createdAt = new Date(),
      packet = ReplayPacket.parse({
        ...archive.packet,
        attemptId: id,
        createdAt: createdAt.toISOString(),
      }),
      packetDigest = hash(JSON.stringify(packet));
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "post",
      [],
      async (tx, actor) => {
        const fresh = await this.owner(tx, actor.user),
          attempt = await tx.attempt.findFirst({
            where: { id: b.attemptId, userId: actor.user.id },
            include,
          });
        if (!attempt || this.source(attempt).digest !== archive.digest)
          throw new ConflictException("Source solve changed; retry sharing");
        if (
          (await tx.replayShare.count({
            where: {
              userId: actor.user.id,
              createdAt: { gt: new Date(Date.now() - 30 * DAY) },
            },
          })) >= 30 ||
          (await tx.replayShare.count({
            where: {
              userId: actor.user.id,
              status: { in: active },
              expiresAt: { gt: new Date() },
            },
          })) >= 10
        )
          throw new BadRequestException(
            "Keep at most ten active and thirty recent replay shares",
          );
        const row = await tx.replayShare.create({
          data: {
            id,
            userId: actor.user.id,
            attemptId: b.attemptId,
            guardianId: fresh.consent?.guardianId ?? null,
            guardianRequired: isYoungChild(fresh.policy),
            reviewRequired: fresh.policy.age < 18,
            packet: packet as unknown as Prisma.InputJsonValue,
            packetDigest,
            sourceDigest: archive.digest,
            status: isYoungChild(fresh.policy)
              ? "PENDING_GUARDIAN"
              : fresh.policy.age < 18
                ? "PENDING_REVIEW"
                : "READY",
            createdAt,
            expiresAt: new Date(createdAt.getTime() + 7 * DAY),
          },
        });
        if (row.guardianId)
          await notifyUser(
            tx,
            actor.user.region,
            row.guardianId,
            "REVIEW",
            "Replay sharing review / 回放分享审核",
            "A linked child's anonymous replay awaits review. / 关联儿童的匿名回放等待审核。",
          );
        return this.view(row);
      },
    );
  }
  private async write<T>(
    r: Authed,
    id: string,
    role: Role,
    action: (tx: Tx, row: ReplayShare & { user: User }) => Promise<T>,
  ) {
    const known = await this.owned(this.db, r, id, role);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      role === "staff" ? "staff" : role === "owner" ? "post" : "learn",
      [known.row.userId],
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ReplayShare" WHERE id=${known.row.id}::uuid FOR UPDATE`;
        const { row } = await this.owned(tx, r, id, role);
        const result = await action(tx, row);
        if (row.expiresAt <= new Date())
          throw new ConflictException(
            "Replay share expired during this action",
          );
        return result;
      },
    );
  }
  async preview(
    r: Authed,
    id: string,
    role: Role,
    body: unknown,
  ): Promise<ReplaySharePreview> {
    z.object({}).strict().parse(body);
    await this.limit(r, "preview", 20);
    const known = await this.owned(this.db, r, id, role);
    await this.owner(this.db, known.row.user, known.row);
    const archive = await this.archive(known.row.attemptId, known.row.userId);
    const result = await this.write(r, id, role, async (tx, row) => {
      await this.owner(tx, row.user, row);
      if (
        !active.includes(row.status) ||
        row.revision !== known.row.revision ||
        archive.digest !== row.sourceDigest
      )
        throw new ConflictException("Replay share changed; refresh");
      const packet = await this.current(tx, row);
      return {
        packet,
        revision: row.revision,
        packetDigest: row.packetDigest,
        expiresAt: row.expiresAt.toISOString(),
      };
    });
    const receipt = opaque();
    await this.infra.redis.set(
      `replay-preview:${hash(receipt)}`,
      JSON.stringify({
        id: known.row.id,
        user: r.user.id,
        session: r.sessionId,
        role,
        revision: result.revision,
        digest: result.packetDigest,
      }),
      "EX",
      120,
    );
    return { ...result, receipt };
  }
  async review(
    r: Authed,
    id: string,
    role: "guardian" | "staff",
    body: unknown,
  ) {
    id = z.string().uuid().parse(id).toLowerCase();
    const b = ReplayShareApproval.parse(body);
    await this.limit(r, "review");
    const receipt = await this.infra.redis.get(
      `replay-preview:${hash(b.receipt)}`,
    );
    if (
      receipt !==
      JSON.stringify({
        id,
        user: r.user.id,
        session: r.sessionId,
        role,
        revision: b.revision,
        digest: b.packetDigest,
      })
    )
      throw new ConflictException(
        "Preview the current replay before reviewing",
      );
    return this.write(r, id, role, async (tx, row) => {
      if (
        row.revision !== b.revision ||
        row.packetDigest !== b.packetDigest ||
        row.expiresAt <= new Date() ||
        !(
          b.approve
            ? [role === "guardian" ? "PENDING_GUARDIAN" : "PENDING_REVIEW"]
            : role === "guardian"
              ? active
              : ["PENDING_REVIEW", "READY"]
        ).includes(row.status)
      )
        throw new ConflictException("Review changed or expired");
      if (b.approve) {
        await this.owner(tx, row.user, row);
        await this.current(tx, row);
      }
      if (!b.approve)
        await this.withdraw(tx, row, r, "replay-share.reject", "REJECTED");
      else
        await tx.replayShare.update({
          where: { id: row.id },
          data: {
            status: role === "guardian" ? "PENDING_REVIEW" : "READY",
            revision: { increment: 1 },
            reason: null,
            ...(role === "guardian"
              ? { guardianApprovedAt: new Date() }
              : { reviewerId: r.user.id }),
          },
        });
      if (!b.approve)
        await tx.replayShare.update({
          where: { id: row.id },
          data: { reason: b.reason },
        });
      await tx.audit.create({
        data: {
          actorId: r.user.id,
          action:
            role === "guardian"
              ? "replay-share.guardian-review"
              : "replay-share.review",
          targetId: row.id,
          detail: {
            approved: b.approve,
            packetDigest: row.packetDigest,
            revision: b.revision,
          },
        },
      });
      await notifyUser(
        tx,
        row.user.region,
        row.userId,
        "REVIEW",
        "Replay sharing status / 回放分享状态",
        "Your replay sharing review changed. / 你的回放分享审核状态已更新。",
      );
      return this.view(
        await tx.replayShare.findUniqueOrThrow({ where: { id: row.id } }),
        role,
      );
    });
  }
  private async withdraw(
    tx: Tx,
    row: ReplayShare,
    r: Authed,
    action: string,
    decision: "CANCELLED" | "REJECTED" = "CANCELLED",
  ) {
    if (row.expiresAt <= new Date()) {
      await tx.replayShare.updateMany({
        where: { id: row.id, status: { in: active } },
        data: {
          status: "EXPIRED",
          tokenHash: null,
          revision: { increment: 1 },
        },
      });
      return;
    }
    const durable = await recordMediaRecovery(
      tx,
      this.infra.config,
      row.userId,
      { kind: "REPLAY_SHARE_WITHDRAWAL", shareId: row.id, decision },
      new Date(Math.min(row.expiresAt.getTime(), Date.now() + 30 * DAY)),
    );
    if (!durable)
      await tx.replayShare.updateMany({
        where: { id: row.id, status: { in: active } },
        data: { status: decision, tokenHash: null, revision: { increment: 1 } },
      });
    await tx.audit.create({
      data: {
        actorId: r.user.id,
        action,
        targetId: row.id,
        detail: { withdrawn: true },
      },
    });
  }
  async cancel(r: Authed, id: string, body: unknown) {
    z.object({}).strict().parse(body);
    await this.limit(r, "cancel");
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.user.id}::uuid FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Session" WHERE id=${r.sessionId}::uuid FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "ReplayShare" WHERE id=${z.string().uuid().parse(id)}::uuid FOR UPDATE`;
      const { row } = await this.owned(tx, r, id, "owner");
      if (active.includes(row.status)) {
        await this.withdraw(tx, row, r, "replay-share.cancel");
      }
      await this.actor(tx, r, "owner");
      return { ok: true };
    });
  }
  async publish(r: Authed, id: string, body: unknown) {
    const b = ReplaySharePublish.parse(body);
    await this.limit(r, "publish", 10);
    const known = await this.owned(this.db, r, id, "owner");
    await this.owner(this.db, known.row.user, known.row);
    const archive = await this.archive(known.row.attemptId, known.row.userId);
    return this.write(r, id, "owner", async (tx, row) => {
      await this.owner(tx, row.user, row);
      if (
        row.status !== "READY" ||
        row.revision !== b.revision ||
        row.packetDigest !== b.packetDigest ||
        archive.digest !== row.sourceDigest
      )
        throw new ConflictException("Current approved replay required");
      await this.current(tx, row);
      const key = opaque(),
        changed = await tx.replayShare.update({
          where: { id },
          data: { tokenHash: hash(key), revision: { increment: 1 } },
        });
      return {
        share: this.view(changed),
        key,
        community: this.infra.config.REGION,
      };
    });
  }
  async open(r: Authed, body: unknown) {
    const b = OpenReplayShare.parse(body);
    await this.limit(r, "open", 20);
    this.gates();
    const known = await this.db.replayShare.findUnique({
      where: { id: b.id },
      include: { user: true },
    });
    const matches = (row: ReplayShare) =>
      !!row.tokenHash &&
      timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(hash(b.key)));
    if (
      !known ||
      known.status !== "READY" ||
      known.expiresAt <= new Date() ||
      !matches(known)
    )
      throw new NotFoundException("Shared replay unavailable");
    await this.owner(this.db, known.user, known);
    const archive = await this.archive(known.attemptId, known.userId);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "learn",
      [known.userId],
      async (tx, actor) => {
        this.gates();
        await tx.$queryRaw`SELECT id FROM "ReplayShare" WHERE id=${b.id}::uuid FOR SHARE`;
        const row = await tx.replayShare.findUnique({
          where: { id: b.id },
          include: { user: true },
        });
        if (
          !row ||
          row.status !== "READY" ||
          row.expiresAt <= new Date() ||
          row.revision !== known.revision ||
          !matches(row) ||
          archive.digest !== row.sourceDigest
        )
          throw new NotFoundException("Shared replay unavailable");
        await this.owner(tx, row.user, row);
        const packet = await this.current(tx, row);
        if (
          await tx.social.findFirst({
            where: {
              kind: "block",
              OR: [
                {
                  actorId: actor.user.id,
                  targetId: { equals: row.userId, mode: "insensitive" },
                },
                {
                  actorId: row.userId,
                  targetId: { equals: actor.user.id, mode: "insensitive" },
                },
              ],
            },
          })
        )
          throw new NotFoundException("Shared replay unavailable");
        if (row.expiresAt <= new Date())
          throw new NotFoundException("Shared replay expired");
        return { packet, expiresAt: row.expiresAt.toISOString() };
      },
    );
  }
}
