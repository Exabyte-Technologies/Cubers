import test from "node:test";
import { canContinueUnit, nextUnitStage } from "@cubers/core";
import { syncPuzzleViewport } from "../apps/mobile/src/puzzle-viewport";
import { tutorialLayout } from "../apps/mobile/src/tutorial-layout";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  algorithmCoaching,
  lessonAlgorithmCoaching,
  teachingNotation,
  teachingRotation,
  applyMoves,
  facelets,
  inverse,
  solvedCube,
  stateKey,
  turn,
  scramble,
  firstSolveGoal,
  lessons,
  guidedFacelets,
  guidedGoal,
  isPyraminx,
  practiceApply,
  type FirstSolveStep,
} from "@cubers/core";
import { planFirstSolve } from "../apps/api/src/first-solve-planner";
import { planPyraminxFirstSolve } from "../apps/api/src/pyraminx-first-solve-planner";
import { planFourFirstSolve } from "../apps/api/src/four-first-solve-planner";
import { lessonStageSetup } from "@cubers/core";
import {
  turnCueSpec,
  squareCuePoint,
  buildTurnCue,
  animateTurnCue,
  buildPyraminxTurnCue,
} from "../apps/mobile/src/turn-cue";

test("250 random legal states use only U setups and complete forward sexy triggers for white corners", () => {
  const seen = [
    new Set<number>(),
    new Set<number>(),
    new Set<number>(),
    new Set<number>(),
  ];
  let seed = 730;
  const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32;
  for (let sample = 0; sample < 250; sample++) {
    const input = applyMoves(solvedCube(), scramble(3, random)),
      plan = planFirstSolve(input);
    let state = applyMoves(input, plan.orientation);
    for (const step of plan.steps) {
      if (step.goal === "corner") {
        for (const block of step.blocks) {
          if (block.length === 1) assert.match(block[0], /^U(2|')?$/);
          else {
            assert.equal(block.length, 4);
            const coaching = algorithmCoaching(
              { ...step, moves: block, blocks: [block] },
              facelets(state),
              0,
              "3x3",
              "en",
            )!;
            assert.deepEqual(coaching.algorithm, ["R", "U", "R'", "U'"]);
            const before = state;
            state = applyMoves(state, block);
            assert.equal(firstSolveGoal(state, "cross"), true);
            if (step.target! > 4)
              assert.equal(
                firstSolveGoal(state, "corner", step.target! - 1),
                true,
              );
            // Both the actual notation and regripped notation produce exactly
            // the same colors, without changing the saved center frame.
            assert.equal(
              stateKey(
                applyMoves(before, [
                  ...teachingRotation(coaching.frame),
                  ...coaching.algorithm,
                  ...inverse(teachingRotation(coaching.frame)),
                ]),
              ),
              stateKey(state),
            );
            seen[step.target! - 4].add(coaching.frame);
            continue;
          }
          state = applyMoves(state, block);
        }
        assert.equal(firstSolveGoal(state, "corner", step.target), true);
      } else state = applyMoves(state, step.moves);
    }
  }
  assert.ok(seen.every((frames) => frames.size >= 1));
});

test("every y-frame move and algorithm agrees with engine geometry on arbitrary states", () => {
  for (const size of [2, 3, 4] as const) {
    const state = applyMoves(solvedCube(size), "R U F' L2 B");
    for (let frame = 0; frame < 4; frame++)
      for (const face of [
        "U",
        "R",
        "F",
        "D",
        "L",
        "B",
        ...(size > 2 ? ["Rw", "Uw", "Fw", "Lw", "Dw", "Bw"] : []),
      ])
        for (const suffix of ["", "'", "2"]) {
          const actual = face + suffix,
            relative = teachingNotation(actual, frame),
            rotation = teachingRotation(frame);
          assert.equal(
            stateKey(applyMoves(state, [actual, ...rotation])),
            stateKey(applyMoves(state, [...rotation, relative])),
          );
        }
  }
});

test("case explanation and algorithm are stable within each block in both languages, with no hint off-guide", () => {
  for (const id of [
    "3-corners",
    "3-middle",
    "3-yellow-cross",
    "3-sune",
    "3-pll",
    "2-beginner",
    "pyr-intuitive",
    "4-reduction",
  ]) {
    const { state: start } = lessonStageSetup(id);
    const plan = isPyraminx(start)
      ? planPyraminxFirstSolve(start)
      : start.size === 4
        ? planFourFirstSolve(start)
        : planFirstSolve(start);
    let state = practiceApply(start, plan.orientation);
    for (const step of plan.steps) {
      let cursor = 0;
      for (const block of step.blocks) {
        const reference = ["en", "zh"].map((locale) =>
          algorithmCoaching(
            step,
            guidedFacelets(state),
            cursor,
            plan.puzzle!,
            locale as "en" | "zh",
          ),
        );
        for (let i = 0; i < block.length; i++) {
          for (const [j, locale] of (["en", "zh"] as const).entries()) {
            const current = algorithmCoaching(
              step,
              guidedFacelets(state),
              cursor,
              plan.puzzle!,
              locale,
            )!;
            assert.ok(current?.explanation, id);
            assert.equal(
              current.explanation,
              reference[j]!.explanation,
              `${id}:${step.goal}:${cursor}`,
            );
            assert.equal(current.holding, reference[j]!.holding);
            assert.deepEqual(current.algorithm, reference[j]!.algorithm);
            assert.equal(
              current.nextMove,
              teachingNotation(step.moves[cursor], current.frame),
            );
            assert.equal(
              algorithmCoaching(
                step,
                guidedFacelets(state),
                cursor,
                plan.puzzle!,
                locale,
                false,
              ),
              null,
            );
          }
          state = practiceApply(state, [block[i]]);
          cursor++;
        }
      }
      assert.equal(
        algorithmCoaching(
          step,
          guidedFacelets(state),
          cursor,
          plan.puzzle!,
          "en",
        ),
        null,
      );
      assert.equal(guidedGoal(state, step), true);
    }
  }
});

test("corner teaching observes white facing up, sideways, trapped below, and top setup without inventing a case", () => {
  const sexy = ["R", "U", "R'", "U'"],
    solved = applyMoves(solvedCube(), "z2");
  const cases = new Set<string>();
  for (let count = 1; count < 6; count++) {
    const state = applyMoves(
      solved,
      Array.from({ length: count }, () => inverse(sexy)).flat(),
    );
    const step: FirstSolveStep = {
      goal: "corner",
      target: 4,
      moves: sexy,
      blocks: [sexy],
    };
    const coaching = algorithmCoaching(step, facelets(state), 0, "3x3", "en")!;
    if (coaching.explanation.includes("sideways")) cases.add("sideways");
    if (coaching.explanation.includes("upward")) cases.add("upward");
    if (coaching.explanation.includes("trapped")) cases.add("trapped");
    assert.match(coaching.explanation, /white, green, orange/);
  }
  assert.deepEqual(cases, new Set(["sideways", "upward", "trapped"]));
});

test("all published lesson and alternate algorithms retain their authored explanations while their cursor advances", () => {
  for (const lesson of lessons.filter(
    (row) => row.kind !== "guided-first-solve",
  )) {
    for (const option of [undefined, ...(lesson.alternatives || [])])
      for (const locale of ["en", "zh"] as const) {
        const moves = (option?.algorithm || lesson.algorithm).split(" "),
          reference = lessonAlgorithmCoaching(lesson, [], locale, option?.id)!;
        assert.ok(reference.explanation.includes(lesson.summary[locale]));
        for (let index = 0; index < moves.length; index++) {
          const current = lessonAlgorithmCoaching(
            lesson,
            moves.slice(0, index),
            locale,
            option?.id,
          )!;
          assert.equal(current.explanation, reference.explanation);
          assert.equal(current.nextMove, moves[index]);
        }
        assert.equal(
          lessonAlgorithmCoaching(lesson, moves, locale, option?.id),
          null,
        );
        assert.equal(
          lessonAlgorithmCoaching(lesson, ["not-a-turn"], locale, option?.id),
          null,
        );
      }
  }
});

test("square arrow travel and orientation agree with the engine for all six faces, primes and half-turns", () => {
  for (const face of ["U", "R", "F", "D", "L", "B"])
    for (const suffix of ["", "'", "2"]) {
      const move = face + suffix,
        spec = turnCueSpec(move)!,
        root = new THREE.Group();
      buildTurnCue(root, move);
      const plane = root.children[0];
      const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(
        plane.quaternion,
      );
      assert.ok(outward.distanceTo(new THREE.Vector3(...spec.normal)) < 1e-10);
      // Compare a real sticker's angular direction about the outward normal.
      const cube = solvedCube(),
        before = cube.stickers.find(
          (s) =>
            s.normal.join() === spec.normal.join() &&
            s.p.some((v, axis) => axis !== spec.axis && v !== 1),
        )!;
      const after = turn({ ...cube, stickers: [before] }, move).stickers[0];
      const a = new THREE.Vector3(...before.p).subScalar(1),
        b = new THREE.Vector3(...after.p).subScalar(1);
      if (suffix !== "2")
        assert.equal(
          Math.sign(new THREE.Vector3().crossVectors(a, b).dot(outward)),
          spec.direction,
        );
      animateTurnCue(root, 400, false);
      const first = plane.children.find(
        (mesh) => mesh.userData.cueArrow === 0,
      )!;
      const position = first.position.clone();
      animateTurnCue(root, 450, false);
      assert.ok(position.distanceTo(first.position) > 0);
      animateTurnCue(root, 0, true);
      const still = first.position.clone();
      animateTurnCue(root, 10000, true);
      assert.deepEqual(first.position.toArray(), still.toArray());
    }
  assert.equal(turnCueSpec("garbage"), null);
  for (let t = 0.01; t < 1; t += 0.05) {
    const a = squareCuePoint(t),
      b = squareCuePoint(t + 0.0001);
    assert.ok(
      (b.x - a.x) * Math.cos(a.angle) + (b.y - a.y) * Math.sin(a.angle) > 0,
    );
  }
});

test("Pyraminx cues distinguish tiny tips from large vertex layers and reverse direction", () => {
  for (const move of ["U", "L", "R", "B", "u", "l", "r", "b"]) {
    const a = new THREE.Group(),
      b = new THREE.Group();
    buildPyraminxTurnCue(a, move);
    buildPyraminxTurnCue(b, move + "'");
    assert.equal(
      a.children[0].userData.cueSpec.direction,
      -b.children[0].userData.cueSpec.direction,
    );
    assert.equal(
      a.children[0].scale.x,
      move === move.toLowerCase() ? 0.3 : 0.72,
    );
  }
});

test("cube ribbons hug the side stickers of exactly the selected layer, rather than floating over its face", () => {
  for (const size of [2, 3, 4] as const)
    for (const face of ["U", "R", "F", "D", "L", "B"]) {
      const root = new THREE.Group();
      buildTurnCue(root, face, "#0064be", size);
      root.updateMatrixWorld(true);
      const belt = root.children[0],
        spec = belt.userData.cueSpec;
      assert.equal(spec.ribbon, true);
      const normal = new THREE.Vector3(...spec.normal),
        lower = 1.2 - 2.4 / size;
      const bands = belt.children.filter(
        (child) => child.userData.cueRibbon,
      ) as THREE.Mesh[];
      assert.equal(bands.length, 4);
      for (const band of bands) {
        const bandNormal = new THREE.Vector3(0, 0, 1).transformDirection(
          band.matrixWorld,
        );
        assert.ok(
          Math.abs(bandNormal.dot(normal)) < 1e-10,
          "band lies on a neighboring side, perpendicular to selected face",
        );
        const points = band.geometry.getAttribute("position");
        for (let i = 0; i < points.count; i++) {
          const point = new THREE.Vector3()
            .fromBufferAttribute(points, i)
            .applyMatrix4(band.matrixWorld);
          const alongAxis = point.dot(normal);
          assert.ok(
            alongAxis > lower && alongAxis < 1.2,
            "all ribbon vertices belong to the selected layer",
          );
          assert.ok(
            Math.abs(Math.max(...point.toArray().map(Math.abs)) - 1.225) < 1e-6,
          );
        }
      }
    }
  const single = new THREE.Group(),
    wide = new THREE.Group();
  buildTurnCue(single, "R", undefined, 4);
  buildTurnCue(wide, "Rw", undefined, 4);
  assert.ok(
    wide.children[0].userData.cueSpec.width >
      single.children[0].userData.cueSpec.width * 2,
  );
});

test("zero-sized and resized puzzle canvases recover their projection without resizing on every frame", () => {
  const previous = { width: -1, height: -1 },
    sizes: number[][] = [];
  let projections = 0;
  const renderer = {
      setSize: (w: number, h: number) => {
        sizes.push([w, h]);
      },
    },
    camera = {
      aspect: NaN,
      updateProjectionMatrix: () => {
        projections++;
      },
    };
  assert.equal(
    syncPuzzleViewport(
      previous,
      { drawingBufferWidth: 0, drawingBufferHeight: 0 },
      renderer,
      camera,
    ),
    false,
  );
  assert.equal(
    syncPuzzleViewport(
      previous,
      { drawingBufferWidth: 600, drawingBufferHeight: 300 },
      renderer,
      camera,
    ),
    true,
  );
  assert.equal(camera.aspect, 2);
  assert.equal(
    syncPuzzleViewport(
      previous,
      { drawingBufferWidth: 600, drawingBufferHeight: 300 },
      renderer,
      camera,
    ),
    true,
  );
  assert.equal(projections, 1);
  assert.equal(
    syncPuzzleViewport(
      previous,
      { drawingBufferWidth: 390, drawingBufferHeight: 240 },
      renderer,
      camera,
    ),
    true,
  );
  assert.equal(camera.aspect, 390 / 240);
  assert.deepEqual(sizes, [
    [600, 300],
    [390, 240],
  ]);
});

test("phone lesson budgets leave the cube and action row inside common portrait and landscape viewports", () => {
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [430, 932],
    [667, 375],
  ]) {
    const layout = tutorialLayout(width, height, 0, 0);
    assert.ok(layout.compact);
    assert.ok(layout.cubeHeight >= 120);
    assert.ok(layout.coachingHeight >= 140);
    if (height >= 568)
      assert.ok(layout.cubeHeight + layout.coachingHeight + 221 <= height);
  }
  assert.equal(tutorialLayout(1024, 768).compact, false);
  assert.equal(tutorialLayout(390, 844, 0, 0, 1.5).largeText, true);
});

test("continuation boundaries follow lesson units and never skip their last check", () => {
  const steps: FirstSolveStep[] = [
    { goal: "corner", target: 4, moves: [], blocks: [] },
    { goal: "corner", target: 5, moves: [], blocks: [] },
    { goal: "corner", target: 6, moves: [], blocks: [] },
    { goal: "corner", target: 7, moves: [], blocks: [] },
    { goal: "middle", target: 8, moves: [], blocks: [] },
  ];
  const state = applyMoves(solvedCube(), "z2");
  assert.equal(nextUnitStage(steps, 0, state), 3);
  assert.equal(canContinueUnit(steps, 3), false);
  assert.throws(() => nextUnitStage(steps, 3, state));
  assert.equal(canContinueUnit(steps, 3, "one-scoped-unit"), true);
  assert.equal(nextUnitStage(steps, 3, state, "one-scoped-unit"), 4);
  assert.throws(() => nextUnitStage(steps, 4, state, "one-scoped-unit"));
  assert.throws(() => nextUnitStage(steps, 0, applyMoves(state, "R")));
  for (const index of [-1, 99, NaN])
    assert.equal(canContinueUnit(steps, index), false);
});
