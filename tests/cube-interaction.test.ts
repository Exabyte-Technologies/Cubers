import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { applyMoves, solvedCube, type Face } from "@cubers/core";
import {
  buildCubeGroup,
  clearCubeGroup,
  cubeFaceAt,
} from "../apps/mobile/src/cube-scene";
import { PuzzleGesture } from "../apps/mobile/src/puzzle-gesture";
const normals: Record<Face, [number, number, number]> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};
function camera(width = 360, height = 290) {
  const c = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
  c.position.set(4, 3.4, 5.8);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}
function project(
  p: THREE.Vector3,
  c: THREE.Camera,
  viewport = { width: 360, height: 290 },
) {
  const screen = p.clone().project(c);
  return {
    x: ((screen.x + 1) / 2) * viewport.width,
    y: ((1 - screen.y) / 2) * viewport.height,
  };
}
function sticker(group: THREE.Group, face: Face) {
  return group.children.find(
    (m) => m.userData.normal?.join(",") === normals[face].join(","),
  )!;
}
test("actual cube geometry selects every face on 2×2, 3×3 and 4×4 after logical turns", () => {
  for (const size of [2, 3, 4] as const) {
    const group = new THREE.Group();
    buildCubeGroup(group, applyMoves(solvedCube(size), "R U F2 x"));
    try {
      for (const [face, normal] of Object.entries(normals)) {
        const c = camera();
        c.position.set(
          ...(normal.map((v) => v * 6) as [number, number, number]),
        );
        c.up.set(
          ...((face === "U" || face === "D" ? [0, 0, 1] : [0, 1, 0]) as [
            number,
            number,
            number,
          ]),
        );
        c.lookAt(0, 0, 0);
        c.updateMatrixWorld();
        group.updateMatrixWorld(true);
        const point = project(
          sticker(group, face as Face).getWorldPosition(new THREE.Vector3()),
          c,
        );
        assert.equal(
          cubeFaceAt(group, c, point, { width: 360, height: 290 }),
          face,
        );
      }
    } finally {
      clearCubeGroup(group);
    }
  }
});
test("face picking follows rotated views and layout coordinates at different display sizes", () => {
  const group = new THREE.Group();
  buildCubeGroup(group, solvedCube(3));
  let checked = 0;
  try {
    for (const viewport of [
      { width: 360, height: 290 },
      { width: 720, height: 580 },
      { width: 300, height: 500 },
    ])
      for (const angle of [
        [0, 0, 0],
        [0.5, 1.2, 0.2],
        [-0.7, -2.3, 0.3],
      ]) {
        const c = camera(viewport.width, viewport.height);
        group.rotation.set(...(angle as [number, number, number]));
        group.updateMatrixWorld(true);
        for (const [face, normal] of Object.entries(normals)) {
          const worldNormal = new THREE.Vector3(...normal).transformDirection(
            group.matrixWorld,
          );
          const center = worldNormal.clone().multiplyScalar(1.2);
          if (worldNormal.dot(c.position.clone().sub(center)) <= 0.2) continue;
          const point = project(
            sticker(group, face as Face).getWorldPosition(new THREE.Vector3()),
            c,
            viewport,
          );
          if (
            point.x < 0 ||
            point.y < 0 ||
            point.x >= viewport.width ||
            point.y >= viewport.height
          ) {
            assert.equal(cubeFaceAt(group, c, point, viewport), undefined);
            continue;
          }
          assert.equal(cubeFaceAt(group, c, point, viewport), face);
          checked++;
        }
      }
    assert.ok(checked >= 20);
  } finally {
    clearCubeGroup(group);
  }
});
test("background, invalid viewports and black body gaps never select hidden stickers", () => {
  const group = new THREE.Group();
  buildCubeGroup(group, solvedCube(2));
  const c = camera();
  c.position.set(0, 0, 6);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  try {
    const viewport = { width: 360, height: 290 };
    assert.equal(cubeFaceAt(group, c, { x: 0, y: 0 }, viewport), undefined);
    const bodyGap = project(new THREE.Vector3(-0.06, -0.6, 1.176), c);
    assert.equal(cubeFaceAt(group, c, bodyGap, viewport), undefined);
    for (const point of [
      { x: -1, y: 10 },
      { x: 360, y: 10 },
      { x: 10, y: 290 },
      { x: NaN, y: 10 },
      { x: Infinity, y: 10 },
    ])
      assert.equal(cubeFaceAt(group, c, point, viewport), undefined);
    assert.equal(
      cubeFaceAt(group, c, { x: 10, y: 10 }, { width: 0, height: 290 }),
      undefined,
    );
  } finally {
    clearCubeGroup(group);
  }
});
test("drag rotation depends on total travel rather than event sampling", () => {
  function travel(samples: number) {
    const gesture = new PuzzleGesture();
    gesture.begin(40, 50);
    let x = 0,
      y = 0;
    for (let i = 1; i <= samples; i++) {
      const d = gesture.move((100 * i) / samples, (-60 * i) / samples)!;
      x += d.x;
      y += d.y;
    }
    assert.equal(gesture.finish(100, -60), undefined);
    return { x, y };
  }
  assert.deepEqual(travel(1), travel(100));
  assert.deepEqual(travel(10), { x: 100, y: -60 });
});
test("one small tap is emitted once; returning drags, multiple pointers and cancellation never turn", () => {
  const g = new PuzzleGesture();
  g.begin(20, 30);
  g.move(2, 1);
  assert.deepEqual(g.finish(2, 1), { x: 20, y: 30 });
  assert.equal(g.finish(0, 0), undefined);
  g.begin(20, 30);
  g.move(30, 0);
  g.move(0, 0);
  assert.equal(g.finish(0, 0), undefined);
  g.begin(20, 30);
  g.observeTouches(2);
  assert.equal(g.move(20, 0, 1), undefined);
  assert.equal(g.finish(0, 0), undefined);
  g.begin(20, 30, 2);
  assert.equal(g.finish(0, 0), undefined);
  g.begin(20, 30);
  g.cancel();
  assert.equal(g.finish(0, 0), undefined);
  g.begin(20, 30);
  g.move(NaN, 0);
  assert.equal(g.finish(0, 0), undefined);
  g.begin(20, 30);
  assert.equal(g.finish(8, 0), undefined);
});
