import {
  practiceApply,
  practiceSetup,
  isPyraminx,
  pyraminxFacelets,
  pyraminxFromFacelets,
  facelets,
  fromFacelets,
  type Lesson,
  type PracticeState,
} from "@cubers/core";
const clone = (state: PracticeState): PracticeState =>
  isPyraminx(state)
    ? pyraminxFromFacelets(pyraminxFacelets(state))
    : fromFacelets(state.size, facelets(state));

/** One operation for one focused, foreground lesson view. Old callbacks cannot
 * publish into a later operation, even after the view returns to the foreground. */
export class LessonWork {
  private focused = false;
  private foreground = false;
  private pending?: AbortController;
  focus(value: boolean) {
    this.focused = value;
    if (!value) this.cancel();
  }
  activate(value: boolean) {
    this.foreground = value;
    if (!value) this.cancel();
  }
  get ready() {
    return this.focused && this.foreground && !this.pending;
  }
  private cancel() {
    const pending = this.pending;
    this.pending = undefined;
    pending?.abort();
  }
  begin() {
    if (!this.ready) return;
    const controller = new AbortController();
    this.pending = controller;
    const current = () =>
      this.pending === controller && !controller.signal.aborted;
    return {
      current,
      signal: controller.signal,
      finish: () => {
        if (!current()) return false;
        this.pending = undefined;
        return true;
      },
    };
  }
}
export type LessonTask = NonNullable<ReturnType<LessonWork["begin"]>>;

function pause(ms: number, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal.aborted) return resolve(false);
    const stopped = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stopped);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stopped);
      resolve(true);
    }, ms);
    signal.addEventListener("abort", stopped, { once: true });
  });
}
export type LessonFrame = {
  state: PracticeState;
  moves: string[];
  lastMove?: string;
};
export async function demonstrateLesson(
  lesson: Pick<Lesson, "puzzle" | "algorithm">,
  sequence: readonly string[],
  task: LessonTask,
  frame: (value: LessonFrame) => void,
  reducedMotion: boolean,
) {
  return demonstrateState(
    practiceSetup(lesson.puzzle, lesson.algorithm),
    sequence,
    task,
    frame,
    reducedMotion,
  );
}
export async function demonstrateState(
  initial: PracticeState,
  sequence: readonly string[],
  task: LessonTask,
  frame: (value: LessonFrame) => void,
  reducedMotion: boolean,
) {
  if (!task.current()) return;
  let state = clone(initial);
  const moves: string[] = [];
  frame({ state: clone(state), moves: [] });
  for (const move of sequence) {
    if (!(await pause(reducedMotion ? 1 : 500, task.signal)) || !task.current())
      return;
    state = practiceApply(state, [move]);
    moves.push(move);
    // Record each visible turn, not only the completed demonstration.
    frame({
      state: clone(state),
      moves: [...moves],
      lastMove: move,
    });
  }
}
