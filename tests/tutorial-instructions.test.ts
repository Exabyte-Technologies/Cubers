import test from "node:test";
import assert from "node:assert/strict";
import {
  lessons,
  lessonAlgorithmCoaching,
  algorithmCoaching,
  lessonStageSetup,
  guidedFacelets,
  practiceApply,
  guidedState,
  solvedCube,
  applyMoves,
  scramble,
  type FirstSolveStep,
} from "@cubers/core";
import {
  registerTutorial,
  advanceTutorial,
} from "../apps/mobile/src/tutorial-flow";
import { planFirstSolve } from "../apps/api/src/first-solve-planner";
import {
  tutorialPulseOn,
  highlightTutorialStickers,
} from "../apps/mobile/src/tutorial-visuals";
import {
  buildCubeGroup,
  previewCubeFace,
  cubeDragAngle,
  faceNormal,
} from "../apps/mobile/src/cube-scene";
import * as THREE from "three";
import { PuzzleGesture } from "../apps/mobile/src/puzzle-gesture";

test("every authored lesson and alternative has a bounded observation sequence before its algorithm", () => {
  for (const lesson of lessons.filter((l) => l.kind !== "guided-first-solve")) {
    for (const option of [
      undefined,
      ...(lesson.alternatives || []).map((a) => a.id),
    ]) {
      for (const locale of ["en", "zh"] as const) {
        const coaching = lessonAlgorithmCoaching(lesson, [], locale, option)!;
        assert.ok(coaching, lesson.id);
        const instructions = coaching.instructions!;
        assert.equal(instructions[0].id, "objective");
        assert.equal(instructions.at(-1)?.kind, "perform");
        assert.ok(instructions.some((i) => i.highlights.length));
        assert.equal(
          new Set(instructions.map((i) => i.id)).size,
          instructions.length,
        );
        for (const instruction of instructions) {
          assert.ok(
            instruction.text.length > 0 &&
              !instruction.text.includes("undefined"),
            lesson.id,
          );
          assert.ok(!instruction.text.includes("\n\n"));
          for (const h of instruction.highlights)
            assert.ok(h.position.every(Number.isFinite));
        }
      }
    }
  }
});

test("corner observations identify the actual two nonwhite stickers and remain stable during a trigger", () => {
  const initial = lessonStageSetup("3-corners").state;
  const step: FirstSolveStep = {
    goal: "corner",
    target: 4,
    moves: ["R", "U", "R'", "U'"],
    blocks: [["R", "U", "R'", "U'"]],
  };
  let state = initial;
  const first = algorithmCoaching(step, guidedFacelets(state), 0, "3x3", "en")!;
  const colors = first.instructions!.find((i) => i.id === "colors")!;
  assert.equal(colors.highlights.length, 2);
  const cube = guidedState("3x3", guidedFacelets(state));
  assert.ok("size" in cube);
  if (!("size" in cube)) return;
  for (const h of colors.highlights) {
    const s = cube.stickers.find(
      (s) =>
        s.p.join() === h.position.join() &&
        s.normal.join() === h.normal?.join(),
    )!;
    assert.notEqual(s.color, "U");
    assert.ok(
      colors.text.includes(
        ({ F: "green", R: "red", B: "blue", L: "orange", D: "yellow" } as any)[
          s.color
        ],
      ),
    );
  }
  for (let cursor = 1; cursor < 4; cursor++) {
    state = practiceApply(state, [step.moves[cursor - 1]]);
    assert.deepEqual(
      algorithmCoaching(step, guidedFacelets(state), cursor, "3x3", "en")!
        .instructions,
      first.instructions,
    );
  }
});

test("yellow overlays preserve sticker colors and observe the exact 1 second on/off cycle", () => {
  assert.equal(tutorialPulseOn(0), true);
  assert.equal(tutorialPulseOn(999), true);
  assert.equal(tutorialPulseOn(1000), false);
  assert.equal(tutorialPulseOn(1999), false);
  assert.equal(tutorialPulseOn(2000), true);
  assert.equal(tutorialPulseOn(1500, true), true);
  const group = new THREE.Group(),
    cube = guidedState(
      "3x3",
      guidedFacelets(lessonStageSetup("3-corners").state),
    );
  assert.ok("size" in cube);
  if (!("size" in cube)) return;
  buildCubeGroup(group, cube);
  const mesh = group.children.find((x) => x.userData.normal) as THREE.Mesh;
  const color = (mesh.material as THREE.MeshStandardMaterial).color.getHex();
  const target = {
    position: mesh.userData.position,
    normal: mesh.userData.normal,
  };
  highlightTutorialStickers(group, [target], 0, false);
  assert.equal(mesh.children[0].visible, true);
  assert.equal(
    (mesh.material as THREE.MeshStandardMaterial).color.getHex(),
    color,
  );
  highlightTutorialStickers(group, [target], 1000, false);
  assert.equal(mesh.children[0].visible, false);
  highlightTutorialStickers(group, [], 2000, false);
  assert.equal(mesh.children[0].visible, false);
});

