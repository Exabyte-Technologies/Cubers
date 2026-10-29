import { z } from "zod";
import { SmartAttemptContext } from "./smart/play";
import { SmartLessonModel } from "./smart/learning";
import { SMART_PROFILES } from "./smart/types";
import { Puzzle, MoveEvent } from "./contracts";
import {
  practiceApply,
  practiceSolved,
  solvedPuzzle,
  type PracticeState,
} from "./practice";

const Fields = {
  attemptId: z.string().uuid(),
  puzzle: Puzzle,
  mode: z.enum(["race", "daily"]),
  durationMs: z.number().int().min(300).max(3600000),
  createdAt: z.string().datetime(),
  scramble: z.array(z.string().min(1).max(8)).max(100),
};
const moves = z.array(z.string().min(1).max(8)).max(10000);
const events = z.array(MoveEvent).max(10000);
const Telemetry = z
  .object({
    model: SmartLessonModel,
    continuity: z.enum(["counter", "net-state"]),
  })
  .strict();
const PacketShape = z.discriminatedUnion("input", [
  z.object({ ...Fields, input: z.literal("virtual"), moves }).strict(),
  z
    .object({
      ...Fields,
      puzzle: z.literal("3x3"),
      input: z.literal("smart"),
      moves: moves.min(1),
      telemetry: Telemetry,
    })
    .strict(),
]);
export const ReplayPacket = PacketShape.superRefine((packet, ctx) => {
  if (
    packet.input === "smart" &&
    SMART_PROFILES[packet.telemetry.model].deviceCounter !==
      (packet.telemetry.continuity === "counter")
  )
    ctx.addIssue({
      code: "custom",
      message: "Telemetry continuity does not match this model",
    });
});
export type ReplayPacket = z.infer<typeof ReplayPacket>;
export const ReplaySource = z.discriminatedUnion("input", [
  z.object({ ...Fields, input: z.literal("virtual"), events }).strict(),
  z
    .object({
      ...Fields,
      puzzle: z.literal("3x3"),
      input: z.literal("smart"),
      events,
      smart: SmartAttemptContext,
    })
    .strict(),
]);
/** Validate saved smart metadata without exposing connection identifiers. */
export function replayTelemetry(raw: unknown, turns: number) {
  const smart = SmartAttemptContext.parse(raw),
    counted = SMART_PROFILES[smart.model].deviceCounter;
  if (
    smart.reference.up !== "U" ||
    smart.reference.front !== "F" ||
    smart.recoveryRun !== 0 ||
    !smart.independentState ||
    smart.nextSequence !== turns ||
    turns < 1 ||
    smart.lastTime === null ||
    (counted
      ? smart.counter === null || smart.continuity !== "counter"
      : smart.counter !== null || smart.continuity !== "net-state")
  )
    throw Error("Incomplete saved smart stream");
  return { model: smart.model, continuity: smart.continuity };
}
/** Run geometric verification in a bounded server worker, never award progress. */
export function validatedReplay(source: unknown): ReplayPacket {
  const parsed = ReplaySource.parse(source);
  const { events } = parsed;
  const fields = {
    attemptId: parsed.attemptId,
    puzzle: parsed.puzzle,
    mode: parsed.mode,
    durationMs: parsed.durationMs,
    createdAt: parsed.createdAt,
    scramble: parsed.scramble,
  };
  const telemetry =
    parsed.input === "smart"
      ? replayTelemetry(parsed.smart, events.length)
      : null;
  let elapsed = -1;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (
      (parsed.input === "smart" && !/^[URFDLB](?:2|')?$/.test(e.move)) ||
      e.sequence !== i ||
      e.elapsedMs < elapsed ||
      e.elapsedMs > fields.durationMs + 1000
    )
      throw Error("Inconsistent saved move stream");
    elapsed = e.elapsedMs;
  }
  const moves = events.map((e) => e.move);
  let state = practiceApply(solvedPuzzle(fields.puzzle), fields.scramble);
  for (const move of moves) state = practiceApply(state, [move]);
  if (!practiceSolved(state))
    throw Error("Saved sequence does not solve its scramble");
  return ReplayPacket.parse(
    parsed.input === "smart"
      ? { ...fields, input: "smart", moves, telemetry }
      : { ...fields, input: "virtual", moves },
  );
}

/** At most 101 checkpoint states; seeking reconstructs at most 99 turns. */
export class ReplayTimeline {
  private constructor(
    readonly packet: ReplayPacket,
    private checkpoints: Map<number, PracticeState>,
  ) {}
  static async create(
    value: unknown,
    pause: () => Promise<void>,
    current = () => true,
  ): Promise<ReplayTimeline> {
    const packet = ReplayPacket.parse(value);
    if (!current()) throw Error("Replay cancelled");
    let state = practiceApply(solvedPuzzle(packet.puzzle), packet.scramble);
    const checkpoints = new Map<number, PracticeState>([[0, state]]);
    for (let i = 0; i < packet.moves.length; i++) {
      if (!current()) throw Error("Replay cancelled");
      if (
        packet.input === "smart" &&
        !/^[URFDLB](?:2|')?$/.test(packet.moves[i])
      )
        throw Error("Invalid smart turn");
      state = practiceApply(state, [packet.moves[i]]);
      if ((i + 1) % 100 === 0) {
        checkpoints.set(i + 1, state);
        await pause();
      }
    }
    if (!current()) throw Error("Replay cancelled");
    if (!practiceSolved(state))
      throw Error("Saved sequence does not solve its scramble");
    return new ReplayTimeline(packet, checkpoints);
  }
  stateAt(index: number): PracticeState {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index > this.packet.moves.length
    )
      throw Error("Invalid replay position");
    const checkpoint = Math.floor(index / 100) * 100;
    return practiceApply(
      this.checkpoints.get(checkpoint)!,
      this.packet.moves.slice(checkpoint, index),
    );
  }
}
