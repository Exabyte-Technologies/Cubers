import test from "node:test";
import assert from "node:assert/strict";
import {
  DownloadedLesson,
  OFFLINE_LEASE_MS,
  lessons,
  guidedCourseId,
  guidedState,
  guidedFacelets,
  guidedGoal,
  practiceApply,
  practiceSolved,
  practiceKey,
  solvedPuzzle,
  scramblePuzzle,
  prepareGuidedState,
  isPyraminx,
  openOfflineGuidance,
  OfflineGuidanceError,
  type GuidedPuzzle,
  type GuidedSolvePlan,
  type PracticeState,
} from "@cubers/core";
import { planFirstSolve } from "../apps/api/src/first-solve-planner";
import { planFourFirstSolve } from "../apps/api/src/four-first-solve-planner";
import { planPyraminxFirstSolve } from "../apps/api/src/pyraminx-first-solve-planner";
const now = 1000;
const ownerId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
function fixture(
  puzzle: GuidedPuzzle,
  input: "virtual" | "scan" = "virtual",
  startingStage = 0,
) {
  let seed = 871;
  const random = () =>
    (seed = (1664525 * seed + 1013904223) >>> 0) / 0x100000000;
  const initial = prepareGuidedState(
    practiceApply(solvedPuzzle(puzzle), scramblePuzzle(puzzle, random)),
  );
  const plan: GuidedSolvePlan = isPyraminx(initial)
    ? planPyraminxFirstSolve(initial)
    : initial.size === 4
      ? planFourFirstSolve(initial)
      : planFirstSolve(initial);
  let starting = guidedState(puzzle, plan.startingFaces);
  for (const step of plan.steps.slice(0, startingStage))
    starting = practiceApply(starting, step.moves);
  return DownloadedLesson.parse({
    schemaVersion: 1,
    ownerId,
    region: "INTL",
    downloadedAt: now,
    expiresAt: now + OFFLINE_LEASE_MS,
    courseVersion: 1,
    lesson: lessons.find((lesson) => lesson.id === guidedCourseId(puzzle)),
    guidedPractice: {
      sourceId,
      sourceVersion: 0,
      puzzle,
      input,
      startingStage,
      startingFaces: guidedFacelets(starting),
      steps: plan.steps.slice(startingStage),
    },
  });
}
const code = (expected: OfflineGuidanceError["code"]) => (error: unknown) =>
  error instanceof OfflineGuidanceError && error.code === expected;
