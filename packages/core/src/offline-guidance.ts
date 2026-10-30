import { lessonStageComplete } from "./lesson-stage";
import { canContinueUnit, nextUnitStage } from "./unit-continuation";
import { DownloadedLesson } from "./downloads";
import {
  guidedState,
  guidedFacelets,
  guidedGoal,
  guidedInverse,
  prepareGuidedState,
} from "./guided";
import {
  practiceApply,
  practiceKey,
  practiceScan,
  practiceSolved,
  type PracticeState,
} from "./practice";
import type { GuidedSolveStep } from "./first-solve";

export class OfflineGuidanceError extends Error {
  constructor(
    public code:
      | "EXPIRED"
      | "CANCELLED"
      | "INVALID"
      | "SCAN_REQUIRED"
      | "STATE_DIFFERS"
      | "TURN_LIMIT",
  ) {
    super(code);
  }
}
type Admission = {
  clock?: () => number;
  pause?: () => Promise<void>;
  signal?: AbortSignal;
};
const checkWindow = (packet: DownloadedLesson, clock: () => number) => {
  const now = clock();
  if (
    !Number.isFinite(now) ||
    now < packet.downloadedAt - 60_000 ||
    now >= packet.expiresAt
  )
    throw new OfflineGuidanceError("EXPIRED");
};

