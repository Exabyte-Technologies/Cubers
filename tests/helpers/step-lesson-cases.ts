import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import {
  lessonStageSetup,
  lessonStageComplete,
  guidedState,
  guidedFacelets,
  practiceApply,
  practiceSolved,
  prepareGuidedState,
  solvedPuzzle,
  SmartCubeFrame,
  SMART_FIRST_SOLVE_REFERENCE,
  facelets,
  type GuidedSolveView,
} from "@cubers/core";
import type { Authed } from "../../apps/api/src/security";
import { Db, Infrastructure } from "../../apps/api/src/services";
import { SmartFirstSolveController } from "../../apps/api/src/smart-first-solve.controller";
import { SmartLessonAccess } from "../../apps/api/src/smart-learning.controller";

type Person = { u: { id: string }; token: string };
type Harness = {
  db: PrismaClient;
  fixture: (name: string, birthDate: string) => Promise<Person>;
  actor: (person: any) => Promise<Authed>;
  infra: () => Infrastructure;
  call: (
    path: string,
    body?: unknown,
    token?: string,
    method?: string,
  ) => Promise<{ status: number; body: any }>;
};
export function registerStepLessonCases(h: Harness) {
  const course = (id: string) =>
    h.db.course.findUniqueOrThrow({ where: { id } });
  async function start(
    person: Person,
    id: string,
    input = "virtual",
    faces?: Record<string, string[]>,
  ) {
    const row = await course(id);
    const result = await h.call(
      "first-solves",
      {
        input,
        puzzle: (row.content as any).puzzle,
        lessonId: id,
        courseVersion: row.version,
        ...(faces ? { faces } : {}),
      },
      person.token,
    );
    return result;
  }
  async function finish(
    person: Person,
    initial: GuidedSolveView,
    scan = false,
  ) {
    let view = initial,
      guard = 0;
    while (view.status === "ACTIVE") {
      assert.ok(++guard <= 32);
      const state = practiceApply(
        guidedState(view.puzzle || "3x3", view.currentFaces),
        view.step!.moves,
      );
      if (!scan && view.step!.moves.length) {
        for (let offset = 0; offset < view.step!.moves.length;) {
          const moves = view.step!.moves.slice(offset, offset + 100);
          offset += moves.length;
          const result = await h.call(
            `first-solves/${view.id}/moves`,
            { version: view.version, moves },
            person.token,
          );
          assert.equal(result.status, 201, JSON.stringify(result.body));
          view = result.body;
        }
      }
      const checked = await h.call(
        `first-solves/${view.id}/checkpoint`,
        {
          version: view.version,
          ...(scan ? { faces: guidedFacelets(state) } : {}),
        },
        person.token,
      );
      assert.equal(checked.status, 201, JSON.stringify(checked.body));
      view = checked.body;
    }
    assert.equal(view.status, "COMPLETED");
    return view;
  }
  test("scanned and custom-color lessons can start alongside a saved practice in another unit", async () => {
    const owner = await h.fixture("stage-scan-conflict", "1990-01-01");
    const peer = await h.fixture("stage-scan-conflict-peer", "1990-01-01");
    for (const input of ["scan", "virtual"]) {
      const faces = guidedFacelets(lessonStageSetup("3-corners").state);
      const full = await start(owner, "3-first-solve", input, faces);
      assert.equal(full.status, 201, JSON.stringify(full.body));
      const before = await h.db.guidedSolve.findUniqueOrThrow({
        where: { id: full.body.id },
      });
      const corners = await start(owner, "3-corners", input, faces);
      assert.equal(corners.status, 201, JSON.stringify(corners.body));
      assert.equal(corners.body.lessonId, "3-corners");
      assert.deepEqual(corners.body.currentFaces, faces);
      const middle = await start(
        owner,
        "3-middle",
        input,
        guidedFacelets(lessonStageSetup("3-middle").state),
      );
      assert.equal(middle.status, 201, JSON.stringify(middle.body));
      assert.equal(middle.body.lessonId, "3-middle");
      // A second start in the same unit still requires an explicit resume/end.
      const duplicate = await start(owner, "3-corners", input, faces);
      assert.equal(duplicate.status, 409);
      assert.match(duplicate.body.message, /Resume or end/);
      assert.deepEqual(
        await h.db.guidedSolve.findUniqueOrThrow({ where: { id: before.id } }),
        before,
        "Starting another unit must preserve the earlier practice exactly",
      );
      const history = await h.call(
        "first-solves?puzzle=3x3&lessonId=3-corners",
        undefined,
        owner.token,
      );
      assert.equal(history.status, 200);
      assert.ok(
        history.body.active.some((row: any) => row.id === corners.body.id),
      );
      assert.ok(
        history.body.items.every((row: any) => row.id !== full.body.id),
      );
    }
    assert.equal(
      await h.db.guidedSolve.count({
        where: { userId: owner.u.id, status: "ACTIVE" },
      }),
      6,
    );
    const peerScan = await start(
      peer,
      "3-corners",
      "scan",
      guidedFacelets(lessonStageSetup("3-corners").state),
    );
    assert.equal(peerScan.status, 201, JSON.stringify(peerScan.body));
    assert.equal(
      await h.db.guidedSolve.count({ where: { userId: peer.u.id } }),
      1,
    );
    assert.equal(
      await h.db.progress.count({ where: { userId: owner.u.id } }),
      0,
    );
    assert.equal(
      await h.db.attempt.count({ where: { userId: owner.u.id } }),
      0,
    );
  });
  test("stage tutorial rejects the wrong prerequisite or puzzle without storing a session and identifies the correct lesson", async () => {
    const owner = await h.fixture("stage-admission", "1990-01-01");
    const wrong = await start(
      owner,
      "3-corners",
      "scan",
      guidedFacelets(lessonStageSetup("3-cross").state),
    );
    assert.equal(wrong.status, 409);
    assert.equal(wrong.body.code, "LESSON_STAGE_MISMATCH");
    assert.deepEqual(wrong.body.lessonStage, {
      requestedLessonId: "3-corners",
      actualLessonId: "3-cross",
      reason: "prerequisite",
    });
    const done = await start(
      owner,
      "3-corners",
      "virtual",
      guidedFacelets(prepareGuidedState(solvedPuzzle("3x3"))),
    );
    assert.equal(done.status, 409);
    assert.equal(done.body.lessonStage.actualLessonId, null);
    assert.equal(
      (
        await h.call(
          "first-solves",
          { input: "virtual", puzzle: "2x2", lessonId: "3-corners" },
          owner.token,
        )
      ).status,
      400,
    );
    assert.equal(
      await h.db.guidedSolve.count({ where: { userId: owner.u.id } }),
      0,
    );
  });
  test("prepared and custom-color tutorials for all four puzzles save only their own stage progress", async () => {
    const owner = await h.fixture("stage-completion", "1990-01-01");
    for (const id of [
      "3-corners",
      "3-middle",
      "2-beginner",
      "4-reduction",
      "pyr-intuitive",
    ]) {
      const result = await start(owner, id);
      assert.equal(result.status, 201, JSON.stringify(result.body));
      let view = result.body as GuidedSolveView;
      assert.equal(view.lessonId, id);
      assert.ok(view.setupMoves?.length);
      assert.deepEqual(
        view.currentFaces,
        guidedFacelets(lessonStageSetup(id).state),
      );
      const packet = await h.call(
        `first-solves/${view.id}/download`,
        { version: view.version },
        owner.token,
      );
      assert.equal(packet.status, 201);
      assert.equal(packet.body.guidedPractice.lessonId, id);
      view = await finish(owner, view);
      assert.equal(
        lessonStageComplete(guidedState(view.puzzle!, view.currentFaces), id),
        true,
      );
      assert.equal(
        (
          await h.db.progress.findUniqueOrThrow({
            where: { userId_lessonId: { userId: owner.u.id, lessonId: id } },
          })
        ).completed,
        true,
      );
      assert.equal(
        (
          await h.call(
            `first-solves/${view.id}/checkpoint`,
            { version: view.version },
            owner.token,
          )
        ).status,
        409,
      );
    }
    assert.equal(
      await h.db.progress.count({
        where: { userId: owner.u.id, lessonId: { endsWith: "first-solve" } },
      }),
      0,
    );
    assert.equal(
      await h.db.attempt.count({ where: { userId: owner.u.id } }),
      0,
    );
    const actual = lessonStageSetup("3-yellow-cross").state;
    const custom = await start(
      owner,
      "3-yellow-cross",
      "virtual",
      guidedFacelets(actual),
    );
    assert.equal(custom.status, 201);
    assert.equal(custom.body.setupMoves, undefined);
    assert.deepEqual(custom.body.currentFaces, guidedFacelets(actual));
    await finish(owner, custom.body);
  });
  test("camera stage guidance requires fresh checkpoint scans, crops replanning, and isolates history and ownership", async () => {
    const owner = await h.fixture("stage-camera", "1990-01-01"),
      peer = await h.fixture("stage-camera-peer", "1990-01-01");
    const result = await start(
      owner,
      "3-corners",
      "scan",
      guidedFacelets(lessonStageSetup("3-corners").state),
    );
    assert.equal(result.status, 201);
    let view = result.body as GuidedSolveView;
    assert.equal(
      (await h.call(`first-solves/${view.id}`, undefined, peer.token)).status,
      404,
    );
    assert.equal(
      (
        await h.call(
          `first-solves/${view.id}/checkpoint`,
          { version: view.version },
          owner.token,
        )
      ).status,
      400,
    );
    const denied = await h.call(
      `first-solves/${view.id}/rescan`,
      {
        version: view.version,
        faces: guidedFacelets(lessonStageSetup("3-cross").state),
      },
      owner.token,
    );
    assert.equal(denied.status, 409);
    assert.equal(denied.body.lessonStage.actualLessonId, "3-cross");
    const recovered = await h.call(
      `first-solves/${view.id}/rescan`,
      { version: view.version, faces: view.currentFaces },
      owner.token,
    );
    assert.equal(recovered.status, 201);
    view = recovered.body;
    const stored = await h.db.guidedSolve.findUniqueOrThrow({
      where: { id: view.id },
    });
    assert.ok(
      (stored.plan as any).steps.every((s: any) => s.goal === "corner"),
    );
    assert.equal(
      (
        await h.call("first-solves?puzzle=3x3", undefined, owner.token)
      ).body.items.some((s: any) => s.id === view.id),
      false,
    );
    assert.equal(
      (
        await h.call(
          "first-solves?puzzle=3x3&lessonId=3-corners",
          undefined,
          owner.token,
        )
      ).body.active.find((row: any) => row.input === "scan")?.id,
      view.id,
    );
    await finish(owner, view, true);
  });
  for (const input of ["virtual", "scan"])
    test(`unit continuation: ${input} defers intermediate checks without final credit or a final-check bypass`, async () => {
      const owner = await h.fixture(`unit-${input}`, "1990-01-01"),
        stranger = await h.fixture(`unit-other-${input}`, "1990-01-01");
      const { inverse } = await import("@cubers/core");
      const initial = practiceApply(
        prepareGuidedState(solvedPuzzle("3x3")),
        ["R", "F", "L", "B"].flatMap((f) => inverse([f, "U", f + "'", "U'"])),
      );
      const started = await start(
        owner,
        "3-corners",
        input,
        guidedFacelets(initial),
      );
      assert.equal(started.status, 201);
      let view = started.body as GuidedSolveView,
        continued = 0;
      const endpoint = () => `first-solves/${view.id}/continue`;
      assert.equal(
        (await h.call(endpoint(), { version: view.version })).status,
        401,
      );
      assert.equal(
        (await h.call(endpoint(), { version: view.version }, stranger.token))
          .status,
        404,
      );
      assert.equal(
        (await h.call(endpoint(), { version: view.version }, owner.token))
          .status,
        400,
      );
      for (let guard = 0; guard < 5; guard++) {
        const moves = view.step!.moves;
        if (moves.length) {
          const moved = await h.call(
            `first-solves/${view.id}/moves`,
            { version: view.version, moves },
            owner.token,
          );
          assert.equal(moved.status, 201);
          view = moved.body;
        }
        assert.equal(
          await h.db.progress.count({ where: { userId: owner.u.id } }),
          0,
        );
        const previousVersion = view.version;
        const next = await h.call(
          endpoint(),
          { version: view.version },
          owner.token,
        );
        if (!view.canContinueWithoutCheck) {
          assert.equal(next.status, 400);
          break;
        }
        assert.equal(next.status, 201);
        view = next.body;
        continued++;
        assert.equal(view.status, "ACTIVE");
        assert.equal(view.checkpoints.at(-1)?.kind, "CONTINUE_UNCHECKED");
        assert.equal(
          (await h.call(endpoint(), { version: previousVersion }, owner.token))
            .status,
          409,
        );
      }
      assert.ok(continued > 0);
      assert.equal(view.canContinueWithoutCheck, false);
      assert.equal(view.stage, 3);
      if (input === "scan")
        assert.equal(
          (
            await h.call(
              `first-solves/${view.id}/checkpoint`,
              { version: view.version },
              owner.token,
            )
          ).status,
          400,
        );
      const final = await h.call(
        `first-solves/${view.id}/checkpoint`,
        {
          version: view.version,
          ...(input === "scan" ? { faces: view.currentFaces } : {}),
        },
        owner.token,
      );
      assert.equal(final.status, 201);
      assert.equal(final.body.status, "COMPLETED");
      assert.equal(final.body.checkpoints.at(-1).kind, "CHECKPOINT");
      assert.equal(
        await h.db.progress.count({
          where: { userId: owner.u.id, completed: true },
        }),
        1,
      );
    });
  test("smart stage guidance uses independent hardware colors and counters, refuses prerequisites and stops at corners", async () => {
    const owner = await h.fixture("stage-smart", "1990-01-01"),
      actor = await h.actor(owner);
    // Isolated synthetic acceptance only. Production device gates remain unchanged.
    class SyntheticAcceptance extends SmartLessonAccess {
      require() {}
    }
    const { FirstSolveSolver } =
      await import("../../apps/api/dist/first-solve-solver");
    const solver = new FirstSolveSolver();
    const service = new SmartFirstSolveController(
      h.db as Db,
      h.infra(),
      new SyntheticAcceptance(),
      solver as any,
    );
    const version = (await course("3-corners")).version,
      frame = new SmartCubeFrame(SMART_FIRST_SOLVE_REFERENCE);
    try {
      await assert.rejects(
        service.create(actor, {
          model: "gan-356-i3",
          platform: "ios",
          courseVersion: version,
          lessonId: "3-corners",
          faces: facelets(
            frame.toHardwareState(lessonStageSetup("3-cross").state as any),
          ),
          counter: 5,
        }),
        (e: any) => e.getStatus?.() === 409,
      );
      let hardware = frame.toHardwareState(
          lessonStageSetup("3-corners").state as any,
        ),
        counter = 5,
        sequence = 0;
      let view = await service.create(actor, {
        model: "gan-356-i3",
        platform: "ios",
        courseVersion: version,
        lessonId: "3-corners",
        faces: facelets(hardware),
        counter,
      });
      assert.deepEqual(
        view.guidance.currentFaces,
        guidedFacelets(frame.toTeachingState(hardware)),
      );
      let guard = 0;
      while (view.status === "PRACTICING") {
        assert.ok(++guard <= 4);
        for (const turn of view.guidance.step!.moves) {
          const move = frame.toHardwareMove(turn);
          hardware = practiceApply(hardware, [move]) as any;
          counter = (counter + 1) & 255;
          view = await service.action(actor, view.id, {
            action: "turns",
            version: view.version,
            epoch: view.smart.epoch,
            turns: [
              {
                sequence: sequence++,
                move,
                counter,
                receivedAt: sequence * 100,
                recovered: false,
              },
            ],
            faces: facelets(hardware),
            counter,
            independentState: true,
          });
        }
        if (view.guidance.canContinueWithoutCheck) {
          view = await service.action(actor, view.id, {
            action: "continue",
            version: view.version,
            epoch: view.smart.epoch,
          });
          assert.equal(view.status, "PRACTICING");
          assert.equal(
            await h.db.progress.count({ where: { userId: owner.u.id } }),
            0,
          );
          continue;
        }
        await assert.rejects(
          service.action(actor, view.id, {
            action: "continue",
            version: view.version,
            epoch: view.smart.epoch,
          }),
          (e: any) => e.getStatus?.() === 400,
        );
        view = await service.action(actor, view.id, {
          action: "checkpoint",
          version: view.version,
          epoch: view.smart.epoch,
          faces: facelets(hardware),
          counter,
        });
      }
      assert.equal(view.status, "COMPLETED");
      assert.equal(view.guidance.lessonId, "3-corners");
      assert.equal(
        lessonStageComplete(frame.toTeachingState(hardware), "3-corners"),
        true,
      );
      assert.equal(
        (
          await h.db.progress.findUniqueOrThrow({
            where: {
              userId_lessonId: { userId: owner.u.id, lessonId: "3-corners" },
            },
          })
        ).completed,
        true,
      );
      assert.equal(
        await h.db.progress.count({
          where: { userId: owner.u.id, lessonId: "3-first-solve" },
        }),
        0,
      );
    } finally {
      await solver.onModuleDestroy();
    }
  });
}
