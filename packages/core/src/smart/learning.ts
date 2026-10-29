import { z } from "zod";
import { SmartReference, SmartCubeFrame } from "./frame";
import { SMART_PROFILES } from "./types";
import {
  facelets,
  fromFacelets,
  applyMoves,
  stateKey,
  type CubeState,
} from "../puzzle";
import type { Lesson } from "../curriculum";
import type { GuidedSolveView } from "../first-solve";
import { practiceSetup } from "../practice";

export const SmartLessonModel = z.enum([
  "gan-356-i3",
  "gocube-edge",
  "giiker-i3s",
]);
const Counter = z.number().int().min(0).max(255).nullable();
export const SmartLessonContext = z
  .object({
    model: SmartLessonModel,
    platform: z.enum(["ios", "android"]),
    reference: SmartReference,
    epoch: z.string().uuid(),
    nextSequence: z.number().int().min(0).max(2000),
    counter: Counter,
    recoveryRun: z.number().int().min(0).max(6),
    lastTime: z.number().finite().min(0).max(1e12).nullable(),
    independentState: z.boolean(),
    continuity: z.enum(["counter", "net-state"]),
  })
  .strict();
export type SmartLessonContext = z.infer<typeof SmartLessonContext>;
export const SmartHardwareFaces = z
  .object({
    U: z.array(z.enum(["U", "R", "F", "D", "L", "B"])).length(9),
    R: z.array(z.enum(["U", "R", "F", "D", "L", "B"])).length(9),
    F: z.array(z.enum(["U", "R", "F", "D", "L", "B"])).length(9),
    D: z.array(z.enum(["U", "R", "F", "D", "L", "B"])).length(9),
    L: z.array(z.enum(["U", "R", "F", "D", "L", "B"])).length(9),
    B: z.array(z.enum(["U", "R", "F", "D", "L", "B"])).length(9),
  })
  .strict();
const Base = { version: z.number().int().min(0), epoch: z.string().uuid() };
export const SmartLessonCreate = z
  .object({
    model: SmartLessonModel,
    platform: z.enum(["ios", "android"]),
    courseVersion: z.number().int().positive(),
    alternativeId: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .optional(),
  })
  .strict();
