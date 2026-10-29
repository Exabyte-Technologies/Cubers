import { z } from "zod";
import {
  SmartLessonContext,
  SmartLessonAction,
  SmartLessonModel,
  SmartHardwareFaces,
  smartStreamTurns,
} from "./learning";
import type { CubeState } from "../puzzle";
const Counter = z.number().int().min(0).max(255).nullable();
export const SMART_PLAY_LEASE = 30000;
export const SmartAttemptContext = SmartLessonContext.extend({
  nextSequence: z.number().int().min(0).max(10000),
}).strict();
export type SmartAttemptContext = z.infer<typeof SmartAttemptContext>;
export const SmartAttemptBind = z
  .object({
    nonce: z.string().min(1).max(200),
    version: z.number().int().min(0),
    model: SmartLessonModel,
    platform: z.enum(["ios", "android"]),
    faces: SmartHardwareFaces,
    counter: Counter,
  })
  .strict();
const SmartTurn = SmartLessonAction.options[1].shape.turns.element
  .extend({ sequence: z.number().int().min(0).max(9999) })
  .strict();
export const SmartAttemptBatch = SmartLessonAction.options[1]
  .extend({
    nonce: z.string().min(1).max(200),
    turns: z.array(SmartTurn).max(50),
  })
  .strict();
export type SmartAttemptBatch = z.infer<typeof SmartAttemptBatch>;
export function smartAttemptTurns(
  context: SmartAttemptContext,
  expected: CubeState,
  action: SmartAttemptBatch,
) {
  const result = smartStreamTurns(
    SmartAttemptContext.parse(context),
    expected,
    action,
  );
  return { ...result, context: SmartAttemptContext.parse(result.context) };
}
export type SmartAttemptView = {
  id: string;
  nonce: string;
  version: number;
  status: string;
  smart: SmartAttemptContext | null;
  scramble: string[];
  moves: { sequence: number; move: string; elapsedMs: number }[];
  recordingAt: string | null;
  inspectionAt: string | null;
  startedAt: string | null;
  durationMs: number | null;
};