test("face preview can be cancelled without changing the engine and ambiguous center drags do not turn", () => {
  const group = new THREE.Group(),
    cube = guidedState(
      "3x3",
      guidedFacelets(lessonStageSetup("3-corners").state),
    );
  if (!("size" in cube)) throw Error("cube required");
  const before = JSON.stringify(cube);
  buildCubeGroup(group, cube);
  const positions = group.children.map((m) => m.position.clone());
  previewCubeFace(group, "F", 0.5, 0.08);
  previewCubeFace(group, null, 0, 0);
  assert.deepEqual(
    group.children.map((m) => m.position),
    positions,
  );
  assert.equal(JSON.stringify(cube), before);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  assert.equal(
    cubeDragAngle(
      group,
      camera,
      { x: 150, y: 150 },
      { x: 50, y: 0 },
      { width: 300, height: 300 },
      "F",
    ),
    0,
  );
  assert.equal(
    cubeDragAngle(
      group,
      camera,
      { x: 190, y: 150 },
      { x: 1, y: 1 },
      { width: 300, height: 300 },
      "F",
    ),
    0,
  );
});

test("information advances without touching the guide and established facts are skipped only within the same case", () => {
  let seed = 71;
  const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32;
  let exercised = false;
  for (let sample = 0; sample < 20 && !exercised; sample++) {
    let state = applyMoves(solvedCube(), scramble(3, random));
    const plan = planFirstSolve(state);
    state = applyMoves(state, plan.orientation);
    for (const step of plan.steps) {
      if (
        step.goal === "corner" &&
        step.blocks[0]?.length === 1 &&
        step.blocks.length > 1
      ) {
        const coaching = algorithmCoaching(
          step,
          guidedFacelets(state),
          0,
          "3x3",
          "en",
        )!;
        const before = JSON.stringify([state, coaching]);
        let flow = registerTutorial(null, coaching, 0)!;
        while (flow.coaching.instructions![flow.index].kind !== "perform")
          flow = advanceTutorial(flow)!;
        assert.equal(JSON.stringify([state, coaching]), before);
        const nextState = applyMoves(state, step.blocks[0]);
        const next = algorithmCoaching(
          step,
          guidedFacelets(nextState),
          1,
          "3x3",
          "en",
        )!;
        assert.equal(coaching.caseKey, next.caseKey);
        flow = registerTutorial(flow, next, 1)!;
        assert.ok(
          !flow.coaching.instructions!.some((i) =>
            ["objective", "inspect", "colors", "home"].includes(i.id),
          ),
        );
        assert.ok(
          flow.coaching.instructions!.some((i) =>
            i.text.includes("After that group"),
          ),
        );
        const reset = registerTutorial(flow, coaching, 0)!;
        assert.equal(reset.coaching.instructions![0].id, "objective");
        assert.equal(registerTutorial(reset, null, 0), null);
        exercised = true;
        break;
      }
      state = applyMoves(state, step.moves);
    }
  }
  assert.ok(
    exercised,
    "real planner must exercise a setup followed by an insertion",
  );
});

test("resuming midway through an algorithm never highlights its old starting position", () => {
  const step: FirstSolveStep = {
    goal: "corner",
    target: 4,
    moves: ["R", "U", "R'", "U'"],
    blocks: [["R", "U", "R'", "U'"]],
  };
  const state = practiceApply(lessonStageSetup("3-corners").state, ["R"]);
  const coaching = algorithmCoaching(
    step,
    guidedFacelets(state),
    1,
    "3x3",
    "en",
  )!;
  const flow = registerTutorial(null, coaching, 1)!;
  assert.equal(flow.coaching.instructions!.length, 1);
  assert.equal(flow.coaching.instructions![0].kind, "perform");
  assert.deepEqual(flow.coaching.instructions![0].highlights, []);
});

test("drag directions follow the selected face at every viewing angle", () => {
  for (const face of ["U", "D", "R", "L", "F", "B"] as const) {
    const group = new THREE.Group();
    group.rotation.set(0.22, 0.37, -0.12);
    const normal = faceNormal(face),
      radial =
        Math.abs(normal.x) === 1
          ? new THREE.Vector3(0, 0.7, 0)
          : new THREE.Vector3(0.7, 0, 0);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const worldNormal = normal.clone().applyQuaternion(group.quaternion);
    camera.position.copy(worldNormal.multiplyScalar(6));
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    group.updateMatrixWorld();
    const screen = (p: THREE.Vector3) => {
      p.applyMatrix4(group.matrixWorld).project(camera);
      return { x: (p.x + 1) * 150, y: (1 - p.y) * 150 };
    };
    const start = screen(normal.clone().multiplyScalar(1.2).add(radial));
    for (const angle of [-0.5, 0.5]) {
      const end = screen(
        normal
          .clone()
          .multiplyScalar(1.2)
          .add(radial.clone().applyAxisAngle(normal, angle)),
      );
      const actual = cubeDragAngle(
        group,
        camera,
        start,
        { x: end.x - start.x, y: end.y - start.y },
        { width: 300, height: 300 },
        face,
      );
      assert.ok(
        Math.abs(actual - angle) < 1e-6,
        `${face}: ${actual} vs ${angle}`,
      );
    }
  }
});

test("multi-touch, interruption and tiny gestures never commit a selected face drag", () => {
  const gesture = new PuzzleGesture();
  gesture.begin(40, 50);
  gesture.move(30, 20, 1);
  gesture.observeTouches(2);
  assert.deepEqual(gesture.finishGesture(40, 30), { drag: false });
  gesture.begin(40, 50);
  gesture.move(30, 20, 1);
  gesture.cancel();
  assert.deepEqual(gesture.finishGesture(40, 30), { drag: false });
  gesture.begin(40, 50);
  assert.deepEqual(gesture.finishGesture(2, 1), {
    tap: { x: 40, y: 50 },
    drag: false,
  });
  gesture.begin(40, 50);
  assert.deepEqual(gesture.finishGesture(30, 20), { drag: true });
});
