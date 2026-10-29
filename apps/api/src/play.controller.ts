import { synchronizeRelay, stopRelay } from "./relay";
import { SmartPlayAccess } from "./smart-play-access";
import { learningWrite, type LearningDeadline } from "./learning-authority";
import { SmartAttemptContext, SMART_PLAY_LEASE } from "@cubers/core";
import type { CommunityActor } from "./community-authority";
import { recordMediaRecovery } from "./media-recovery";
import { accountPolicy } from "./security";
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
  NotFoundException,
  ConflictException,
  Query,
  ServiceUnavailableException,
  HttpException,
  Optional,
} from "@nestjs/common";
import { z } from "zod";
import {
  Input,
  playInput,
  relayProgress,
  CreateRoom,
  MoveEvent,
  practiceApply,
  solvedPuzzle,
  practiceSolved,
  practiceKey,
  practiceScan,
  Puzzle,
  permissions,
  assertTransition,
  FACES,
  type AttemptStatus,
} from "@cubers/core";
import { Competitions } from "./competitions";
import type { Prisma, Attempt, Room } from "@prisma/client";
import { Db, Infrastructure } from "./services";
import { accountPolicies, type Authed } from "./security";
import { opaque } from "./crypto";
import { communityWrite as accountWrite } from "./community-authority";
import { WCA_PROGRAM } from "./wca-scrambles";
import { AppAttestations } from "./app-attestation";
import {
  appAttestationActionRequest,
  type AppAttestationOperation,
} from "@cubers/core";
type ActionProof = {
  operation: z.infer<typeof AppAttestationOperation>;
  body: Record<string, unknown>;
  grantId?: string;
};
export const acceptedModes = ["race", "pattern", "sprint", "daily", "relay"];
@Controller("v1")
export class PlayController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(Competitions) private competitions: Competitions,
    @Inject(SmartPlayAccess)
    private smartAccess: SmartPlayAccess = new SmartPlayAccess(),
    @Optional() @Inject(AppAttestations) private attestations?: AppAttestations,
  ) {}
  private permitted(r: Authed) {
    if (this.infra.playIntegrityUnavailable)
      throw new ServiceUnavailableException(
        "Play is paused pending interruption reconciliation",
      );
    if (
      this.infra.config.REGION === "CN" &&
      this.infra.config.CN_GAMES_APPROVED !== "true"
    )
      throw new ForbiddenException(
        "Mainland game classification and operating review are required",
      );
    if (!permissions(r.policy).canLearn)
      throw new ForbiddenException("Guardian consent required");
  }
  private async member(r: Authed, id: string) {
    this.permitted(r);
    const room = await this.db.room.findUnique({ where: { id } });
    if (
      !room ||
      !(await this.db.roomMember.findUnique({
        where: { roomId_userId: { roomId: id, userId: r.user.id } },
      }))
    )
      throw new ForbiddenException("Room membership required");
    return room;
  }
  private async own(r: Authed, id: string) {
    const a = await this.db.attempt.findFirst({
      where: { id, userId: r.user.id },
      include: { room: true },
    });
    if (!a) throw new NotFoundException();
    await this.member(r, a.roomId);
    if (Date.now() - a.createdAt.getTime() > 30 * 86400000)
      throw new BadRequestException("Attempt expired");
    return { ...a, room: { ...a.room, input: playInput(a.room, a.input) } };
  }
  private inputAllowed(room: Pick<Room, "puzzle" | "mode">, input: string) {
    if (input === "smart") this.smartAccess.room(room.puzzle);
    if (input === "scan" && !["race", "daily"].includes(room.mode))
      throw new BadRequestException("This game requires move telemetry");
  }
  private async memberInput(r: Authed, room: Room) {
    const member = await this.db.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: r.user.id } },
    });
    if (!member) throw new ForbiddenException("Room membership required");
    return playInput(room, member.input);
  }
  private roomWrite<T>(
    r: Authed,
    input: string,
    puzzle: string,
    ranked: boolean,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    if (input !== "smart" && input !== "mixed")
      return this.db.$transaction(action);
    return accountWrite(
      this.db,
      this.infra.config,
      r,
      "learn",
      [],
      async (tx, actor) => {
        this.permitted({
          ...r,
          user: actor.user,
          policy: actor.policy,
        } as Authed);
        if (input === "smart") this.smartAccess.room(puzzle);
        if (
          ranked &&
          (!permissions(actor.policy).canRecord ||
            this.infra.config.NODE_ENV === "production")
        )
          throw new ForbiddenException(
            "Current recording permission and verified production attestation are required",
          );
        return action(tx);
      },
    );
  }
  @Get("rooms") async rooms(@Req() r: Authed) {
    this.permitted(r);
    return this.db.room.findMany({
      where: { private: false, status: "OPEN" },
      select: {
        id: true,
        puzzle: true,
        input: true,
        mode: true,
        ranked: true,
        mixed: true,
        createdAt: true,
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
  }
  @Post("rooms") async create(@Req() r: Authed, @Body() body: unknown) {
    this.permitted(r);
    const b = CreateRoom.parse(body);
    if (b.input === "smart") this.smartAccess.room(b.puzzle);
    if (b.input === "scan" && ["pattern", "sprint", "relay"].includes(b.mode))
      throw new BadRequestException("This game requires move telemetry");
    if (b.ranked && ["relay", "pattern", "sprint"].includes(b.mode))
      throw new BadRequestException("These games are currently casual only");
    if (b.ranked && b.input !== "virtual" && !permissions(r.policy).canRecord)
      throw new ForbiddenException("Recording consent required");
    if (b.ranked && this.infra.config.NODE_ENV === "production")
      throw new ForbiddenException(
        "Ranked production play requires verified app-attestation integration",
      );
    const target =
      b.mode === "pattern"
        ? b.puzzle === "pyraminx"
          ? ["U", "L", "R", "B"]
          : ["R2", "L2", "U2", "D2", "F2", "B2"]
        : b.mode === "sprint"
          ? ["R", "U", "R'", "U'"]
          : [];
    return this.roomWrite(
      r,
      b.mixed ? "mixed" : b.input,
      b.puzzle,
      b.ranked,
      async (tx) => {
        this.inputAllowed(b, b.input);
        const room = await tx.room.create({
          data: {
            ...b,
            target,
            ownerId: r.user.id,
            code: opaque().slice(0, 10),
          },
        });
        await tx.roomMember.create({
          data: {
            roomId: room.id,
            userId: r.user.id,
            input: b.mixed ? b.input : null,
          },
        });
        return room;
      },
    );
  }
  @Post("rooms/join") async join(@Req() r: Authed, @Body() body: unknown) {
    this.permitted(r);
    const b = z
      .object({
        id: z.string().uuid().optional(),
        code: z.string().min(6).max(30).optional(),
        input: Input.optional(),
      })
      .strict()
      .refine((x) => x.id || x.code)
      .parse(body);
    const room = await this.db.room.findFirst({
      where: b.code ? { code: b.code } : { id: b.id, private: false },
    });
    if (!room || room.competitionAttempt || room.status !== "OPEN")
      throw new NotFoundException("Open room not found");
    const selected = room.mixed ? (b.input ?? "virtual") : room.input;
    if (!room.mixed && b.input && b.input !== room.input)
      throw new BadRequestException("This room uses a single input category");
    this.inputAllowed(room, selected);
    await this.roomWrite(
      r,
      room.mixed ? "mixed" : room.input,
      room.puzzle,
      room.ranked,
      async (tx) => {
        // Serialize room entry with the host's start transition.
        const [locked] = await tx.$queryRaw<
          Room[]
        >`SELECT * FROM "Room" WHERE id = ${room.id}::uuid FOR UPDATE`;
        if (locked.status !== "OPEN")
          throw new ConflictException("Round already started");
        const existing = await tx.roomMember.findUnique({
          where: { roomId_userId: { roomId: room.id, userId: r.user.id } },
        });
        if (existing) {
          if (room.mixed && b.input && existing.input !== b.input)
            throw new ConflictException(
              "Change your input from the room before it starts",
            );
          return;
        }
        this.inputAllowed(locked, selected);
        if ((await tx.roomMember.count({ where: { roomId: room.id } })) >= 8)
          throw new BadRequestException("Room is full");
        await tx.roomMember.create({
          data: {
            roomId: room.id,
            userId: r.user.id,
            input: room.mixed ? selected : null,
          },
        });
      },
    );
    return room;
  }
  @Post("rooms/:id/input") async chooseInput(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { input } = z.object({ input: Input }).strict().parse(body);
    const room = await this.member(r, id);
    if (!room.mixed) throw new BadRequestException("Mixed room required");
    this.inputAllowed(room, input);
    return this.roomWrite(r, "mixed", room.puzzle, false, async (tx) => {
      const [current] = await tx.$queryRaw<
        Room[]
      >`SELECT * FROM "Room" WHERE id=${id}::uuid FOR UPDATE`;
      if (!current?.mixed || current.status !== "OPEN")
        throw new ConflictException("Input is locked after the room starts");
      this.inputAllowed(current, input);
      if (
        await tx.attempt.findFirst({ where: { roomId: id, userId: r.user.id } })
      )
        throw new ConflictException("Attempt input is already frozen");
      const updated = await tx.roomMember.updateMany({
        where: { roomId: id, userId: r.user.id },
        data: { input },
      });
      if (!updated.count)
        throw new ForbiddenException("Current membership required");
      return { input };
    });
  }
  @Get("rooms/:id") async room(@Req() r: Authed, @Param("id") id: string) {
    const known = await this.member(r, id);
    return this.db.$transaction(async (tx) => {
      const room =
        known.mode === "relay" ? await synchronizeRelay(tx, id) : known;
      if (
        !(await tx.roomMember.findUnique({
          where: { roomId_userId: { roomId: id, userId: r.user.id } },
        }))
      )
        throw new ForbiddenException("Room membership required");
      const members = await tx.roomMember.findMany({
        where: { roomId: id },
        orderBy: { id: "asc" },
      });
      const results = await tx.attempt.findMany({
        where: { roomId: id },
        select: {
          id: true,
          userId: true,
          status: true,
          durationMs: true,
          reason: true,
          input: true,
        },
        orderBy: { createdAt: "asc" },
      });
      const viewer = members.find((member) => member.userId === r.user.id)!;
      const { mixedScramble, mixedScrambleSource, ...visible } = room;
      return {
        ...visible,
        input: playInput(room, viewer.input),
        ...(room.mode === "relay"
          ? {
              relay: relayProgress(
                room.status === "OPEN"
                  ? { ...room, roster: members.map((m) => m.userId) }
                  : room,
                results,
                r.user.id,
              ),
            }
          : {}),
        ...(room.mixed || room.competitionAttempt || room.mode === "relay"
          ? {
              ownAttempt: await tx.attempt.findFirst({
                where: { roomId: id, userId: r.user.id },
              }),
            }
          : {}),
        members: members.map((member) => ({
          ...member,
          input: playInput(room, member.input),
        })),
        results: results.map((attempt) => ({
          ...attempt,
          input: playInput(room, attempt.input),
        })),
      };
    });
  }
  @Post("rooms/:id/start") async startRoom(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    const room = await this.member(r, id);
    this.inputAllowed(room, await this.memberInput(r, room));
    if (room.competitionAttempt)
      throw new ForbiddenException(
        "Scheduled rounds are controlled by the competition schedule",
      );
    if (room.ownerId !== r.user.id)
      throw new ForbiddenException("Only the host can start a round");
    await this.roomWrite(
      r,
      room.mixed ? "mixed" : room.input,
      room.puzzle,
      room.ranked,
      async (tx) => {
        if (room.mode === "relay") await this.relayLearner(tx, r);
        const [locked] = await tx.$queryRaw<
          Room[]
        >`SELECT * FROM "Room" WHERE id = ${id}::uuid FOR UPDATE`;
        if (locked.status !== "OPEN")
          throw new ConflictException("Round already started");
        const members = await tx.roomMember.findMany({ where: { roomId: id } });
        for (const member of members)
          this.inputAllowed(locked, playInput(locked, member.input));
        const roster = (
          await tx.roomMember.findMany({
            where: { roomId: id },
            orderBy: { id: "asc" },
          })
        ).map((m) => m.userId);
        if (room.mode === "relay" && roster.length < 2)
          throw new BadRequestException("Relay needs at least two players");
        const update = await tx.room.updateMany({
          where: { id, status: "OPEN" },
          data: { status: "ACTIVE", roster, round: 0 },
        });
        if (!update.count) throw new ConflictException("Round already started");
      },
    );
    return { ok: true };
  }
  @Post("rooms/:id/attempts") async attempt(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    const room = await this.member(r, id);
    const selected = await this.memberInput(r, room);
    this.inputAllowed(room, selected);
    if (room.competitionAttempt)
      throw new ForbiddenException(
        "Request scheduled attempts from the competition page",
      );
    if (room.status !== "ACTIVE")
      throw new BadRequestException("Host must start the round first");
    if (room.mode === "relay" && room.roster[room.round] !== r.user.id)
      throw new ForbiddenException("Wait for your relay turn");
    if (
      await this.db.attempt.findFirst({
        where: { roomId: id, userId: r.user.id },
      })
    )
      throw new ConflictException("One attempt per player per round");
    const puzzle = Puzzle.parse(room.puzzle),
      day = new Date().toISOString().slice(0, 10),
      dailyKey =
        room.mode === "daily"
          ? `daily-wca:${WCA_PROGRAM.program}:${WCA_PROGRAM.version}:${WCA_PROGRAM.filter}:${puzzle}:${day}`
          : null,
      existing = dailyKey
        ? await this.db.setting.findUnique({ where: { key: dailyKey } })
        : null,
      generated =
        room.mode === "sprint"
          ? null
          : room.mixed && room.mixedScramble && room.mixedScrambleSource
            ? this.infra.scrambles.stored(puzzle, {
                scrambles: [room.mixedScramble],
                source: room.mixedScrambleSource,
              })
            : existing
              ? this.infra.scrambles.stored(puzzle, existing.value)
              : await this.gameScramble(r, puzzle);
    // Generation is outside database locks. Recheck current authority, room and
    // membership after that wait, and again before committing its effects.
    return accountWrite(
      this.db,
      this.infra.config,
      r,
      "learn",
      [],
      async (tx, actor) => {
        this.permitted({
          ...r,
          user: actor.user,
          policy: actor.policy,
        } as Authed);
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${id}::uuid FOR UPDATE`;
        const current =
          room.mode === "relay"
            ? await synchronizeRelay(tx, id)
            : await tx.room.findUnique({ where: { id } });
        if (
          !current ||
          current.status !== "ACTIVE" ||
          current.competitionAttempt ||
          current.puzzle !== puzzle ||
          current.mode !== room.mode ||
          current.input !== room.input ||
          current.ranked !== room.ranked ||
          current.mixed !== room.mixed
        )
          throw new ConflictException("Room changed; reopen the attempt");
        const member = await tx.roomMember.findUnique({
          where: { roomId_userId: { roomId: id, userId: actor.user.id } },
        });
        if (!member)
          throw new ForbiddenException("Current room membership required");
        if (playInput(current, member.input) !== selected)
          throw new ConflictException("Input changed; reopen the attempt");
        this.inputAllowed(current, selected);
        if (
          current.mode === "relay" &&
          current.roster[current.round] !== actor.user.id
        )
          throw new ForbiddenException("Wait for your relay turn");
        if (
          current.ranked &&
          selected !== "virtual" &&
          !permissions(actor.policy).canRecord
        )
          throw new ForbiddenException("Current recording permission required");
        if (
          await tx.attempt.findFirst({
            where: { roomId: id, userId: actor.user.id },
          })
        )
          throw new ConflictException("One attempt per player per round");
        let set = generated;
        if (
          current.mixed &&
          current.mixedScramble &&
          current.mixedScrambleSource
        ) {
          set = this.infra.scrambles.stored(puzzle, {
            scrambles: [current.mixedScramble],
            source: current.mixedScrambleSource,
          });
        } else if (dailyKey && generated) {
          if (day !== new Date().toISOString().slice(0, 10))
            throw new ConflictException("Daily challenge changed; try again");
          const shared = await tx.setting.upsert({
            where: { key: dailyKey },
            create: { key: dailyKey, value: generated },
            update: {},
          });
          set = this.infra.scrambles.stored(puzzle, shared.value);
        }
        if (current.mixed && set && !current.mixedScramble) {
          await tx.room.update({
            where: { id },
            data: {
              mixedScramble: set.scrambles[0],
              mixedScrambleSource: set.source,
              mixedChallengeDate: current.mode === "daily" ? day : null,
            },
          });
        }
        return tx.attempt.create({
          data: {
            userId: actor.user.id,
            roomId: id,
            input: current.mixed ? selected : null,
            nonce: opaque(),
            scramble: set?.scrambles[0] || [],
            ...(set ? { scrambleSource: set.source } : {}),
          },
        });
      },
    );
  }
  private async gameScramble(r: Authed, puzzle: import("@cubers/core").Puzzle) {
    if (!(await this.infra.limit(`wca-game:${r.user.id}`, 30, 60)))
      throw new HttpException(
        "Scramble request limit reached; try later · 打乱请求过于频繁，请稍后重试",
        429,
      );
    return this.infra.scrambles.generate(puzzle);
  }
  private async relayLearner(tx: Prisma.TransactionClient, r: Authed) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.user.id}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: r.user.id } });
    const session = await tx.session.findUnique({ where: { id: r.sessionId } });
    if (
      !user ||
      user.deletedAt ||
      !user.emailVerified ||
      user.region !== this.infra.config.REGION ||
      !session ||
      session.userId !== user.id ||
      session.scope !== "FULL" ||
      session.expiresAt <= new Date() ||
      !permissions(await accountPolicy(tx, user)).canLearn
    )
      throw new ForbiddenException("Current relay learning access required");
  }
  @Post("rooms/:id/relay/end") async endRelay(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    await this.member(r, id);
    await this.db.$transaction(async (tx) => {
      await this.relayLearner(tx, r);
      const room = await synchronizeRelay(tx, id);
      if (!room || room.mode !== "relay" || room.ownerId !== r.user.id)
        throw new ForbiddenException(
          "Only the relay host can end the team session",
        );
      await stopRelay(tx, id);
    });
    return { ok: true };
  }
  async disconnect(userId: string, roomId: string) {
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout='2000ms'`;
      await tx.$executeRaw`SET LOCAL statement_timeout='5000ms'`;
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${roomId}::uuid FOR UPDATE`;
      await tx.attempt.updateMany({
        where: {
          userId,
          roomId,
          OR: [
            { status: { in: ["INSPECTION", "SOLVING"] } },
            {
              status: "CREATED",
              OR: [
                { recordingAt: { not: null } },
                { smartSeenAt: { not: null } },
              ],
            },
            { status: "AWAITING_EVIDENCE", smartSeenAt: { not: null } },
          ],
        },
        data: {
          status: "INTERRUPTED",
          reason: "Realtime connection interrupted",
          version: { increment: 1 },
        },
      });
      await synchronizeRelay(tx, roomId);
    });
  }
  private async write<T>(
    r: Authed,
    a: Attempt,
    phase: "active" | "evidence" | "cleanup",
    action: (tx: Prisma.TransactionClient) => Promise<T>,
    recordingRequired = false,
    proof?: ActionProof,
  ) {
    const execute = async (
      tx: Prisma.TransactionClient,
      until?: LearningDeadline,
      actor?: CommunityActor,
    ) => {
      let room = await tx.room.findUniqueOrThrow({ where: { id: a.roomId } });
      if (actor && room.competitionAttempt) {
        // Account -> competition -> entry -> room -> attempt, matching schedule
        // cancellation/withdrawal and avoiding inversion with disconnect.
        const deadline = await this.competitions.guardAttempt(
          tx,
          r,
          room,
          phase,
        );
        if (deadline)
          until!(
            deadline,
            "Round deadline reached; no further solve actions are accepted",
          );
      }
      if (actor) {
        this.permitted({
          ...r,
          user: actor.user,
          policy: actor.policy,
        } as Authed);
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${a.roomId}::uuid FOR UPDATE`;
      }
      room = await tx.room.findUniqueOrThrow({ where: { id: a.roomId } });
      const actualInput = playInput(room, a.input);
      if (actor) {
        if (
          !(await tx.roomMember.findUnique({
            where: {
              roomId_userId: { roomId: room.id, userId: actor.user.id },
            },
          }))
        )
          throw new ForbiddenException("Current room membership required");
        await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id=${a.id}::uuid FOR UPDATE`;
        const current = await tx.attempt.findUnique({ where: { id: a.id } });
        if (
          !current ||
          current.userId !== actor.user.id ||
          current.roomId !== room.id ||
          current.version !== a.version ||
          current.status !== a.status ||
          current.nonce !== a.nonce ||
          current.input !== a.input
        )
          throw new ConflictException("Attempt changed or ended");
        if (phase !== "cleanup") {
          if (actualInput === "smart") this.smartAccess.room(room.puzzle);
          if (room.mixed && (room.ranked || room.competitionAttempt))
            throw new ConflictException("Mixed rooms are casual only");
          until!(
            new Date(current.createdAt.getTime() + 30 * 86400000),
            "Attempt expired",
          );
          if (phase === "active" && room.status !== "ACTIVE")
            throw new ConflictException("Room is not active");
          if (room.ranked && this.infra.config.NODE_ENV === "production")
            throw new ForbiddenException(
              "Ranked production play requires verified app attestation",
            );
          if (
            (recordingRequired ||
              (room.ranked && actualInput !== "virtual") ||
              current.recordingAt) &&
            !permissions(actor.policy).canRecord
          )
            throw new ForbiddenException(
              "Current recording permission required",
            );
          if (actualInput === "smart" && current.smart) {
            const context = SmartAttemptContext.parse(current.smart);
            this.smartAccess.require(context.model, context.platform);
            if (phase === "active")
              until!(
                new Date(current.smartSeenAt!.getTime() + SMART_PLAY_LEASE),
                "Smart connection expired; this attempt cannot resume",
              );
          }
          if (
            phase === "active" &&
            current.status === "SOLVING" &&
            current.startedAt
          )
            until!(
              new Date(current.startedAt.getTime() + 3600000),
              "Solve deadline reached",
            );
          if (phase === "active" && current.status === "INSPECTION")
            until!(
              new Date(current.inspectionAt!.getTime() + 17000),
              "Inspection expired",
            );
        }
      }
      if (room.mode === "relay") {
        if (phase !== "cleanup") await this.relayLearner(tx, r);
        room = await synchronizeRelay(tx, room.id);
        if (
          phase !== "cleanup" &&
          (room.status !== "ACTIVE" || room.roster[room.round] !== r.user.id)
        )
          throw new ConflictException("Relay turn changed or ended");
      }
      if (room.competitionAttempt && !actor)
        await this.competitions.guardAttempt(tx, r, room, phase, a.id);
      if (room.competitionAttempt && phase === "evidence") {
        const round = room.competitionRoundId
          ? await tx.competitionRound.findUnique({
              where: { id: room.competitionRoundId },
            })
          : null;
        if (!round || !a.finishedAt || a.finishedAt > round.closesAt)
          throw new ConflictException(
            "Solve was not finished before the round deadline",
          );
      }
      if (proof?.grantId) {
        if (!actor || !until || !this.attestations)
          throw new ServiceUnavailableException(
            "App verification is unavailable",
          );
        await this.attestations.consume(
          tx,
          r,
          actor,
          until,
          proof.grantId,
          a.id,
          proof.operation,
          proof.body,
        );
      } else if (
        proof &&
        room.ranked &&
        this.infra.config.NODE_ENV === "production"
      ) {
        throw new ForbiddenException(
          "An exact app verification proof is required",
        );
      }
      return action(tx);
    };
    return learningWrite(this.db, this.infra.config, r, (tx, until, actor) =>
      execute(tx, until, actor),
    );
  }
  private actionProof(
    operation: ActionProof["operation"],
    request: Record<string, unknown> & { appProofId?: string },
  ): ActionProof {
    const { appProofId, ...body } = request;
    return { operation, body, grantId: appProofId };
  }
  /** Internal bridge for the input-specific controller; no route or bypass. */
  async smartAttempt(r: Authed, id: string) {
    const a = await this.own(r, id);
    if (a.room.input !== "smart" || a.room.puzzle !== "3x3")
      throw new BadRequestException("Smart 3x3 attempt required");
    return a;
  }
  async smartWrite<T>(
    r: Authed,
    a: Attempt,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    const room = await this.db.room.findUniqueOrThrow({
      where: { id: a.roomId },
    });
    if (playInput(room, a.input) !== "smart")
      throw new BadRequestException("Smart attempt required");
    return this.write(r, a, "active", action);
  }
  private smartReady(a: Attempt) {
    if (!a.smart || !a.smartSeenAt || !a.scrambleVerifiedAt)
      throw new BadRequestException(
        "Synchronize and confirm the server scramble first",
      );
    const context = SmartAttemptContext.parse(a.smart);
    this.smartAccess.require(context.model, context.platform);
    if (
      !context.independentState ||
      context.recoveryRun ||
      Date.now() - a.smartSeenAt.getTime() >= SMART_PLAY_LEASE
    )
      throw new ConflictException(
        "Refresh a matching independent device position before continuing",
      );
  }
  private async transition(
    r: Authed,
    a: Attempt,
    from: AttemptStatus,
    to: AttemptStatus,
    extra: Record<string, unknown> = {},
    proof?: ActionProof,
  ) {
    try {
      assertTransition(from, to);
    } catch {
      throw new BadRequestException("Attempt cannot enter that state");
    }
    const updated = await this.write(
      r,
      a,
      to === "INTERRUPTED"
        ? "cleanup"
        : from === "AWAITING_EVIDENCE"
          ? "evidence"
          : "active",
      async (tx) => {
        if (
          to === "PROVISIONAL" &&
          typeof extra.evidenceId === "string" &&
          extra.evidenceDeleteAt instanceof Date
        ) {
          await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id=${a.id}::uuid FOR UPDATE`;
          const fresh = await tx.attempt.findUniqueOrThrow({
            where: { id: a.id },
          });
          const user = await tx.user.findUniqueOrThrow({
            where: { id: r.user.id },
          });
          const session = await tx.session.findUnique({
            where: { id: r.sessionId },
          });
          if (
            fresh.status !== from ||
            fresh.version !== a.version ||
            fresh.createdAt.getTime() + 30 * 86400000 <= Date.now() ||
            user.deletedAt ||
            !user.emailVerified ||
            user.region !== this.infra.config.REGION ||
            !session ||
            session.userId !== user.id ||
            session.scope !== "FULL" ||
            session.expiresAt <= new Date() ||
            !permissions(await accountPolicy(tx, user)).canRecord
          )
            throw new ConflictException(
              "Evidence or current recording access changed",
            );
          await tx.$queryRaw`SELECT id FROM "Media" WHERE id=${extra.evidenceId}::uuid FOR SHARE`;
          const media = await tx.media.findFirst({
            where: {
              id: extra.evidenceId,
              userId: user.id,
              attemptId: a.id,
              purpose: "evidence",
              status: "READY",
            },
          });
          if (!media) throw new ConflictException("Evidence changed");
          await recordMediaRecovery(tx, this.infra.config, user.id, {
            kind: "EVIDENCE_DEADLINE",
            mediaId: media.id,
            attemptId: a.id,
            attemptCreatedAt: fresh.createdAt.toISOString(),
            deadline: extra.evidenceDeleteAt.toISOString(),
          });
        }
        if (to === "INSPECTION") extra = { ...extra, inspectionAt: new Date() };
        if (
          from === "SOLVING" &&
          ["APPROVED", "AWAITING_EVIDENCE"].includes(to)
        ) {
          const finishedAt = new Date(),
            elapsed = finishedAt.getTime() - a.startedAt!.getTime();
          if (elapsed < 300 || elapsed > 3600000)
            throw new BadRequestException("Implausible duration");
          extra = {
            ...extra,
            durationMs: elapsed + a.penaltyMs,
            finishedAt,
            ...(to === "APPROVED" ? { finalizedAt: finishedAt } : {}),
          };
        }
        if (to === "SOLVING") {
          const inspection = Date.now() - a.inspectionAt!.getTime();
          if (inspection > 17000)
            throw new BadRequestException("Inspection expired");
          extra = {
            ...extra,
            startedAt: new Date(),
            penaltyMs: inspection > 15000 ? 2000 : 0,
          };
        }
        const result = await tx.attempt.updateMany({
          where: { id: a.id, status: from, version: a.version },
          data: { ...extra, status: to, version: { increment: 1 } },
        });
        if (!result.count)
          throw new ConflictException("Attempt changed; reload its state");
        if (
          result.count &&
          (
            await tx.room.findUnique({
              where: { id: a.roomId },
              select: { mode: true },
            })
          )?.mode === "relay"
        )
          await synchronizeRelay(tx, a.roomId);
        return result;
      },
      false,
      proof,
    );
    if (!updated.count)
      throw new ConflictException("Attempt changed; reload its state");
    return extra;
  }
  @Post("attempts/:id/record") async record(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = appAttestationActionRequest("record", body),
      a = await this.own(r, id);
    if (
      b.nonce !== a.nonce ||
      !permissions(r.policy).canRecord ||
      a.room.input === "virtual"
    )
      throw new ForbiddenException(
        "Recording permission and physical attempt required",
      );
    const recordingAt = new Date();
    const result = await this.write(
      r,
      a,
      "active",
      async (tx) => {
        const result = await tx.attempt.updateMany({
          where: {
            id,
            status: "CREATED",
            recordingAt: null,
            version: a.version,
          },
          data: { recordingAt, version: { increment: 1 } },
        });
        if (!result.count)
          throw new ConflictException(
            "Recording has already started or the attempt is closed",
          );
        return result;
      },
      true,
      this.actionProof("record", b),
    );
    if (!result.count)
      throw new ConflictException(
        "Recording has already started or the attempt is closed",
      );
    return { recordingAt };
  }
  @Post("attempts/:id/checkpoint") async checkpoint(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
        .object({
          nonce: z.string(),
          stage: z.enum(["scramble", "final"]),
          faces: z.record(z.array(z.enum(FACES)).max(16)),
        })
        .strict()
        .parse(body),
      a = await this.own(r, id);
    if (
      a.nonce !== b.nonce ||
      a.room.input !== "scan" ||
      (b.stage === "scramble"
        ? a.status !== "CREATED"
        : a.status !== "AWAITING_EVIDENCE")
    )
      throw new ForbiddenException("Physical checkpoint is not active");
    if (a.room.ranked && (!a.recordingAt || !permissions(r.policy).canRecord))
      throw new ForbiddenException(
        "Keep recording throughout physical checkpoints",
      );
    let matches = false;
    try {
      const puzzle = Puzzle.parse(a.room.puzzle),
        state = practiceScan(puzzle, b.faces);
      matches =
        b.stage === "final"
          ? practiceSolved(state)
          : practiceKey(state) ===
            practiceKey(practiceApply(solvedPuzzle(puzzle), a.scramble));
    } catch {
      throw new BadRequestException("Invalid physical puzzle state");
    }
    if (!matches)
      throw new BadRequestException(
        "Scan does not match the required checkpoint",
      );
    const now = new Date();
    const result = await this.write(
      r,
      a,
      b.stage === "final" ? "evidence" : "active",
      (tx) =>
        tx.attempt.updateMany({
          where: { id, status: a.status, version: a.version },
          data: {
            ...(b.stage === "scramble"
              ? { scrambleVerifiedAt: now }
              : { finalScanVerifiedAt: now }),
            ...(b.stage === "final" && !a.room.ranked
              ? { status: "APPROVED", finalizedAt: now }
              : {}),
            version: { increment: 1 },
          },
        }),
    );
    if (!result.count)
      throw new ConflictException("Attempt changed; reload its state");
    return {
      status: b.stage === "final" && !a.room.ranked ? "APPROVED" : a.status,
      stage: b.stage,
    };
  }
  @Post("attempts/:id/inspect") async inspect(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = appAttestationActionRequest("inspect", body),
      a = await this.own(r, id);
    if (b.nonce !== a.nonce) throw new ForbiddenException();
    if (a.room.ranked && a.room.input !== "virtual" && !a.recordingAt)
      throw new ForbiddenException(
        "Start recording before scramble presentation and inspection",
      );
    if (a.room.input === "smart") this.smartReady(a);
    if (a.room.input === "scan" && !a.scrambleVerifiedAt)
      throw new BadRequestException(
        "Scan and verify the server scramble before inspection",
      );
    await this.transition(
      r,
      a,
      a.status as AttemptStatus,
      "INSPECTION",
      {
        inspectionAt: new Date(),
      },
      this.actionProof("inspect", b),
    );
    return { ok: true };
  }
  @Post("attempts/:id/start") async start(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = appAttestationActionRequest("start", body),
      a = await this.own(r, id);
    if (b.nonce !== a.nonce) throw new ForbiddenException();
    if (a.status !== "INSPECTION")
      throw new BadRequestException("Attempt is not in inspection");
    if (a.room.input === "smart") this.smartReady(a);
    if (
      a.room.ranked &&
      a.room.input !== "virtual" &&
      (!a.recordingAt || !permissions(r.policy).canRecord)
    )
      throw new ForbiddenException(
        "Uninterrupted camera recording and consent are required",
      );
    if (!a.inspectionAt || Date.now() - a.inspectionAt.getTime() > 17000) {
      await this.transition(r, a, "INSPECTION", "INTERRUPTED", {
        reason: "Inspection exceeded 17 seconds",
      });
      throw new BadRequestException(
        "Inspection expired; this attempt cannot be ranked",
      );
    }
    await this.transition(
      r,
      a,
      a.status as AttemptStatus,
      "SOLVING",
      {
        startedAt: new Date(),
      },
      this.actionProof("start", b),
    );
    return { ok: true };
  }
  @Post("attempts/:id/moves") async moves(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
        .object({
          nonce: z.string(),
          events: z.array(MoveEvent).min(1).max(100),
        })
        .strict()
        .parse(body),
      a = await this.own(r, id);
    if (b.nonce !== a.nonce || a.status !== "SOLVING" || !a.startedAt)
      throw new ForbiddenException("Active attempt required");
    if (a.room.input !== "virtual")
      throw new BadRequestException(
        "Use the input-specific verified telemetry path",
      );
    const previous = a.moves as z.infer<typeof MoveEvent>[];
    let elapsed = previous.at(-1)?.elapsedMs ?? -1;
    for (let i = 0; i < b.events.length; i++) {
      const e = b.events[i];
      if (
        e.sequence !== previous.length + i ||
        e.elapsedMs < elapsed ||
        e.elapsedMs > Date.now() - a.startedAt.getTime() + 1000
      )
        throw new BadRequestException(
          "Missing, replayed, or inconsistent move",
        );
      elapsed = e.elapsedMs;
    }
    try {
      practiceApply(
        solvedPuzzle(Puzzle.parse(a.room.puzzle)),
        b.events.map((event) => event.move),
      );
    } catch {
      throw new BadRequestException("Move is not valid for this puzzle");
    }
    const all = [...previous, ...b.events];
    if (all.length > 10000) throw new BadRequestException("Move limit reached");
    const updated = await this.write(r, a, "active", (tx) =>
      tx.attempt.updateMany({
        where: { id, status: "SOLVING", version: a.version },
        data: { moves: all, version: { increment: 1 } },
      }),
    );
    if (!updated.count)
      throw new ConflictException("Concurrent move submission; reload attempt");
    return { nextSequence: all.length };
  }
  @Post("attempts/:id/finish") async finish(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = appAttestationActionRequest("finish", body),
      a = await this.own(r, id);
    if (b.nonce !== a.nonce || a.status !== "SOLVING" || !a.startedAt)
      throw new ForbiddenException("Active attempt required");
    if (a.room.input === "smart") this.smartReady(a);
    const events = a.moves as z.infer<typeof MoveEvent>[];
    const elapsed = Date.now() - a.startedAt.getTime();
    if (elapsed < 300 || elapsed > 3600000)
      throw new BadRequestException("Implausible duration");
    if (a.room.input !== "scan")
      this.verifyPuzzle(
        a,
        a.room,
        events.map((e) => e.move),
      );
    let status: "APPROVED" | "AWAITING_EVIDENCE" = "APPROVED";
    if (a.room.input !== "virtual") {
      if (a.room.ranked && (!a.recordingAt || !permissions(r.policy).canRecord))
        throw new ForbiddenException("Recording consent is required");
      status =
        a.room.input === "smart" && !a.room.ranked
          ? "APPROVED"
          : "AWAITING_EVIDENCE";
    }
    const transitionData = await this.transition(
      r,
      a,
      "SOLVING",
      status,
      {
        durationMs: elapsed + a.penaltyMs,
        finishedAt: new Date(),
        ...(status === "APPROVED" ? { finalizedAt: new Date() } : {}),
      },
      this.actionProof("finish", b),
    );
    return {
      status,
      durationMs: Number(transitionData.durationMs),
      penaltyMs: a.penaltyMs,
    };
  }
  @Post("attempts/:id/evidence") async evidence(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = appAttestationActionRequest("evidence", body),
      a = await this.own(r, id);
    if (
      a.nonce !== b.nonce ||
      a.status !== "AWAITING_EVIDENCE" ||
      !a.recordingAt ||
      !a.finishedAt ||
      (a.room.input === "scan" && !a.finalScanVerifiedAt) ||
      !permissions(r.policy).canRecord
    )
      throw new ForbiddenException(
        "Completed physical attempt and current recording consent required",
      );
    const media = await this.db.media.findFirst({
      where: {
        id: b.evidenceId,
        attemptId: id,
        userId: r.user.id,
        purpose: "evidence",
        type: "video/mp4",
        status: "READY",
      },
    });
    if (
      !media ||
      !media.durationMs ||
      media.durationMs + 3000 < a.finishedAt.getTime() - a.recordingAt.getTime()
    )
      throw new BadRequestException("Missing, incomplete, or unbound evidence");
    await this.transition(
      r,
      a,
      "AWAITING_EVIDENCE",
      "PROVISIONAL",
      {
        evidenceId: media.id,
        evidenceDeleteAt: new Date(a.createdAt.getTime() + 30 * 86400000),
      },
      this.actionProof("evidence", b),
    );
    return { status: "PROVISIONAL", durationMs: a.durationMs };
  }
  private verifyPuzzle(a: Attempt, room: Room, moves: string[]) {
    const puzzle = Puzzle.parse(room.puzzle);
    const actual = practiceApply(
      practiceApply(solvedPuzzle(puzzle), a.scramble),
      moves,
    );
    if (room.mode === "sprint") {
      if (moves.join(" ") !== room.target.join(" "))
        throw new BadRequestException("Algorithm does not match the target");
    } else if (room.mode === "pattern") {
      if (
        practiceKey(actual) !==
        practiceKey(practiceApply(solvedPuzzle(puzzle), room.target))
      )
        throw new BadRequestException("Target pattern not reached");
    } else if (!practiceSolved(actual))
      throw new BadRequestException("Puzzle is not solved");
  }
  @Post("attempts/:id/interrupt") async interrupt(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    const a = await this.own(r, id);
    if (
      ["CREATED", "INSPECTION", "SOLVING", "AWAITING_EVIDENCE"].includes(
        a.status,
      )
    )
      await this.transition(r, a, a.status as AttemptStatus, "INTERRUPTED", {
        reason: "Connection, camera, or app was interrupted",
      });
    return { status: "INTERRUPTED" };
  }
  @Post("attempts/:id/appeal") async appeal(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
        .object({ reason: z.string().min(10).max(1000) })
        .strict()
        .parse(body),
      a = await this.own(r, id);
    if (a.status !== "REJECTED" || a.appealed)
      throw new BadRequestException(
        "This attempt is not eligible for an appeal",
      );
    await this.write(r, a, "cleanup", async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.user.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.attempt.findUniqueOrThrow({ where: { id } }),
        user = await tx.user.findUniqueOrThrow({ where: { id: r.user.id } }),
        session = await tx.session.findUnique({ where: { id: r.sessionId } });
      if (
        current.status !== "REJECTED" ||
        current.appealed ||
        current.version !== a.version ||
        !current.evidenceId ||
        !current.evidenceDeleteAt ||
        current.evidenceDeleteAt <= new Date() ||
        current.createdAt.getTime() + 30 * 86400000 <= Date.now() ||
        user.deletedAt ||
        !user.emailVerified ||
        user.region !== this.infra.config.REGION ||
        !session ||
        session.userId !== user.id ||
        session.scope !== "FULL" ||
        session.expiresAt <= new Date() ||
        !permissions(await accountPolicy(tx, user)).canRecord
      )
        throw new BadRequestException(
          "Current unexpired evidence and recording access are required for appeal",
        );
      await tx.$queryRaw`SELECT id FROM "Media" WHERE id=${current.evidenceId}::uuid FOR SHARE`;
      if (
        !(await tx.media.findFirst({
          where: {
            id: current.evidenceId,
            userId: user.id,
            attemptId: id,
            status: "READY",
            purpose: "evidence",
          },
        }))
      )
        throw new BadRequestException("Evidence is no longer available");
      const deadline = new Date(current.createdAt.getTime() + 30 * 86400000);
      await recordMediaRecovery(
        tx,
        this.infra.config,
        user.id,
        {
          kind: "EVIDENCE_DEADLINE",
          mediaId: current.evidenceId,
          attemptId: id,
          attemptCreatedAt: current.createdAt.toISOString(),
          deadline: deadline.toISOString(),
        },
        current.evidenceDeleteAt,
      );
      await tx.attempt.update({
        where: { id },
        data: {
          appealed: true,
          evidenceDeleteAt: deadline,
          version: { increment: 1 },
        },
      });
      await tx.audit.create({
        data: {
          actorId: r.user.id,
          action: "attempt.appeal",
          targetId: id,
          detail: { reason: b.reason },
        },
      });
    });
    return { ok: true };
  }
  @Get("rankings") async rankings(@Req() r: Authed, @Query() query: unknown) {
    this.permitted(r);
    const category = z
      .object({
        puzzle: Puzzle.default("3x3"),
        input: z.enum(["virtual", "scan", "smart"]).default("virtual"),
        mode: z.enum(["race", "daily"]).default("race"),
      })
      .strict()
      .parse(query);
    if (
      this.infra.config.REGION === "CN" &&
      this.infra.config.CN_SOCIAL_APPROVED !== "true"
    )
      return [];
    const today = new Date().toISOString().slice(0, 10);
    const adultBirthDate = `${Number(today.slice(0, 4)) - 18}${today.slice(4)}`;
    const rows = await this.db.attempt.findMany({
      where: {
        status: "APPROVED",
        durationMs: { not: null },
        user: {
          deletedAt: null,
          emailVerified: true,
          adultVerified: true,
          region: this.infra.config.REGION,
          birthDate: { lte: adultBirthDate },
          ...(this.infra.config.REGION === "CN"
            ? { identityVerified: true }
            : {}),
        },
        room: {
          ranked: true,
          competitionAttempt: false,
          mixed: false,
          ...category,
        },
      },
      select: {
        id: true,
        durationMs: true,
        user: {
          select: { id: true, displayName: true, privateProfile: true },
        },
        room: { select: { puzzle: true, input: true, mode: true } },
      },
      take: 100,
      orderBy: { durationMs: "asc" },
    });
    const users = await this.db.user.findMany({
      where: { id: { in: rows.map((row) => row.user.id) } },
    });
    const policies = await accountPolicies(this.db, users);
    return rows
      .filter((row) => {
        const policy = policies.get(row.user.id);
        return (
          policy &&
          policy.age >= 18 &&
          policy.adultVerified &&
          permissions(policy).canPost &&
          permissions(policy).canLearn &&
          (category.input === "virtual" || permissions(policy).canRecord)
        );
      })
      .map((x) => ({
        ...x,
        user: { displayName: "Private cuber" },
      }));
  }
}
