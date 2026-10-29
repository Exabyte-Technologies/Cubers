import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  PYRA_POINTS,
  PYRA_VERTICES,
  pyraminxApply,
  pyraminxPoint,
  solvedPyraminx,
  pyraminxTurn,
  pyraminxOrientations,
} from "@cubers/core";
import {
  buildPyraminxGroup,
  clearPyraminxGroup,
  pyraminxTurnAt,
  pyraminxAnimatedTurn,
} from "../apps/mobile/src/pyraminx-scene";
import { PuzzleGesture } from "../apps/mobile/src/puzzle-gesture";
const viewport = { width: 360, height: 290 };
function center(mesh: THREE.Mesh) {
  const a = mesh.geometry.getAttribute("position"),
    point = new THREE.Vector3();
  for (let i = 0; i < a.count; i++)
    point.add(new THREE.Vector3().fromBufferAttribute(a, i));
  return point.divideScalar(a.count);
}
function camera(normal: THREE.Vector3, size = viewport) {
  const c = new THREE.PerspectiveCamera(36, size.width / size.height, 0.1, 100);
  c.position.copy(normal).multiplyScalar(size.width < size.height ? 10 : 6);
  c.up.set(
    ...((Math.abs(normal.y) > 0.9 ? [0, 0, 1] : [0, 1, 0]) as [
      number,
      number,
      number,
    ]),
  );
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}
function project(point: THREE.Vector3, c: THREE.Camera, size = viewport) {
  const p = point.clone().project(c);
  return { x: ((p.x + 1) * size.width) / 2, y: ((1 - p.y) * size.height) / 2 };
}
function stickers(group: THREE.Group) {
  return group.children.filter((m) =>
    Array.isArray(m.userData.position),
  ) as THREE.Mesh[];
}
test("actual Pyraminx triangles pick all tips and main centers after moves and view rotations", () => {
  let checked = 0;
  const scrambled = pyraminxApply(solvedPyraminx(), "R U' l B r' L");
  for (const state of [
    solvedPyraminx(),
    scrambled,
    pyraminxOrientations(scrambled)[5],
  ]) {
    const group = new THREE.Group();
    buildPyraminxGroup(group, state);
    try {
      for (const size of [
        viewport,
        { width: 720, height: 580 },
        { width: 300, height: 500 },
      ])
        for (const angles of [
          [0, 0, 0],
          [0.5, 1.2, 0.2],
          [-0.7, -2.3, 0.3],
        ]) {
          group.rotation.set(...(angles as [number, number, number]));
          group.updateMatrixWorld(true);
          for (const mesh of stickers(group)) {
            const p = mesh.userData.position as number[],
              maximum = Math.max(...p);
            const normal = new THREE.Vector3(...PYRA_POINTS[p.indexOf(0)])
              .normalize()
              .negate()
              .applyQuaternion(group.quaternion);
            const c = camera(normal, size),
              point = project(mesh.localToWorld(center(mesh)), c, size);
            const expected =
              maximum === 7
                ? PYRA_VERTICES[p.indexOf(7)].toLowerCase()
                : maximum === 5
                  ? PYRA_VERTICES[p.indexOf(5)]
                  : undefined;
            assert.equal(
              pyraminxTurnAt(group, c, point, size),
              expected,
              `position ${p}; angles ${angles}`,
            );
            checked++;
          }
        }
    } finally {
      clearPyraminxGroup(group);
    }
  }
  assert.equal(checked, 972);
});
test("background, exposed body, ambiguous edges and invalid coordinates cannot turn a hidden Pyraminx sticker", () => {
  const group = new THREE.Group();
  buildPyraminxGroup(group, solvedPyraminx());
  const normal = new THREE.Vector3(...PYRA_POINTS[3]).normalize().negate(),
    c = camera(normal);
  try {
    const bodyGap = project(
      new THREE.Vector3(...pyraminxPoint([3, 3, 3, 0])),
      c,
    );
    assert.equal(pyraminxTurnAt(group, c, bodyGap, viewport), undefined);
    for (const point of [
      { x: 0, y: 0 },
      { x: 359, y: 0 },
      { x: -1, y: 100 },
      { x: 360, y: 100 },
      { x: 100, y: 290 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
    ])
      assert.equal(pyraminxTurnAt(group, c, point, viewport), undefined);
    assert.equal(
      pyraminxTurnAt(group, c, { x: 10, y: 10 }, { width: 0, height: 290 }),
      undefined,
    );
    assert.equal(
      pyraminxTurnAt(group, c, { x: 10, y: 10 }, { width: 360, height: NaN }),
      undefined,
    );
  } finally {
    clearPyraminxGroup(group);
  }
});
test("every animated tip/main-layer turn ends at the exact independently reconstructed puzzle geometry", () => {
  const before = pyraminxApply(solvedPyraminx(), "U R' b L u R B'");
  for (const face of [
    ...PYRA_VERTICES,
    ...PYRA_VERTICES.map((v) => v.toLowerCase()),
  ])
    for (const suffix of ["", "'"]) {
      const move = face + suffix,
        next = pyraminxTurn(before, move),
        spec = pyraminxAnimatedTurn(before, next, move)!;
      assert.ok(spec);
      const a = new THREE.Group(),
        b = new THREE.Group();
      buildPyraminxGroup(a, before);
      buildPyraminxGroup(b, next);
      try {
        const targets = stickers(b),
          rotation = new THREE.Quaternion().setFromAxisAngle(
            spec.axis,
            spec.angle,
          );
        let affected = 0;
        for (const mesh of stickers(a)) {
          const point = center(mesh),
            turning = mesh.userData.position[spec.vertex] >= spec.threshold;
          if (turning) {
            point.applyQuaternion(rotation);
            affected++;
          }
          const target = targets.find(
            (m) => center(m).distanceTo(point) < 1e-5,
          );
          assert.ok(target, move + ": transformed sticker must exist");
          assert.equal(
            (mesh.material as THREE.MeshStandardMaterial).color.getHex(),
            (target.material as THREE.MeshStandardMaterial).color.getHex(),
            move + ": transformed color must agree",
          );
        }
        assert.equal(affected, face === face.toLowerCase() ? 3 : 12);
      } finally {
        clearPyraminxGroup(a);
        clearPyraminxGroup(b);
      }
    }
});
test("repeated, recovered and mismatched snapshots cannot invent a one-turn animation", () => {
  const before = solvedPyraminx(),
    after = pyraminxTurn(before, "R");
  assert.ok(pyraminxAnimatedTurn(before, after, "R"));
  assert.ok(pyraminxAnimatedTurn(after, before, "R'"));
  assert.equal(pyraminxAnimatedTurn(before, before, "R"), undefined);
  assert.equal(
    pyraminxAnimatedTurn(after, structuredClone(after), "R"),
    undefined,
  );
  assert.equal(
    pyraminxAnimatedTurn(before, pyraminxApply(before, "R L"), "L"),
    undefined,
  );
  assert.equal(pyraminxAnimatedTurn(before, after, "U"), undefined);
  for (const invalid of [undefined, "R2", "x", "<script>", "R U"])
    assert.equal(pyraminxAnimatedTurn(before, after, invalid), undefined);
});
test("Pyraminx selection composes with cancellation, return drags, multiple touches and single release", () => {
  const group = new THREE.Group();
  buildPyraminxGroup(group, solvedPyraminx());
  const c = camera(new THREE.Vector3(...PYRA_POINTS[3]).normalize().negate());
  const mesh = stickers(group).find(
    (m) => m.userData.position.join(",") === "5,2,2,0",
  )!;
  group.updateMatrixWorld(true);
  const point = project(center(mesh), c),
    gesture = new PuzzleGesture();
  const release = () => {
    const tap = gesture.finish(0, 0);
    return tap ? pyraminxTurnAt(group, c, tap, viewport) : undefined;
  };
  try {
    gesture.begin(point.x, point.y);
    assert.equal(release(), "U");
    assert.equal(release(), undefined);
    gesture.begin(point.x, point.y);
    gesture.move(30, 0);
    gesture.move(0, 0);
    assert.equal(release(), undefined);
    gesture.begin(point.x, point.y);
    gesture.observeTouches(2);
    assert.equal(release(), undefined);
    gesture.begin(point.x, point.y);
    gesture.cancel();
    assert.equal(release(), undefined);
  } finally {
    clearPyraminxGroup(group);
  }
});
