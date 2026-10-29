import { synchronizeRelay } from "./relay";
import {
  Controller,
  Get,
  Post,
  Req,
  Param,
  Body,
  Inject,
  Header,
  BadRequestException,
  ConflictException,
  HttpException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Attempt, Prisma } from "@prisma/client";
import {
  SmartAttemptBind,
  SmartAttemptBatch,
  SmartAttemptContext,
  SMART_PLAY_LEASE,
  SMART_PROFILES,
  smartAttemptTurns,
  smartLessonState,
  facelets,
  solvedCube,
  applyMoves,
  stateKey,
  type CubeState,
  type SmartAttemptView,
} from "@cubers/core";
import { Db, Infrastructure } from "./services";
import type { Authed } from "./security";
import { PlayController } from "./play.controller";
import { SmartPlayAccess } from "./smart-play-access";
const json = (value: unknown) => value as Prisma.InputJsonValue;
const current = (row: Attempt) =>
  applyMoves(
    applyMoves(solvedCube(), row.scramble),
    (row.moves as { move: string }[]).map((e) => e.move),
  );
function view(row: Attempt): SmartAttemptView {
  const stale =
    row.smart &&
    ["CREATED", "INSPECTION", "SOLVING"].includes(row.status) &&
    (!row.smartSeenAt ||
      Date.now() - row.smartSeenAt.getTime() >= SMART_PLAY_LEASE);
  return {
    id: row.id,
    nonce: row.nonce,
    version: row.version,
    status: stale ? "INTERRUPTED" : row.status,
    smart: row.smart ? SmartAttemptContext.parse(row.smart) : null,
    scramble: row.scramble,
    moves: row.moves as SmartAttemptView["moves"],
    recordingAt: row.recordingAt?.toISOString() || null,
    inspectionAt: row.inspectionAt?.toISOString() || null,
    startedAt: row.startedAt?.toISOString() || null,
    durationMs: row.durationMs,
  };
}
@Controller("v1/smart-attempts")
export class SmartAttemptController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(PlayController) private play: PlayController,
    @Inject(SmartPlayAccess) private access: SmartPlayAccess,
  ) {}
  private async limit(r: Authed) {
    if (!(await this.infra.limit("smart-play:" + r.user.id, 600, 60)))
      throw new HttpException("Smart attempt request limit reached", 429);
  }
  private async invalid(
    r: Authed,
    row: Attempt,
    message: string,
  ): Promise<never> {
    await this.play.smartWrite(r, row, async (tx) => {
      await tx.attempt.update({
        where: { id: row.id },
        data: {
          status: "INTERRUPTED",
          reason: message,
          version: { increment: 1 },
        },
      });
      await synchronizeRelay(tx, row.roomId);
    });
    throw new BadRequestException(message);
  }
  @Get(":id") @Header("Cache-Control", "private, no-store") async get(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    z.string().uuid().parse(id);
    return view(await this.play.smartAttempt(r, id));
  }
  @Post(":id/bind") async bind(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    z.string().uuid().parse(id);
    const b = SmartAttemptBind.parse(body);
    this.access.require(b.model, b.platform);
    await this.limit(r);
    const row = await this.play.smartAttempt(r, id);
    if (
      row.status !== "CREATED" ||
      row.smart ||
      row.version !== b.version ||
      row.nonce !== b.nonce
    )
      throw new ConflictException("A fresh unbound attempt is required");
    if (row.room.ranked && !row.recordingAt)
      throw new BadRequestException(
        "Start continuous recording before scramble verification",
      );
    if (
      SMART_PROFILES[b.model].deviceCounter
        ? b.counter === null
        : b.counter !== null
    )
      throw new BadRequestException(
        "Counter does not match the selected model",
      );
    const context = SmartAttemptContext.parse({
      model: b.model,
      platform: b.platform,
      reference: { up: "U", front: "F" },
      epoch: randomUUID(),
      nextSequence: 0,
      counter: b.counter,
      recoveryRun: 0,
      lastTime: null,
      independentState: true,
      continuity: SMART_PROFILES[b.model].deviceCounter
        ? "counter"
        : "net-state",
    });
    let state: CubeState;
    try {
      state = smartLessonState(context, b.faces);
    } catch {
      throw new BadRequestException("Invalid smart-cube position");
    }
    if (stateKey(state) !== stateKey(current(row)))
      throw new BadRequestException(
        "The device does not match the server scramble",
      );
    return this.play.smartWrite(r, row, async (tx) => {
      this.access.require(b.model, b.platform);
      return view(
        await tx.attempt.update({
          where: { id },
          data: {
            smart: json(context),
            smartSeenAt: new Date(),
            scrambleVerifiedAt: new Date(),
            version: { increment: 1 },
          },
        }),
      );
    });
  }
  @Post(":id/turns") async turns(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    z.string().uuid().parse(id);
    const b = SmartAttemptBatch.parse(body);
    await this.limit(r);
    const row = await this.play.smartAttempt(r, id);
    if (
      !row.smart ||
      row.version !== b.version ||
      row.nonce !== b.nonce ||
      !["CREATED", "INSPECTION", "SOLVING"].includes(row.status)
    )
      throw new ConflictException("Current bound smart attempt required");
    const context = SmartAttemptContext.parse(row.smart);
    this.access.require(context.model, context.platform);
    if (context.epoch !== b.epoch)
      throw new ConflictException("Connection epoch changed");
    if (row.status !== "SOLVING" && b.turns.length)
      return this.invalid(
        r,
        row,
        "Turning before solve start interrupts the physical attempt",
      );
    if (context.nextSequence + b.turns.length > 10000)
      throw new BadRequestException("Smart turn limit reached");
    let accepted: ReturnType<typeof smartAttemptTurns>;
    try {
      accepted = smartAttemptTurns(context, current(row), b);
    } catch (error) {
      return this.invalid(r, row, (error as Error).message);
    }
    const previous = row.moves as SmartAttemptView["moves"],
      elapsed = row.startedAt ? Date.now() - row.startedAt.getTime() : 0;
    // Receipt times preserve order; server clocks bound solve time. No device clock
    // or client-reported duration establishes a physical ranked result.
    const moves = [
      ...previous,
      ...accepted.moves.map((move, i) => ({
        sequence: previous.length + i,
        move,
        elapsedMs: elapsed,
      })),
    ];
    if (
      row.status === "SOLVING" &&
      (!row.startedAt || elapsed < 0 || elapsed > 3600000)
    )
      throw new BadRequestException("Solve deadline reached");
    return this.play.smartWrite(r, row, async (tx) => {
      this.access.require(context.model, context.platform);
      return view(
        await tx.attempt.update({
          where: { id },
          data: {
            smart: json(accepted.context),
            smartSeenAt: new Date(),
            moves: json(moves),
            version: { increment: 1 },
          },
        }),
      );
    });
  }
}
