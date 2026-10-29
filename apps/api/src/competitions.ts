import { SmartPlayAccess } from "./smart-play-access";
import { communityWrite } from "./community-authority";
import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  Prisma,
  type User,
  type Competition,
  type CompetitionEntry,
  type CompetitionPublication,
  type Attempt,
  type Room,
} from "@prisma/client";
import { z } from "zod";
import {
  CompetitionDefinition,
  CompetitionRegister,
  CompetitionShare,
  CompetitionReview,
  competitionAttemptCount,
  competitionScore,
  permissions,
  isYoungChild,
  Puzzle,
  type CompetitionFormat,
  type CompetitionSlot,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { accountPolicy, eligibleGuardian, type Authed } from "./security";
import { hash, opaque } from "./crypto";
import { notifyUser } from "./notifications";
type Tx = Prisma.TransactionClient;
type Audience = "owner" | "guardian" | "staff";
const Id = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());
const Version = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
const Scope = z.union([z.literal("overall"), Id]);
const activeStatuses = ["CREATED", "INSPECTION", "SOLVING"];
@Injectable()
export class Competitions {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(SmartPlayAccess)
    private smartAccess: SmartPlayAccess = new SmartPlayAccess(),
  ) {}
  private available(ranked = false) {
    if (this.infra.playIntegrityUnavailable)
      throw new ServiceUnavailableException(
        "Play integrity reconciliation required",
      );
    if (
      this.infra.config.REGION === "CN" &&
      this.infra.config.CN_GAMES_APPROVED !== "true"
    )
      throw new ForbiddenException(
        "Mainland game classification and operating review are required",
      );
    if (ranked && this.infra.config.NODE_ENV === "production")
      throw new ForbiddenException(
        "Ranked production play requires verified app-attestation integration",
      );
  }
  private write<T>(
    r: Authed,
    input: string,
    staff: boolean,
    work: (tx: Tx) => Promise<T>,
  ) {
    return input === "smart"
      ? communityWrite(
          this.db,
          this.infra.config,
          r,
          staff ? "admin" : "learn",
          [],
          (tx) => work(tx),
        )
      : this.db.$transaction(work);
  }
  private async eventWrite<T>(
    r: Authed,
    id: string,
    staff: boolean,
    work: (tx: Tx) => Promise<T>,
  ) {
    const row = await this.db.competition.findUnique({
      where: { id: Id.parse(id) },
      select: { input: true },
    });
    if (!row) throw new NotFoundException("Competition unavailable");
    return this.write(r, row.input, staff, work);
  }
  private inputAvailable(event: Pick<Competition, "input" | "puzzle">) {
    if (event.input === "smart") this.smartAccess.room(event.puzzle);
  }
  private async limit(r: Authed) {
    if (!(await this.infra.limit(`competition-write:${r.user.id}`, 120, 3600)))
      throw new HttpException("Competition action limit reached", 429);
  }
  /** Always lock users before competition rows. Consent is re-read after its lock. */
  private async actor(tx: Tx, r: Authed, ownerId = r.user.id, staff = false) {
    const initial = await tx.consent.findUnique({
      where: { childId: ownerId },
    });
    const ids = [
      ...new Set([
        r.user.id,
        ownerId,
        ...(initial ? [initial.guardianId] : []),
      ]),
    ].sort();
    for (const id of ids)
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id}::uuid FOR SHARE`;
    if (initial)
      await tx.$queryRaw`SELECT id FROM "Consent" WHERE id=${initial.id}::uuid FOR SHARE`;
    const consent = await tx.consent.findUnique({
      where: { childId: ownerId },
    });
    if ((consent?.guardianId ?? null) !== (initial?.guardianId ?? null))
      throw new ConflictException("Guardian relationship changed; reload");
    const session = await tx.session.findUnique({
      where: { id: r.sessionId },
      include: { user: true },
    });
    const user = session?.user;
    if (
      !session ||
      !user ||
      user.deletedAt ||
      !user.emailVerified ||
      user.region !== this.infra.config.REGION ||
      session.userId !== r.user.id ||
      session.scope !== "FULL" ||
      session.expiresAt <= new Date()
    )
      throw new ForbiddenException("Current account access required");
    if (
      staff &&
      (!["ADMIN", "MODERATOR"].includes(user.role) ||
        !user.mfaSecret ||
        !session.mfaVerified ||
        user.mfaGeneration !== r.user.mfaGeneration)
    )
      throw new ForbiddenException("Current staff MFA required");
    const owner =
      ownerId === user.id
        ? user
        : await tx.user.findUnique({ where: { id: ownerId } });
    if (
      !owner ||
      owner.deletedAt ||
      !owner.emailVerified ||
      owner.region !== this.infra.config.REGION
    )
      throw new ForbiddenException("Current participant account required");
    return { user, owner, consent, policy: await accountPolicy(tx, owner) };
  }
  async evidenceReviewer(tx: Tx, r: Authed, ownerId: string) {
    const state = await this.actor(tx, r, ownerId, true);
    if (
      state.user.id === ownerId ||
      state.user.id === state.consent?.guardianId
    )
      throw new ForbiddenException("Independent evidence reviewer required");
  }
  async lockEvidenceCompetition(tx: Tx, attemptId: string) {
    const a = await tx.attempt.findUnique({
      where: { id: attemptId },
      include: { room: { include: { competitionEntry: true } } },
    });
    const entry = a?.room.competitionEntry;
    if (a?.room.competitionAttempt && entry)
      await this.event(tx, entry.competitionId, true);
  }
  async correctedResult(
    tx: Tx,
    attemptId: string,
    previous: string,
    next: string,
  ) {
    if (previous === next || ![previous, next].includes("APPROVED")) return;
    const a = await tx.attempt.findUnique({
      where: { id: attemptId },
      include: { room: { include: { competitionEntry: true } } },
    });
    const entry = a?.room.competitionEntry;
    if (!entry || !a.room.competitionAttempt) return;
    await tx.competitionPublication.updateMany({
      where: {
        entryId: entry.id,
        scope: { in: ["overall", a.room.competitionRoundId!] },
        status: { notIn: ["CANCELLED", "REJECTED"] },
      },
      data: {
        status: "CANCELLED",
        revision: { increment: 1 },
        reason: "Verified result changed; fresh sharing approval is required",
      },
    });
    const affected = await tx.competitionEntry.findMany({
      where: {
        competitionId: entry.competitionId,
        userId: { not: entry.userId },
        status: "REGISTERED",
        publications: { some: { status: "READY" } },
      },
      select: { userId: true },
    });
    for (const row of affected)
      await notifyUser(
        tx,
        this.infra.config.REGION,
        row.userId,
        "SYSTEM",
        "Competition standings corrected · 比赛榜单已更正",
        "A reviewed result changed. Refresh the shared competition board for current placements. · 审核成绩有变更，请刷新分享榜单查看当前名次。",
      );
  }
  private async event(tx: Tx, id: string, exclusive = false) {
    id = Id.parse(id);
    if (exclusive)
      await tx.$queryRaw`SELECT id FROM "Competition" WHERE id=${id}::uuid FOR UPDATE`;
    else
      await tx.$queryRaw`SELECT id FROM "Competition" WHERE id=${id}::uuid FOR SHARE`;
    const event = await tx.competition.findUnique({
      where: { id },
      include: { rounds: { orderBy: { ordinal: "asc" } } },
    });
    if (!event || event.expiresAt <= new Date())
      throw new NotFoundException("Competition unavailable");
    return event;
  }
  private async learn(tx: Tx, user: User, physical: boolean) {
    const policy = await accountPolicy(tx, user);
    if (
      !permissions(policy).canLearn ||
      (physical && !permissions(policy).canRecord)
    )
      throw new ForbiddenException(
        "Current learning and recording permission required",
      );
  }
  private publicEvent(
    row: Competition & {
      rounds: {
        id: string;
        ordinal: number;
        title: Prisma.JsonValue;
        format: string;
        opensAt: Date;
        closesAt: Date;
      }[];
    },
  ) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      puzzle: row.puzzle,
      input: row.input,
      ranked: row.ranked,
      capacity: row.capacity,
      status: row.status,
      version: row.version,
      registrationOpensAt: row.registrationOpensAt,
      registrationClosesAt: row.registrationClosesAt,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      expiresAt: row.expiresAt,
      rounds: row.rounds.map(
        ({ id, ordinal, title, format, opensAt, closesAt }) => ({
          id,
          ordinal,
          title,
          format,
          opensAt,
          closesAt,
        }),
      ),
    };
  }
  async list(r: Authed, raw: unknown, staff = false) {
    const q = z
      .object({
        cursor: z
          .string()
          .regex(/^\d{13}_[0-9a-f-]{36}$/)
          .optional(),
        mine: z.enum(["true"]).optional(),
      })
      .strict()
      .parse(raw);
    const boundary = q.cursor
      ? {
          date: new Date(Number(q.cursor.slice(0, 13))),
          id: Id.parse(q.cursor.slice(14)),
        }
      : null;
    if (!staff) this.available();
    return this.db.$transaction(async (tx) => {
      const { user } = await this.actor(tx, r, r.user.id, staff);
      const rows = await tx.competition.findMany({
        where: {
          expiresAt: { gt: new Date() },
          ...(staff
            ? {}
            : {
                status: { in: ["PUBLISHED", "CANCELLED"] },
                ...(!q.mine ? { endsAt: { gte: new Date() } } : {}),
              }),
          ...(q.mine ? { entries: { some: { userId: r.user.id } } } : {}),
          ...(boundary
            ? {
                OR: [
                  { startsAt: { gt: boundary.date } },
                  { startsAt: boundary.date, id: { gt: boundary.id } },
                ],
              }
            : {}),
        },
        include: { rounds: { orderBy: { ordinal: "asc" } } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 31,
      });
      return {
        canManage: staff && user.role === "ADMIN",
        items: rows.slice(0, 30).map((row) => this.publicEvent(row)),
        nextCursor:
          rows.length > 30
            ? `${rows[29].startsAt.getTime()}_${rows[29].id}`
            : null,
      };
    });
  }
  async create(r: Authed, raw: unknown) {
    await this.limit(r);
    const b = CompetitionDefinition.parse(raw),
      now = Date.now();
    if (
      Date.parse(b.registrationClosesAt) <= now ||
      Date.parse(b.rounds.at(-1)!.closesAt) > now + 180 * 86400000
    )
      throw new BadRequestException("Use a future schedule within 180 days");
    return this.write(r, b.input, true, async (tx) => {
      const { user } = await this.actor(tx, r, r.user.id, true);
      if (user.role !== "ADMIN")
        throw new ForbiddenException("Administrator role required");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(83472108)`;
      if (
        (await tx.competition.count({
          where: { expiresAt: { gt: new Date() } },
        })) >= 500
      )
        throw new BadRequestException("Regional competition limit reached");
      const event = await tx.competition.create({
        data: {
          creatorId: user.id,
          title: b.title,
          description: b.description,
          puzzle: b.puzzle,
          input: b.input,
          ranked: b.ranked,
          capacity: b.capacity,
          registrationOpensAt: new Date(b.registrationOpensAt),
          registrationClosesAt: new Date(b.registrationClosesAt),
          startsAt: new Date(b.rounds[0].opensAt),
          endsAt: new Date(b.rounds.at(-1)!.closesAt),
          expiresAt: new Date(
            Date.parse(b.rounds.at(-1)!.closesAt) + 180 * 86400000,
          ),
          rounds: {
            create: b.rounds.map((round, ordinal) => ({
              title: round.title,
              format: round.format,
              ordinal,
              opensAt: new Date(round.opensAt),
              closesAt: new Date(round.closesAt),
              scrambles: [],
            })),
          },
        },
        include: { rounds: { orderBy: { ordinal: "asc" } } },
      });
      await tx.audit.create({
        data: {
          actorId: user.id,
          action: "competition.create",
          targetId: event.id,
          detail: { version: event.version },
        },
      });
      return this.publicEvent(event);
    });
  }
  async publish(r: Authed, id: string, raw: unknown) {
    const b = z
      .object({
        expectedVersion: z.number().int().positive(),
        englishReviewed: z.literal(true),
        chineseReviewed: z.literal(true),
        rulesReviewed: z.literal(true),
        rightsConfirmed: z.literal(true),
      })
      .strict()
      .parse(raw);
    await this.limit(r);
    const prepare = async (tx: Tx) => {
      const { user } = await this.actor(tx, r, r.user.id, true);
      if (user.role !== "ADMIN")
        throw new ForbiddenException("Administrator role required");
      const event = await this.event(tx, id, true);
      this.available(event.ranked);
      this.inputAvailable(event);
      if (
        event.status !== "DRAFT" ||
        event.version !== b.expectedVersion ||
        event.registrationClosesAt <= new Date()
      )
        throw new ConflictException("Draft changed or registration closed");
      return event;
    };
    const original = await this.eventWrite(r, id, true, prepare);
    const generated = await this.infra.scrambles.generate(
      Puzzle.parse(original.puzzle),
      original.rounds.reduce(
        (n, round) =>
          n + competitionAttemptCount[round.format as CompetitionFormat],
        0,
      ),
    );
    return this.eventWrite(r, id, true, async (tx) => {
      const event = await prepare(tx);
      if (
        event.puzzle !== original.puzzle ||
        JSON.stringify(event.rounds.map((x) => [x.id, x.format])) !==
          JSON.stringify(original.rounds.map((x) => [x.id, x.format]))
      )
        throw new ConflictException(
          "Round definition changed; reopen publication",
        );
      let offset = 0;
      for (const round of event.rounds)
        await tx.competitionRound.update({
          where: { id: round.id },
          data: {
            scrambles: generated.scrambles.slice(
              offset,
              (offset +=
                competitionAttemptCount[round.format as CompetitionFormat]),
            ),
            scrambleSource: generated.source,
          },
        });
      await tx.competition.update({
        where: { id },
        data: { status: "PUBLISHED", version: { increment: 1 } },
      });
      await tx.audit.create({
        data: {
          actorId: r.user.id,
          action: "competition.publish",
          targetId: id,
          detail: b,
        },
      });
      await this.actor(tx, r, r.user.id, true);
      if (
        event.input === "smart" &&
        Date.now() >= event.registrationClosesAt.getTime()
      )
        throw new ConflictException(
          "Registration closed while publishing; no schedule was published",
        );
      return { ok: true };
    });
  }
  async cancel(r: Authed, id: string, raw: unknown) {
    const b = z
      .object({
        expectedVersion: z.number().int().positive(),
        reason: z.string().trim().min(10).max(1000),
      })
      .strict()
      .parse(raw);
    await this.limit(r);
    return this.eventWrite(r, id, true, async (tx) => {
      const { user } = await this.actor(tx, r, r.user.id, true);
      if (user.role !== "ADMIN")
        throw new ForbiddenException("Administrator role required");
      const event = await this.event(tx, id, true);
      if (event.version !== b.expectedVersion || event.status === "CANCELLED")
        throw new ConflictException("Competition changed");
      await tx.competition.update({
        where: { id },
        data: { status: "CANCELLED", version: { increment: 1 } },
      });
      await tx.competitionPublication.updateMany({
        where: { entry: { competitionId: id } },
        data: { status: "CANCELLED", revision: { increment: 1 } },
      });
      await tx.attempt.updateMany({
        where: {
          room: { competitionEntry: { competitionId: id } },
          status: { in: activeStatuses },
        },
        data: {
          status: "INTERRUPTED",
          reason: "Scheduled competition cancelled",
          version: { increment: 1 },
        },
      });
      await tx.audit.create({
        data: {
          actorId: user.id,
          action: "competition.cancel",
          targetId: id,
          detail: { reason: b.reason },
        },
      });
      const entries = await tx.competitionEntry.findMany({
        where: { competitionId: id, status: "REGISTERED" },
        select: { userId: true },
      });
      for (const entry of entries)
        await notifyUser(
          tx,
          this.infra.config.REGION,
          entry.userId,
          "SYSTEM",
          "Competition cancelled · 比赛已取消",
          "Open your competition schedule for its current status. Private solve history is retained. · 请查看比赛安排，私密还原记录将保留。",
        );
      return { ok: true };
    });
  }
  async register(r: Authed, id: string, raw: unknown) {
    const b = CompetitionRegister.parse(raw);
    await this.limit(r);
    this.available();
    return this.eventWrite(r, id, false, async (tx) => {
      const { user } = await this.actor(tx, r);
      const event = await this.event(tx, id, true);
      this.available(event.ranked);
      this.inputAvailable(event);
      await this.learn(tx, user, event.ranked && event.input !== "virtual");
      const now = new Date();
      if (
        event.status !== "PUBLISHED" ||
        event.version !== b.expectedVersion ||
        now < event.registrationOpensAt ||
        now >= event.registrationClosesAt
      )
        throw new ConflictException("Registration is not open");
      const old = await tx.competitionEntry.findUnique({
        where: { competitionId_userId: { competitionId: id, userId: user.id } },
      });
      if (old?.status === "REGISTERED")
        return { id: old.id, number: old.number, status: old.status };
      if (
        (await tx.competitionEntry.count({
          where: { competitionId: id, status: "REGISTERED" },
        })) >= event.capacity
      )
        throw new ConflictException("Competition is full");
      if (!old && event.nextNumber > 1000)
        throw new ConflictException("Competition registration history is full");
      const entry = old
        ? await tx.competitionEntry.update({
            where: { id: old.id },
            data: { status: "REGISTERED" },
          })
        : await tx.competitionEntry.create({
            data: {
              competitionId: id,
              userId: user.id,
              number: event.nextNumber,
            },
          });
      if (!old)
        await tx.competition.update({
          where: { id },
          data: { nextNumber: { increment: 1 } },
        });
      if (
        event.input === "smart" &&
        Date.now() >= event.registrationClosesAt.getTime()
      )
        throw new ConflictException(
          "Registration closed while saving; no entry was committed",
        );
      return { id: entry.id, number: entry.number, status: entry.status };
    });
  }
  async withdraw(r: Authed, id: string, raw: unknown) {
    z.object({ confirmation: z.literal("WITHDRAW") })
      .strict()
      .parse(raw);
    await this.limit(r);
    return this.eventWrite(r, id, false, async (tx) => {
      await this.actor(tx, r);
      await this.event(tx, id, true);
      const entry = await tx.competitionEntry.findUnique({
        where: {
          competitionId_userId: { competitionId: id, userId: r.user.id },
        },
      });
      if (!entry) throw new NotFoundException();
      await tx.competitionEntry.update({
        where: { id: entry.id },
        data: { status: "WITHDRAWN" },
      });
      await tx.competitionPublication.updateMany({
        where: { entryId: entry.id },
        data: { status: "CANCELLED", revision: { increment: 1 } },
      });
      await tx.attempt.updateMany({
        where: {
          room: { competitionEntryId: entry.id },
          status: { in: activeStatuses },
        },
        data: {
          status: "INTERRUPTED",
          reason: "Participant withdrew",
          version: { increment: 1 },
        },
      });
      return { ok: true };
    });
  }
  async enter(r: Authed, id: string, roundId: string, raw: unknown) {
    roundId = Id.parse(roundId);
    const b = z
      .object({ index: z.number().int().min(0).max(4) })
      .strict()
      .parse(raw);
    await this.limit(r);
    this.available();
    return this.eventWrite(r, id, false, async (tx) => {
      const { user } = await this.actor(tx, r);
      const event = await this.event(tx, id, true);
      this.available(event.ranked);
      this.inputAvailable(event);
      await this.learn(tx, user, event.ranked && event.input !== "virtual");
      const round = event.rounds.find((x) => x.id === roundId),
        now = new Date();
      if (
        event.status !== "PUBLISHED" ||
        !round ||
        now < round.opensAt ||
        now >= round.closesAt ||
        b.index >= competitionAttemptCount[round.format as CompetitionFormat]
      )
        throw new ConflictException("Round is not open for this attempt");
      const entry = await tx.competitionEntry.findUnique({
        where: { competitionId_userId: { competitionId: id, userId: user.id } },
      });
      if (entry?.status !== "REGISTERED")
        throw new ForbiddenException("Active registration required");
      const key = {
        competitionEntryId: entry.id,
        competitionRoundId: roundId,
        competitionIndex: b.index,
      };
      const existing = await tx.room.findUnique({
        where: { competitionEntryId_competitionRoundId_competitionIndex: key },
        include: { attempts: true },
      });
      if (existing)
        return { roomId: existing.id, attempt: existing.attempts[0] };
      const previous = await tx.room.findMany({
        where: { competitionEntryId: entry.id, competitionRoundId: roundId },
        include: { attempts: true },
      });
      if (
        previous.length !== b.index ||
        previous.some((room) =>
          room.attempts.some((a) =>
            [...activeStatuses, "AWAITING_EVIDENCE"].includes(a.status),
          ),
        )
      )
        throw new ConflictException(
          "Complete or interrupt the previous attempt first",
        );
      const room = await tx.room.create({
        data: {
          ...key,
          competitionAttempt: true,
          ownerId: user.id,
          code: opaque().slice(0, 20),
          puzzle: event.puzzle,
          input: event.input,
          mode: "race",
          ranked: event.ranked,
          private: true,
          status: "ACTIVE",
          roster: [user.id],
        },
      });
      await tx.roomMember.create({
        data: { roomId: room.id, userId: user.id },
      });
      const scramble = (round.scrambles as string[][])[b.index];
      if (!scramble?.length)
        throw new ConflictException("Published scramble unavailable");
      if (Date.now() >= round.closesAt.getTime())
        throw new ConflictException(
          "Round deadline reached before attempt issuance",
        );
      const attempt = await tx.attempt.create({
        data: {
          userId: user.id,
          roomId: room.id,
          nonce: opaque(),
          scramble,
          ...(round.scrambleSource
            ? { scrambleSource: round.scrambleSource as Prisma.InputJsonValue }
            : {}),
          createdAt: new Date(),
        },
      });
      if (event.input === "smart" && Date.now() >= round.closesAt.getTime())
        throw new ConflictException(
          "Round closed while saving; no attempt was committed",
        );
      return { roomId: room.id, attempt };
    });
  }
  /** Used inside every attempt mutation, including WebSocket moves. */
  async guardAttempt(
    tx: Tx,
    r: Authed,
    room: Room,
    phase: "active" | "evidence" | "cleanup" = "active",
    attemptId?: string,
  ) {
    if (!room.competitionAttempt) return;
    const { user } = await this.actor(tx, r);
    const entry = room.competitionEntryId
      ? await tx.competitionEntry.findUnique({
          where: { id: room.competitionEntryId },
        })
      : null;
    if (!entry || entry.userId !== user.id || !room.competitionRoundId)
      throw new ForbiddenException("Competition attempt context expired");
    const event = await this.event(tx, entry.competitionId);
    await tx.$queryRaw`SELECT id FROM "CompetitionEntry" WHERE id=${entry.id}::uuid FOR SHARE`;
    const fresh = await tx.competitionEntry.findUnique({
      where: { id: entry.id },
    });
    const round = event.rounds.find((x) => x.id === room.competitionRoundId),
      now = new Date();
    if (attemptId)
      await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id=${attemptId}::uuid FOR UPDATE`;
    if (phase !== "cleanup") {
      this.available(event.ranked);
      this.inputAvailable(event);
      await this.learn(tx, user, event.ranked && event.input !== "virtual");
      if (
        event.status !== "PUBLISHED" ||
        fresh?.status !== "REGISTERED" ||
        !round
      )
        throw new ForbiddenException("Competition entry is not active");
      if (
        phase === "active" &&
        (Date.now() < round.opensAt.getTime() ||
          Date.now() >= round.closesAt.getTime())
      )
        throw new ConflictException(
          "Round deadline reached; no further solve actions are accepted",
        );
    }
    return phase === "active" ? round?.closesAt : undefined;
  }
  private async results(
    tx: Tx,
    event: Competition,
    entry: CompetitionEntry,
    scope: string,
  ) {
    const rounds = await tx.competitionRound.findMany({
      where: {
        competitionId: event.id,
        ...(scope === "overall" ? {} : { id: scope }),
      },
      orderBy: { ordinal: "asc" },
    });
    if (!rounds.length) throw new NotFoundException("Round not found");
    const rooms = await tx.room.findMany({
      where: {
        competitionEntryId: entry.id,
        competitionRoundId: { in: rounds.map((x) => x.id) },
      },
      include: { attempts: true },
      orderBy: { competitionIndex: "asc" },
    });
    const sources: unknown[] = [];
    const scores = rounds.map((round) => {
      const closed = Date.now() >= round.closesAt.getTime();
      const slots: CompetitionSlot[] = Array.from(
        { length: competitionAttemptCount[round.format as CompetitionFormat] },
        (_, index) => {
          const a = rooms.find(
            (room) =>
              room.competitionRoundId === round.id &&
              room.competitionIndex === index,
          )?.attempts[0];
          const pending =
            !!a &&
            ["AWAITING_EVIDENCE", "PROVISIONAL"].includes(a.status) &&
            Date.now() - a.createdAt.getTime() <= 30 * 86400000;
          const valid =
            !!a &&
            a.status === "APPROVED" &&
            a.durationMs !== null &&
            a.finishedAt !== null &&
            a.finishedAt <= round.closesAt &&
            a.createdAt >= round.opensAt;
          const slot: CompetitionSlot = valid
            ? { status: "APPROVED", durationMs: a!.durationMs! }
            : pending || !closed
              ? { status: "PENDING" }
              : a
                ? { status: "DNF" }
                : { status: "DNS" };
          sources.push({
            roundId: round.id,
            index,
            attemptId: a?.id ?? null,
            status: slot.status,
            durationMs: valid ? a!.durationMs : null,
          });
          return slot;
        },
      );
      return {
        roundId: round.id,
        ordinal: round.ordinal,
        title: round.title,
        format: round.format,
        closed,
        slots,
        score: competitionScore(round.format as CompetitionFormat, slots),
      };
    });
    const allClosed = scores.every((x) => x.closed),
      allScored = scores.every((x) => x.score.status === "SCORED");
    const status =
      scores.some((x) => x.score.status === "PENDING") || !allClosed
        ? "PENDING"
        : allScored
          ? "SCORED"
          : "DNF";
    const units =
      status === "SCORED"
        ? scores.reduce((sum, x) => sum + x.score.units!, 0)
        : null;
    const best = scores.flatMap((x) =>
      x.score.bestMs === null ? [] : [x.score.bestMs],
    );
    const snapshot = {
      competitionId: event.id,
      scope,
      number: entry.number,
      puzzle: event.puzzle,
      input: event.input,
      ranked: event.ranked,
      rounds: scores,
      score: { status, units, bestMs: best.length ? Math.min(...best) : null },
      allClosed,
    };
    return { snapshot, digest: hash(JSON.stringify({ snapshot, sources })) };
  }
  private async guardianLinked(tx: Tx, owner: User, guardianId: string) {
    const policy = await accountPolicy(tx, owner),
      consent = await tx.consent.findUnique({ where: { childId: owner.id } });
    return (
      !owner.deletedAt &&
      owner.emailVerified &&
      owner.region === this.infra.config.REGION &&
      isYoungChild(policy) &&
      policy.guardianVerified &&
      consent?.guardianId === guardianId
    );
  }
  private async shareEligibility(tx: Tx, user: User, physical = false) {
    const policy = await accountPolicy(tx, user);
    if (
      user.deletedAt ||
      !user.emailVerified ||
      user.region !== this.infra.config.REGION ||
      !permissions(policy).canLearn ||
      !permissions(policy).canPost ||
      (physical && !permissions(policy).canRecord) ||
      (policy.age >= 18 && !user.adultVerified) ||
      (user.region === "CN" && this.infra.config.CN_SOCIAL_APPROVED !== "true")
    )
      throw new ForbiddenException("Current score sharing permission required");
    const consent = await tx.consent.findUnique({
      where: { childId: user.id },
    });
    const young = isYoungChild(policy);
    const consentDigest =
      young && consent
        ? hash(
            JSON.stringify({
              guardianId: consent.guardianId,
              documentId: consent.documentId,
              reviewedAt: consent.reviewedAt,
              status: consent.status,
              publicPosting: consent.publicPosting,
            }),
          )
        : null;
    return {
      policy,
      guardianId: young ? (consent?.guardianId ?? null) : null,
      consentDigest,
    };
  }
  private async currentPublication(
    tx: Tx,
    pub: CompetitionPublication,
    entry: CompetitionEntry,
    event: Competition,
    user: User,
  ) {
    if (
      event.status !== "PUBLISHED" ||
      entry.status !== "REGISTERED" ||
      event.expiresAt <= new Date()
    )
      return false;
    try {
      const eligible = await this.shareEligibility(
        tx,
        user,
        event.ranked && event.input !== "virtual",
      );
      if (
        eligible.guardianId !== pub.guardianId ||
        eligible.consentDigest !== pub.consentDigest
      )
        return false;
      const result = await this.results(tx, event, entry, pub.scope);
      return (
        result.snapshot.allClosed &&
        result.snapshot.score.status !== "PENDING" &&
        result.digest === pub.resultDigest
      );
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      )
        return false;
      throw error;
    }
  }
  private publicationView(pub: CompetitionPublication, current: boolean) {
    return {
      id: pub.id,
      scope: pub.scope,
      status: pub.status,
      revision: pub.revision,
      digest: pub.resultDigest,
      snapshot: pub.snapshot,
      reason: pub.reason,
      current,
      createdAt: pub.createdAt,
    };
  }
  async detail(r: Authed, id: string, staff = false) {
    if (!staff) this.available();
    return this.db.$transaction(async (tx) => {
      const { user } = await this.actor(tx, r, r.user.id, staff);
      const event = await this.event(tx, id);
      if (!staff && event.status === "DRAFT") throw new NotFoundException();
      const entry = await tx.competitionEntry.findUnique({
        where: {
          competitionId_userId: { competitionId: id, userId: r.user.id },
        },
      });
      const publications = entry
        ? await tx.competitionPublication.findMany({
            where: { entryId: entry.id },
          })
        : [];
      const mine = entry
        ? {
            id: entry.id,
            number: entry.number,
            status: entry.status,
            results: (await this.results(tx, event, entry, "overall")).snapshot,
            digests: Object.fromEntries(
              await Promise.all(
                ["overall", ...event.rounds.map((round) => round.id)].map(
                  async (scope) => [
                    scope,
                    (await this.results(tx, event, entry, scope)).digest,
                  ],
                ),
              ),
            ),
            rooms: await tx.room.findMany({
              where: { competitionEntryId: entry.id },
              select: {
                id: true,
                competitionRoundId: true,
                competitionIndex: true,
                attempts: { select: { status: true, durationMs: true } },
              },
            }),
            publications: await Promise.all(
              publications.map(async (p) =>
                this.publicationView(
                  p,
                  await this.currentPublication(tx, p, entry, event, user),
                ),
              ),
            ),
          }
        : null;
      return {
        ...this.publicEvent(event),
        registeredCount: await tx.competitionEntry.count({
          where: { competitionId: id, status: "REGISTERED" },
        }),
        mine,
        canManage: staff && user.role === "ADMIN",
      };
    });
  }
  async share(r: Authed, id: string, raw: unknown) {
    const b = CompetitionShare.parse(raw);
    await this.limit(r);
    this.available();
    return this.db.$transaction(async (tx) => {
      const { user } = await this.actor(tx, r),
        event = await this.event(tx, id, true);
      const eligibility = await this.shareEligibility(
        tx,
        user,
        event.ranked && event.input !== "virtual",
      );
      const entry = await tx.competitionEntry.findUnique({
        where: { competitionId_userId: { competitionId: id, userId: user.id } },
      });
      if (event.status !== "PUBLISHED" || entry?.status !== "REGISTERED")
        throw new ForbiddenException(
          "Active competition registration required",
        );
      const result = await this.results(tx, event, entry, b.scope);
      if (
        result.digest !== b.digest ||
        !result.snapshot.allClosed ||
        result.snapshot.score.status === "PENDING"
      )
        throw new ConflictException(
          "Closed and fully reviewed results required",
        );
      const old = await tx.competitionPublication.findUnique({
        where: { entryId_scope: { entryId: entry.id, scope: b.scope } },
      });
      if (
        old &&
        !["CANCELLED", "REJECTED"].includes(old.status) &&
        (await this.currentPublication(tx, old, entry, event, user))
      )
        return this.publicationView(old, true);
      const status = eligibility.guardianId
        ? "PENDING_GUARDIAN"
        : eligibility.policy.age < 18
          ? "PENDING_REVIEW"
          : "READY";
      const data = {
        guardianId: eligibility.guardianId,
        consentDigest: eligibility.consentDigest,
        status,
        snapshot: result.snapshot,
        resultDigest: result.digest,
        reason: null,
      };
      const pub = await tx.competitionPublication.upsert({
        where: { entryId_scope: { entryId: entry.id, scope: b.scope } },
        create: { entryId: entry.id, scope: b.scope, ...data },
        update: { ...data, revision: { increment: 1 } },
      });
      await tx.audit.create({
        data: {
          actorId: user.id,
          action: "competition.share",
          targetId: pub.id,
          detail: { revision: pub.revision, digest: pub.resultDigest },
        },
      });
      if (pub.guardianId)
        await notifyUser(
          tx,
          this.infra.config.REGION,
          pub.guardianId,
          "REVIEW",
          "Score sharing needs your review · 成绩分享待家长审核",
          "Review the exact anonymous competition result in guardian controls. · 请在家长控制中核对匿名比赛成绩。",
        );
      return this.publicationView(pub, true);
    });
  }
  async board(r: Authed, id: string, raw: unknown) {
    this.available();
    const q = z
      .object({ scope: Scope.default("overall") })
      .strict()
      .parse(raw);
    return this.db.$transaction(async (tx) => {
      await this.actor(tx, r);
      const event = await this.event(tx, id);
      if (event.status !== "PUBLISHED")
        return { scope: q.scope, items: [], sharedOnly: true };
      if (q.scope !== "overall" && !event.rounds.some((x) => x.id === q.scope))
        throw new NotFoundException();
      const pubs = await tx.competitionPublication.findMany({
        where: {
          scope: q.scope,
          status: "READY",
          entry: { competitionId: id, status: "REGISTERED" },
        },
        include: { entry: { include: { user: true } } },
        take: 100,
      });
      const eligible = [];
      for (const pub of pubs)
        if (
          await this.currentPublication(
            tx,
            pub,
            pub.entry,
            event,
            pub.entry.user,
          )
        )
          eligible.push(pub);
      const scored = eligible
        .map(
          (pub) =>
            pub.snapshot as {
              number: number;
              score: {
                status: string;
                units: number | null;
                bestMs: number | null;
              };
            },
        )
        .filter((x) => x.score.status === "SCORED")
        .sort(
          (a, b) =>
            a.score.units! - b.score.units! ||
            a.score.bestMs! - b.score.bestMs! ||
            a.number - b.number,
        );
      let rank = 0,
        previous = "";
      return {
        scope: q.scope,
        sharedOnly: true,
        items: [
          ...scored.map((row, index) => {
            const key = `${row.score.units}/${row.score.bestMs}`;
            if (key !== previous) rank = index + 1;
            previous = key;
            return { rank, number: row.number, score: row.score };
          }),
          ...eligible
            .map(
              (pub) =>
                pub.snapshot as {
                  number: number;
                  score: {
                    status: string;
                    units: number | null;
                    bestMs: number | null;
                  };
                },
            )
            .filter((row) => row.score.status === "DNF")
            .sort((a, b) => a.number - b.number)
            .map((row) => ({
              rank: null,
              number: row.number,
              score: row.score,
            })),
        ],
      };
    });
  }
  async publicationList(r: Authed, role: Audience, raw: unknown) {
    const q = z.object({ cursor: Id.optional() }).strict().parse(raw);
    return this.db.$transaction(async (tx) => {
      const { user } = await this.actor(tx, r, r.user.id, role === "staff");
      if (
        role === "guardian" &&
        !eligibleGuardian(user, this.infra.config.REGION)
      )
        throw new ForbiddenException("Current guardian access required");
      const pubs = await tx.competitionPublication.findMany({
        where: {
          ...(role === "guardian"
            ? { guardianId: user.id }
            : { status: { in: ["PENDING_REVIEW", "READY"] } }),
          entry: { competition: { expiresAt: { gt: new Date() } } },
          ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        },
        include: { entry: { include: { user: true, competition: true } } },
        orderBy: { id: "desc" },
        take: 31,
      });
      const visible = [];
      for (const pub of pubs.slice(0, 30))
        if (
          role !== "guardian" ||
          (await this.guardianLinked(tx, pub.entry.user, user.id))
        )
          visible.push(pub);
      return {
        items: await Promise.all(
          visible.map(async (pub) => ({
            ...this.publicationView(
              pub,
              await this.currentPublication(
                tx,
                pub,
                pub.entry,
                pub.entry.competition,
                pub.entry.user,
              ),
            ),
            canReview:
              (pub.entry.userId !== user.id && pub.guardianId !== user.id) ||
              role === "guardian",
          })),
        ),
        nextCursor: pubs.length > 30 ? pubs[29].id : null,
      };
    });
  }
  async reviewPublication(
    r: Authed,
    id: string,
    role: Audience,
    raw: unknown,
    cancel = false,
  ) {
    Id.parse(id);
    const b = CompetitionReview.parse(raw);
    await this.limit(r);
    const initial = await this.db.competitionPublication.findUnique({
      where: { id },
      include: { entry: true },
    });
    if (!initial) throw new NotFoundException();
    return this.db.$transaction(async (tx) => {
      const { user, owner } = await this.actor(
        tx,
        r,
        initial.entry.userId,
        role === "staff",
      );
      const event = await this.event(tx, initial.entry.competitionId, true);
      const pub = await tx.competitionPublication.findUnique({
        where: { id },
        include: { entry: true },
      });
      if (!pub) throw new NotFoundException();
      if (role === "owner" && user.id !== pub.entry.userId)
        throw new ForbiddenException();
      if (
        role === "guardian" &&
        (pub.guardianId !== user.id ||
          !eligibleGuardian(user, this.infra.config.REGION) ||
          !(await this.guardianLinked(tx, owner, user.id)))
      )
        throw new ForbiddenException("Linked verified guardian required");
      if (
        role === "staff" &&
        (user.id === pub.entry.userId || user.id === pub.guardianId)
      )
        throw new ForbiddenException("Independent reviewer required");
      if (pub.revision !== b.revision || pub.resultDigest !== b.digest)
        throw new ConflictException("Result sharing request changed; reload");
      if (
        !cancel &&
        (!(await this.currentPublication(tx, pub, pub.entry, event, owner)) ||
          pub.status !==
            (role === "guardian" ? "PENDING_GUARDIAN" : "PENDING_REVIEW"))
      )
        throw new ConflictException(
          "Result or eligibility changed; request a fresh review",
        );
      if (role === "owner" && !cancel) throw new ForbiddenException();
      const status = cancel
        ? "CANCELLED"
        : !b.approve
          ? "REJECTED"
          : role === "guardian"
            ? "PENDING_REVIEW"
            : "READY";
      const changed = await tx.competitionPublication.update({
        where: { id },
        data: { status, reason: b.reason, revision: { increment: 1 } },
      });
      await tx.audit.create({
        data: {
          actorId: user.id,
          action: `competition.${role}-review`,
          targetId: id,
          detail: { status, revision: b.revision, digest: b.digest },
        },
      });
      await notifyUser(
        tx,
        this.infra.config.REGION,
        owner.id,
        "REVIEW",
        "Score sharing updated · 成绩分享有更新",
        "Check your private competition page for the current sharing status. · 请在私密比赛页面查看当前分享状态。",
      );
      return this.publicationView(
        changed,
        await this.currentPublication(tx, changed, pub.entry, event, owner),
      );
    });
  }
}
