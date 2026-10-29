import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  FACES,
  facelets,
  solvedCube,
  applyMoves,
  stateKey,
} from "@cubers/core";
import { cameraFixture } from "./helpers/scan-camera-fixture";
import {
  inspectScanFrame,
  AutomaticScanGate,
  resolveAutomaticScan,
  SCAN_TURNS,
} from "../apps/mobile/src/automatic-scan";

test("camera alignment fits modest perspective, framing, warm colors, glare, thin seams and defocus without misreading sticker locations", async () => {
  const conditions = [
    {},
    { light: 0.55, blur: 1 },
    {
      corners: [
        [85, 76],
        [345, 76],
        [345, 336],
        [85, 336],
      ],
    },
    {
      corners: [
        [80, 65],
        [335, 86],
        [314, 335],
        [60, 315],
      ],
    },
    {
      corners: [
        [67, 86],
        [317, 61],
        [337, 317],
        [87, 336],
      ],
    },
    { gap: 0.008, blur: 1 },
    { glare: true },
    { blur: 1.5 },
  ] as const;
  for (const size of [2, 3, 4] as const)
    for (const [index, condition] of conditions.entries()) {
      const colors = Array.from(
        { length: size * size },
        (_, i) => FACES[i % 6],
      );
      const p = await cameraFixture({ size, colors, ...condition });
      const f = inspectScanFrame(p.data, p.width, p.height, size, 0);
      assert.equal(f.aligned, true, `${size} condition ${index}`);
      assert.deepEqual(
        f.samples.map((s) => s.color),
        colors,
        `${size} condition ${index} sticker correspondence`,
      );
    }
});
test("geometric admission still rejects clipped/off-center/small/large faces and plain fields", async () => {
  const wrong = [
    [
      [115, 115],
      [285, 115],
      [285, 285],
      [115, 285],
    ],
    [
      [130, 70],
      [390, 70],
      [390, 330],
      [130, 330],
    ],
    [
      [31, 31],
      [369, 31],
      [369, 369],
      [31, 369],
    ],
  ] as const;
  for (const size of [2, 3, 4] as const) {
    const colors = Array.from({ length: size * size }, (_, i) => FACES[i % 6]);
    for (const corners of wrong) {
      const p = await cameraFixture({ size, colors, corners });
      assert.equal(
        inspectScanFrame(p.data, p.width, p.height, size, 0).aligned,
        false,
        `${size} rejects ${corners}`,
      );
    }
    for (const color of [30, 100, 240])
      assert.equal(
        inspectScanFrame(
          new Uint8Array(400 * 400 * 4).fill(color),
          400,
          400,
          size,
          0,
        ).aligned,
        false,
      );
  }
});

test("the detector rejects a different puzzle grid, including a solid-color 4x4 that has a 2x2 central cross", async () => {
  for (const actual of [2, 3, 4] as const)
    for (const expected of [2, 3, 4] as const) {
      if (actual === expected) continue;
      for (const colors of [
        Array(actual * actual).fill("F"),
        Array.from({ length: actual * actual }, (_, i) => FACES[i % 6]),
      ]) {
        const p = await cameraFixture({ size: actual, colors });
        assert.equal(
          inspectScanFrame(p.data, p.width, p.height, expected, 0).aligned,
          false,
          `${actual} cannot be read as ${expected}`,
        );
      }
    }
});
test("a complete camera-image tour reaches the exact validated cube through stable capture and movement guards", async () => {
  for (const size of [2, 3, 4] as const) {
    const start = applyMoves(solvedCube(size), "R U F2 L D B U2"),
      gate = new AutomaticScanGate(size);
    let held = start,
      time = 0;
    for (let face = 0; face < 6; face++) {
      const p = await cameraFixture({
        size,
        colors: facelets(held).F,
        light: face % 2 ? 0.65 : 1,
        blur: 1,
      });
      for (const delta of [0, 250, 500]) {
        const frame = inspectScanFrame(
          p.data,
          p.width,
          p.height,
          size,
          time + delta,
        );
        assert.equal(frame.aligned, true);
        const next = gate.feed(frame);
        assert.equal(next.phase, delta === 500 ? "turning" : "holding");
      }
      assert.equal(gate.captured.length, face + 1);
      for (const delta of [700, 900])
        gate.feed(
          inspectScanFrame(
            new Uint8Array(400 * 400 * 4).fill(90),
            400,
            400,
            size,
            time + delta,
          ),
        );
      held = applyMoves(held, [...SCAN_TURNS[face]]);
      time += 2200;
    }
    const result = resolveAutomaticScan(size, gate.captured);
    assert.equal(stateKey(result.state), stateKey(start));
  }
});
test("moving fitted geometry cannot complete a hold merely by keeping the same face colors", async () => {
  const p = await cameraFixture({ size: 3, colors: facelets(solvedCube(3)).F });
  const f = inspectScanFrame(p.data, p.width, p.height, 3, 0),
    gate = new AutomaticScanGate(3);
  assert.equal(gate.feed(f).phase, "holding");
  const moved = {
    ...f,
    capturedAt: 500,
    corners: f.corners!.map(([x, y]) => [x + 30, y] as const),
  };
  assert.equal(gate.feed(moved).phase, "holding");
  assert.equal(gate.captured.length, 0);
  assert.ok(gate.feed({ ...moved, capturedAt: 1000 }).captured);
});

test("fixed-seed camera corpus preserves sticker correspondence across 180 independent physical poses/exposures", async () => {
  let seed = 0x28ca6e;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (const size of [2, 3, 4] as const)
    for (let i = 0; i < 60; i++) {
      const rotation = new THREE.Euler(
        (random() - 0.5) * 0.28,
        (random() - 0.5) * 0.28,
        (random() - 0.5) * 0.18,
      );
      const scale = 0.96 + random() * 0.08,
        dx = (random() - 0.5) * 16,
        dy = (random() - 0.5) * 16;
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, y]) => {
        const p = new THREE.Vector3(x, y, 0).applyEuler(rotation);
        return [
          200 + dx + (1040 * scale * p.x) / (8 - p.z),
          200 + dy + (1040 * scale * p.y) / (8 - p.z),
        ] as const;
      }) as unknown as readonly [
        readonly [number, number],
        readonly [number, number],
        readonly [number, number],
        readonly [number, number],
      ];
      const moves = Array.from(
        { length: 8 },
        () => FACES[Math.floor(random() * 6)] + (random() > 0.5 ? "'" : ""),
      );
      const colors = facelets(applyMoves(solvedCube(size), moves)).F;
      const p = await cameraFixture({
        size,
        colors,
        corners,
        light: 0.5 + random() * 0.5,
        gap: 0.01 + random() * 0.035,
        blur: 0.5 + random() * 0.6,
        glare: i % 5 === 0,
      });
      const frame = inspectScanFrame(p.data, p.width, p.height, size, 0);
      assert.equal(frame.aligned, true, `${size} pose ${i}`);
      assert.deepEqual(
        frame.samples.map((s) => s.color),
        colors,
        `${size} pose ${i} colors`,
      );
    }
});