export const SmartLessonAction = z.discriminatedUnion("action", [
  z
    .object({
      ...Base,
      action: z.literal("confirm"),
      faces: SmartHardwareFaces,
      counter: Counter,
    })
    .strict(),
  z
    .object({
      ...Base,
      action: z.literal("turns"),
      turns: z
        .array(
          z
            .object({
              sequence: z.number().int().min(0).max(1999),
              move: z
                .string()
                .regex(/^[URFDLB](2|')?$/)
                .refine((move) => !/\s/.test(move)),
              receivedAt: z.number().finite().min(0).max(1e12),
              counter: Counter,
              recovered: z.boolean(),
            })
            .strict(),
        )
        .max(50),
      faces: SmartHardwareFaces,
      independentState: z.boolean(),
      counter: Counter,
    })
    .strict(),
  z
    .object({
      ...Base,
      action: z.literal("finish"),
      faces: SmartHardwareFaces,
      counter: Counter,
    })
    .strict(),
  z.object({ ...Base, action: z.literal("interrupt") }).strict(),
]);
export type SmartLessonAction = z.infer<typeof SmartLessonAction>;
export const SmartGuidedCreate = SmartLessonCreate.omit({ alternativeId: true })
  .extend({
    faces: SmartHardwareFaces,
    counter: Counter,
    lessonId: z.string().max(80).optional(),
  })
  .strict();
export const SmartGuidedAction = z.discriminatedUnion("action", [
  SmartLessonAction.options[1],
  z
    .object({
      ...Base,
      action: z.literal("checkpoint"),
      faces: SmartHardwareFaces,
      counter: Counter,
    })
    .strict(),
  z
    .object({
      ...Base,
      action: z.literal("replan"),
      faces: SmartHardwareFaces,
      counter: Counter,
    })
    .strict(),
  SmartLessonAction.options[3],
]);
export type SmartGuidedAction = z.infer<typeof SmartGuidedAction>;
export type SmartConnectionView = {
  id: string;
  version: number;
  status: string;
  smart: SmartLessonContext;
};
export type SmartGuidedView = SmartConnectionView & {
  guidance: GuidedSolveView;
  courseVersion: number;
  createdAt: string;
  expiresAt: string;
  finishedAt: string | null;
};
export type SmartPracticeView = SmartLessonView | SmartGuidedView;
export type SmartLessonView = {
  id: string;
  lessonId: string;
  puzzle: "3x3";
  input: "smart";
  version: number;
  status: string;
  algorithm: string;
  guideId: string | null;
  guideAlgorithm: string | null;
  courseVersion: number;
  moves: string[];
  smart: SmartLessonContext;
  createdAt: string;
  expiresAt: string;
  finishedAt: string | null;
};

/** A fixed teaching reference is derived from the saved exercise, never gyro. */
export function smartLessonReference(
  lesson: Pick<Lesson, "puzzle" | "algorithm">,
) {
  if (lesson.puzzle !== "3x3")
    throw Error("Smart lessons require a 3×3 exercise");
  const start = practiceSetup(lesson.puzzle, lesson.algorithm) as CubeState,
    colors = facelets(start);
  const reference = SmartReference.parse({
    up: colors.U[4],
    front: colors.F[4],
  });
  new SmartCubeFrame(reference).toHardwareState(start);
  return reference;
}
export function smartLessonState(context: SmartLessonContext, raw: unknown) {
  const faces = SmartHardwareFaces.parse(raw),
    hardware = fromFacelets(3, faces);
  // Frame projection performs complete reachability and hardware-center checks.
  return new SmartCubeFrame(context.reference).toTeachingState(hardware);
}
export function checkSmartLessonSnapshot(
  context: SmartLessonContext,
  expected: CubeState,
  raw: unknown,
  counter: number | null,
) {
  if (stateKey(smartLessonState(context, raw)) !== stateKey(expected))
    throw Error(
      "Device position differs from the saved exercise and received turns",
    );
  if (
    SMART_PROFILES[context.model].deviceCounter
      ? counter === null || counter !== context.counter
      : counter !== null
  )
    throw Error("Device counter does not match this connection");
}
export function smartLessonTurns(
  context: SmartLessonContext,
  expected: CubeState,
  action: Extract<SmartLessonAction, { action: "turns" }>,
) {
  const accepted = smartStreamTurns(
    SmartLessonContext.parse(context),
    expected,
    action,
  );
  return { ...accepted, context: SmartLessonContext.parse(accepted.context) };
}
/** Shared checked telemetry. API callers supply their strict action/context
 * schemas, then enforce their workflow-specific sequence and lifetime bounds. */
export function smartStreamTurns(
  context: SmartLessonContext,
  expected: CubeState,
  action: Extract<SmartLessonAction, { action: "turns" }>,
) {
  const next = { ...context, reference: { ...context.reference } },
    frame = new SmartCubeFrame(next.reference),
    moves: string[] = [];
  let state = expected;
  for (const turn of action.turns) {
    if (
      turn.sequence !== next.nextSequence ||
      (next.lastTime !== null && turn.receivedAt < next.lastTime)
    )
      throw Error("Missing, repeated or out-of-order device turns");
    if (SMART_PROFILES[next.model].deviceCounter) {
      if (next.counter === null || turn.counter !== ((next.counter + 1) & 255))
        throw Error("Hardware move counter has a gap");
      next.counter = turn.counter;
      next.recoveryRun = turn.recovered ? next.recoveryRun + 1 : 0;
      if (next.recoveryRun > 6)
        throw Error("Recovered turn history exceeds this model's bound");
    } else if (turn.counter !== null || turn.recovered)
      throw Error("This model cannot certify counter-based recovered turns");
    const move = frame.toTeachingMove(turn.move);
    state = applyMoves(state, [move]);
    moves.push(move);
    next.nextSequence++;
    next.lastTime = turn.receivedAt;
  }
  checkSmartLessonSnapshot(next, state, action.faces, action.counter);
  next.independentState = action.independentState;
  return { context: next, state, moves };
}