const options = { clock: () => now, pause: async () => {} };
test("downloaded plans complete every remaining checkpoint for all four puzzles with original bilingual teaching", async () => {
  for (const puzzle of ["2x2", "3x3", "4x4", "pyraminx"] as const) {
    const packet = fixture(puzzle),
      original = JSON.stringify(packet);
    let yields = 0;
    const session = await openOfflineGuidance(packet, {
      ...options,
      pause: async () => {
        yields++;
      },
    });
    assert.ok(yields >= packet.guidedPractice!.steps.length + 1);
    let expected = guidedState(puzzle, packet.guidedPractice!.startingFaces);
    for (const step of packet.guidedPractice!.steps) {
      for (const move of step.moves) session.turn(move);
      expected = practiceApply(expected, step.moves);
      assert.ok(guidedGoal(expected, step));
      assert.equal(
        practiceKey(guidedState(puzzle, session.view().faces)),
        practiceKey(expected),
      );
      assert.equal(session.view().ready, true);
      session.checkpoint();
    }
    assert.equal(session.view().completed, true);
    assert.ok(practiceSolved(guidedState(puzzle, session.view().faces)));
    assert.equal(
      JSON.stringify(packet),
      original,
      "Local activity must not mutate the downloaded packet",
    );
  }
});
test("frozen suffixes start at the saved checkpoint and finish without replaying earlier stages", async () => {
  for (const puzzle of ["2x2", "3x3", "4x4", "pyraminx"] as const) {
    const packet = fixture(puzzle, "virtual", puzzle === "4x4" ? 19 : 3);
    const session = await openOfflineGuidance(packet, options);
    assert.equal(
      session.view().sourceStage,
      packet.guidedPractice!.startingStage,
    );
    for (const step of packet.guidedPractice!.steps) {
      for (const move of step.moves) session.turn(move);
      session.checkpoint();
    }
    assert.equal(session.view().completed, true);
  }
});
test("physical offline practice requires fresh scans, resumes a checked prefix after reopening and never substitutes confirmations for checkpoint scans", async () => {
  for (const puzzle of ["2x2", "3x3", "4x4", "pyraminx"] as const) {
    const packet = fixture(puzzle, "scan");
    let session = await openOfflineGuidance(packet, options);
    assert.equal(session.view().needsScan, true);
    assert.throws(() => session.turn("U"), code("SCAN_REQUIRED"));
    assert.throws(() => session.checkpoint(), code("SCAN_REQUIRED"));
    let actual = guidedState(puzzle, packet.guidedPractice!.startingFaces);
    session.resumePhysical(guidedFacelets(actual));
    const firstMove = session.view().nextMove;
    assert.ok(
      firstMove,
      "The fixture must exercise an internal nonempty prefix",
    );
    session.turn(firstMove);
    actual = practiceApply(actual, [firstMove]);
    session = await openOfflineGuidance(packet, options);
    session.resumePhysical(guidedFacelets(actual));
    assert.equal(
      practiceKey(guidedState(puzzle, session.view().faces)),
      practiceKey(actual),
    );
    // Zero-turn stages may share a state; resume deliberately chooses the last
    // matching valid prefix. Every subsequent stage still gets a fresh scan.
    while (!session.view().completed) {
      const view = session.view(),
        step = view.step!;
      // The model may already be at an internal repeated prefix. Continue its
      // offered route rather than assuming an original sequence offset.
      let turns = 0;
      while (session.view().nextMove) {
        const move = session.view().nextMove!;
        session.turn(move);
        actual = practiceApply(actual, [move]);
        if (++turns > step.moves.length + 1)
          throw Error("Guide did not terminate");
      }
      assert.throws(() => session.checkpoint(), code("SCAN_REQUIRED"));
      session.checkpoint(guidedFacelets(actual));
    }
    assert.ok(practiceSolved(actual));
    const reopened = await openOfflineGuidance(packet, options);
    reopened.resumePhysical(guidedFacelets(actual));
    assert.equal(reopened.view().ready, true);
    reopened.suspend();
    assert.equal(reopened.view().needsScan, true);
    assert.throws(() => reopened.turn("U"), code("SCAN_REQUIRED"));
    reopened.resumePhysical(guidedFacelets(actual));
    reopened.checkpoint(guidedFacelets(actual));
    assert.equal(reopened.view().completed, true);
  }
});
test("malformed and mixed-course downloads are rejected before opening", () => {
  const valid = fixture("4x4");
  const rejects = (edit: (packet: any) => void) => {
    const packet = structuredClone(valid);
    edit(packet);
    assert.equal(DownloadedLesson.safeParse(packet).success, false);
  };
  rejects((packet) => {
    packet.lesson = lessons.find((lesson) => lesson.id === "3-first-solve");
  });
  rejects((packet) => {
    packet.guidedPractice.steps.pop();
  });
  rejects((packet) => {
    packet.guidedPractice.startingStage = 32;
  });
  rejects((packet) => {
    packet.guidedPractice.startingFaces.EXTRA = ["U"];
  });
  rejects((packet) => {
    packet.guidedPractice.steps[7].wingTarget.fill(0);
  });
  rejects((packet) => {
    packet.guidedPractice.steps[0].moves = ["Q"];
  });
  rejects((packet) => {
    packet.guidedPractice.steps[0].token = "private";
  });
  rejects((packet) => {
    packet.guidedPractice.steps[0].blocks = [["R"]];
  });
  rejects((packet) => {
    packet.guidedPractice.steps[0].moves = Array(2501).fill("R");
  });
});
test("legal-looking corrupted plans fail geometric admission and cannot expose mutable admitted state", async () => {
  const packet = fixture("3x3");
  const invalid = structuredClone(packet);
  invalid.guidedPractice!.steps.at(-1)!.moves = ["R"];
  invalid.guidedPractice!.steps.at(-1)!.blocks = [["R"]];
  await assert.rejects(openOfflineGuidance(invalid, options), code("INVALID"));
  const session = await openOfflineGuidance(packet, options);
  const before = JSON.stringify(session.view().faces);
  session.view().step!.moves.push("R");
  session.view().faces.U.fill("B");
  assert.equal(JSON.stringify(session.view().faces), before);
  assert.throws(() => session.turn("Rw"), code("INVALID"));
  session.turn("R");
  session.undo();
  assert.equal(JSON.stringify(session.view().faces), before);
  session.turn("U");
  session.resetVirtual();
  assert.equal(JSON.stringify(session.view().faces), before);
});
test("expired leases, cancellation and bounded admission time stop offline work", async () => {
  const packet = fixture("3x3");
  await assert.rejects(
    openOfflineGuidance(packet, { clock: () => packet.expiresAt }),
    code("EXPIRED"),
  );
  await assert.rejects(
    openOfflineGuidance(packet, { clock: () => 100_000_000 }),
    code("EXPIRED"),
  );
  const abort = new AbortController();
  await assert.rejects(
    openOfflineGuidance(packet, {
      clock: () => now,
      signal: abort.signal,
      pause: async () => {
        abort.abort();
      },
    }),
    code("CANCELLED"),
  );
  let time = now;
  await assert.rejects(
    openOfflineGuidance(packet, {
      clock: () => time,
      pause: async () => {
        time += 16_000;
      },
    }),
    code("INVALID"),
  );
  time = now;
  const session = await openOfflineGuidance(packet, {
    clock: () => time,
    pause: async () => {},
  });
  time = packet.expiresAt;
  for (const action of [
    () => session.view(),
    () => session.turn("U"),
    () => session.undo(),
    () => session.resetVirtual(),
    () => session.checkpoint(),
  ])
    assert.throws(action, code("EXPIRED"));
});
test("physical scans outside the admitted path cannot change the model or silently reset a physical cube", async () => {
  const packet = fixture("3x3", "scan"),
    session = await openOfflineGuidance(packet, options);
  let state: PracticeState = guidedState(
    "3x3",
    packet.guidedPractice!.startingFaces,
  );
  session.resumePhysical(guidedFacelets(state));
  const before = JSON.stringify(session.view().faces);
  assert.throws(() => session.resetVirtual(), code("SCAN_REQUIRED"));
  state = practiceApply(state, ["R", "F", "L", "D", "B", "R2"]);
  assert.throws(
    () => session.resumePhysical(guidedFacelets(state)),
    code("STATE_DIFFERS"),
  );
  assert.equal(JSON.stringify(session.view().faces), before);
  assert.throws(
    () => session.checkpoint(guidedFacelets(state)),
    code("STATE_DIFFERS"),
  );
});

test("offline continuation skips only intermediate model checks and still requires fresh physical scans at unit ends", async () => {
  for (const input of ["virtual", "scan"] as const) {
    const packet = fixture("3x3", input),
      session = await openOfflineGuidance(packet, options);
    if (input === "scan")
      session.resumePhysical(packet.guidedPractice!.startingFaces);
    let continued = 0,
      checked = 0;
    for (let guard = 0; guard < 14 && !session.view().completed; guard++) {
      const before = session.view();
      if (
        !before.canContinueWithoutCheck ||
        before.guideIndex !== before.step!.moves.length
      )
        assert.throws(() => session.continueWithoutCheck());
      for (const move of before.step!.moves) session.turn(move);
      const view = session.view();
      if (view.canContinueWithoutCheck) {
        session.continueWithoutCheck();
        continued++;
      } else {
        assert.throws(() => session.continueWithoutCheck());
        if (input === "scan") {
          assert.throws(() => session.checkpoint(), code("SCAN_REQUIRED"));
          session.checkpoint(view.faces);
        } else session.checkpoint();
        checked++;
      }
    }
    assert.equal(session.view().completed, true);
    assert.ok(continued > 0 && checked > 0);
  }
});