// Reconstructs a downloaded plan cooperatively. No search, server request,
// result upload or hidden physical tracking is performed on the device.
export async function openOfflineGuidance(
  value: unknown,
  options: Admission = {},
) {
  const packet = DownloadedLesson.parse(value),
    snapshot = packet.guidedPractice;
  if (!snapshot) throw new OfflineGuidanceError("INVALID");
  const clock = options.clock || Date.now;
  const started = clock();
  const check = () => {
    if (options.signal?.aborted) throw new OfflineGuidanceError("CANCELLED");
    checkWindow(packet, clock);
    if (clock() - started > 15_000) throw new OfflineGuidanceError("INVALID");
  };
  const pause =
    options.pause ||
    (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  check();
  await pause();
  check();
  let state = practiceScan(snapshot.puzzle, snapshot.startingFaces);
  const initial = state,
    targets: PracticeState[] = [],
    prefixes: Map<string, number>[] = [];
  for (const step of snapshot.steps) {
    const positions = new Map([[practiceKey(state), 0]]);
    for (let index = 0; index < step.moves.length; index++) {
      state = practiceApply(state, [step.moves[index]]);
      positions.set(practiceKey(state), index + 1);
      if (index % 16 === 15) {
        await pause();
        check();
      }
    }
    if (!guidedGoal(state, step as GuidedSolveStep))
      throw new OfflineGuidanceError("INVALID");
    targets.push(state);
    prefixes.push(positions);
    await pause();
    check();
  }
  if (
    snapshot.lessonId
      ? !lessonStageComplete(state, snapshot.lessonId)
      : !practiceSolved(state)
  )
    throw new OfflineGuidanceError("INVALID");
  // Keep an isolated parsed copy; callers cannot mutate the admitted packet.
  return new OfflineGuidanceSession(packet, initial, targets, prefixes, clock);
}

class OfflineGuidanceSession {
  private stage = 0;
  private current: PracticeState;
  private turns: string[] = [];
  private needsScan: boolean;
  constructor(
    private packet: DownloadedLesson,
    private initial: PracticeState,
    private targets: PracticeState[],
    private prefixes: Map<string, number>[],
    private clock: () => number,
  ) {
    this.current = initial;
    this.needsScan = packet.guidedPractice!.input === "scan";
  }
  private check() {
    checkWindow(this.packet, this.clock);
  }
  view() {
    this.check();
    const snapshot = this.packet.guidedPractice!,
      step = snapshot.steps[this.stage];
    const index = this.prefixes[this.stage]?.get(practiceKey(this.current));
    return {
      puzzle: snapshot.puzzle,
      input: snapshot.input,
      stage: this.stage,
      sourceStage: snapshot.startingStage,
      total: snapshot.steps.length,
      completed: !step,
      needsScan: this.needsScan,
      faces: guidedFacelets(this.current),
      step: step ? structuredStep(step) : null,
      guideIndex: index ?? 0,
      matchedGuide: index !== undefined,
      canContinueWithoutCheck: canContinueUnit(
        snapshot.steps as GuidedSolveStep[],
        this.stage,
        snapshot.lessonId,
      ),
      nextMove:
        this.needsScan || index === undefined ? undefined : step?.moves[index],
      canUndo: this.turns.length > 0,
      undoMove: this.turns.length
        ? guidedInverse(snapshot.puzzle, [this.turns.at(-1)!])[0]
        : undefined,
      ready: !!step && guidedGoal(this.current, step as GuidedSolveStep),
    };
  }
  turn(move: string) {
    this.check();
    const snapshot = this.packet.guidedPractice!;
    if (this.needsScan) throw new OfflineGuidanceError("SCAN_REQUIRED");
    if (this.stage >= snapshot.steps.length)
      throw new OfflineGuidanceError("INVALID");
    const pattern =
      snapshot.puzzle === "pyraminx"
        ? /^[ULRBulrb]'?$/
        : snapshot.puzzle === "4x4"
          ? /^[URFDLB]w?(2|')?$/
          : /^[URFDLB](2|')?$/;
    if (!pattern.test(move)) throw new OfflineGuidanceError("INVALID");
    if (this.turns.length >= 1000) throw new OfflineGuidanceError("TURN_LIMIT");
    this.current = practiceApply(this.current, [move]);
    this.turns.push(move);
  }
  undo() {
    this.check();
    if (this.needsScan) throw new OfflineGuidanceError("SCAN_REQUIRED");
    const move = this.turns.pop();
    if (move)
      this.current = practiceApply(
        this.current,
        guidedInverse(this.packet.guidedPractice!.puzzle, [move]),
      );
  }
  resetVirtual() {
    this.check();
    if (this.packet.guidedPractice!.input !== "virtual")
      throw new OfflineGuidanceError("SCAN_REQUIRED");
    this.current =
      this.stage === 0 ? this.initial : this.targets[this.stage - 1];
    this.turns = [];
  }
  suspend() {
    if (this.packet.guidedPractice!.input === "scan") this.needsScan = true;
  }
  resumePhysical(faces: Record<string, string[]>) {
    this.check();
    const snapshot = this.packet.guidedPractice!;
    if (snapshot.input !== "scan") throw new OfflineGuidanceError("INVALID");
    const state = prepareGuidedState(practiceScan(snapshot.puzzle, faces)),
      key = practiceKey(state);
    for (let stage = this.prefixes.length - 1; stage >= 0; stage--) {
      if (!this.prefixes[stage].has(key)) continue;
      this.stage = stage;
      this.current = state;
      this.turns = [];
      this.needsScan = false;
      return;
    }
    throw new OfflineGuidanceError("STATE_DIFFERS");
  }
  continueWithoutCheck() {
    this.check();
    const snapshot = this.packet.guidedPractice!,
      step = snapshot.steps[this.stage];
    if (
      !step ||
      this.needsScan ||
      this.prefixes[this.stage].get(practiceKey(this.current)) !==
        step.moves.length
    )
      throw new OfflineGuidanceError("STATE_DIFFERS");
    try {
      this.stage = nextUnitStage(
        snapshot.steps as GuidedSolveStep[],
        this.stage,
        this.current,
        snapshot.lessonId,
      );
    } catch {
      throw new OfflineGuidanceError("SCAN_REQUIRED");
    }
    this.turns = [];
  }
  checkpoint(faces?: Record<string, string[]>) {
    this.check();
    const snapshot = this.packet.guidedPractice!,
      step = snapshot.steps[this.stage];
    if (!step || this.needsScan)
      throw new OfflineGuidanceError("SCAN_REQUIRED");
    if ((snapshot.input === "scan") !== !!faces)
      throw new OfflineGuidanceError("SCAN_REQUIRED");
    const state = faces
      ? prepareGuidedState(practiceScan(snapshot.puzzle, faces))
      : this.current;
    if (
      practiceKey(state) !== practiceKey(this.targets[this.stage]) ||
      !guidedGoal(state, step as GuidedSolveStep)
    )
      throw new OfflineGuidanceError("STATE_DIFFERS");
    this.current = state;
    this.turns = [];
    this.stage++;
  }
}
export type OfflineGuidance = OfflineGuidanceSession;
function structuredStep(
  step: NonNullable<DownloadedLesson["guidedPractice"]>["steps"][number],
): GuidedSolveStep {
  return JSON.parse(JSON.stringify(step)) as GuidedSolveStep;
}
