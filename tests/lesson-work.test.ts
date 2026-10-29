import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lessons,
  practiceApply,
  practiceSetup,
  practiceKey,
  practiceSolved,
} from "@cubers/core";
import {
  LessonWork,
  demonstrateLesson,
  type LessonFrame,
} from "../apps/mobile/src/lesson-work";

function active() {
  const work = new LessonWork();
  work.focus(true);
  work.activate(true);
  return work;
}
test("lesson operations exclude overlap and stale completion cannot release a newer task", () => {
  const work = new LessonWork();
  assert.equal(work.begin(), undefined);
  work.focus(true);
  assert.equal(work.begin(), undefined);
  work.activate(true);
  const old = work.begin()!;
  assert.equal(work.begin(), undefined);
  work.activate(false);
  assert.equal(old.current(), false);
  assert.equal(old.signal.aborted, true);
  work.activate(true);
  const next = work.begin()!;
  assert.equal(old.finish(), false);
  assert.equal(work.ready, false);
  assert.equal(next.current(), true);
  assert.equal(next.finish(), true);
  assert.equal(work.ready, true);
});
test("blurred/background lesson responses stay stale after returning and after a new load", async () => {
  for (const interrupt of ["blur", "background"] as const) {
    const work = active(),
      task = work.begin()!;
    let deliver!: (value: string) => void,
      output = "";
    const request = new Promise<string>((resolve) => {
      deliver = resolve;
    })
      .then((value) => {
        if (task.current()) output = value;
      })
      .finally(() => task.finish());
    if (interrupt === "blur") work.focus(false);
    else work.activate(false);
    work.focus(true);
    work.activate(true);
    const current = work.begin()!;
    deliver("stale explanation / checkpoint / lesson");
    await request;
    assert.equal(output, "");
    assert.equal(current.current(), true);
    current.finish();
  }
});
test("all 66 shorter guides and four puzzle baselines keep every displayed frame consistent", async () => {
  const examples = lessons
    .filter((row) => row.alternatives?.length)
    .map((lesson) => ({
      lesson,
      sequence: lesson.alternatives![0].algorithm.split(" "),
    }));
  for (const puzzle of ["2x2", "3x3", "4x4", "pyraminx"] as const) {
    const lesson = lessons.find(
      (row) => row.puzzle === puzzle && row.kind !== "guided-first-solve",
    )!;
    assert.ok(lesson, puzzle);
    examples.push({ lesson, sequence: lesson.algorithm.split(" ") });
  }
  for (const { lesson, sequence } of examples) {
    const work = active(),
      task = work.begin()!;
    let count = 0,
      last: LessonFrame | undefined;
    await demonstrateLesson(
      lesson,
      sequence,
      task,
      (frame) => {
        assert.deepEqual(frame.moves, sequence.slice(0, count));
        assert.equal(
          practiceKey(frame.state),
          practiceKey(
            practiceApply(
              practiceSetup(lesson.puzzle, lesson.algorithm),
              frame.moves,
            ),
          ),
        );
        assert.equal(frame.lastMove, frame.moves.at(-1));
        last = frame;
        count++;
      },
      true,
    );
    assert.equal(count, sequence.length + 1);
    assert.equal(practiceSolved(last!.state), true);
    assert.equal(task.finish(), true);
  }
});
test("interrupted demos cancel pending timers and retain precisely the visible moves", async () => {
  const lesson = lessons.find((row) => row.alternatives?.length)!;
  for (const interrupt of ["blur", "background"] as const) {
    const work = active(),
      task = work.begin()!,
      frames: LessonFrame[] = [];
    await demonstrateLesson(
      lesson,
      lesson.alternatives![0].algorithm.split(" "),
      task,
      (frame) => {
        frames.push(frame);
        if (frame.moves.length === 2) {
          if (interrupt === "blur") work.focus(false);
          else work.activate(false);
        }
      },
      true,
    );
    assert.equal(frames.length, 3);
    const last = frames.at(-1)!;
    assert.equal(
      practiceKey(last.state),
      practiceKey(
        practiceApply(
          practiceSetup(lesson.puzzle, lesson.algorithm),
          last.moves,
        ),
      ),
    );
    assert.equal(task.finish(), false);
  }
  const work = active(),
    task = work.begin()!;
  let count = 0;
  const demo = demonstrateLesson(
    lesson,
    ["R"],
    task,
    () => {
      count++;
    },
    false,
  );
  work.activate(false);
  await demo;
  assert.equal(
    count,
    1,
    "an already scheduled normal-motion turn must not execute",
  );
  assert.equal(task.signal.aborted, true);
});
