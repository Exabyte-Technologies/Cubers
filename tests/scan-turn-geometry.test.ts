import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { FACES, applyMoves, solvedCube, type Face } from "@cubers/core";
import { SCAN_TURNS } from "../apps/mobile/src/automatic-scan";
import {
  scanTurnPolygons,
  scanTurnProgress,
  scanTurnVertex,
  type ScanVertex,
} from "../apps/mobile/src/scan-turn-geometry";
const normals: Record<Face, ScanVertex> = {
  F: [0, 0, 1],
  R: [1, 0, 0],
  B: [0, 0, -1],
  L: [-1, 0, 0],
  U: [0, 1, 0],
  D: [0, -1, 0],
};
const near = (a: readonly number[], b: readonly number[]) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} != ${b}`));
test("scan cue endpoints match the solver's whole-cube axes and reveal the requested next face", () => {
  SCAN_TURNS.forEach((moves, i) => {
    const before = solvedCube(3),
      after = applyMoves(before, [...moves]);
    FACES.forEach((face) => {
      const expected = after.stickers.find((s) => s.color === face)!.normal;
      near(scanTurnVertex(normals[face], i, 1), expected);
    });
  });
});
test("scan animation is rigid 3D at every intermediate pose, including the sequential yaw/pitch", () => {
  for (let index = 0; index < 6; index++)
    for (let frame = 0; frame <= 60; frame++) {
      const progress = frame / 60,
        poses = SCAN_TURNS[index];
      for (const vertex of [
        [1, 1, 1],
        [-1, 1, 1],
        [1, -1, -1],
      ] as ScanVertex[]) {
        const independent = new THREE.Vector3(...vertex);
        poses.forEach((move, i) => {
          const t = Math.max(0, Math.min(1, progress * poses.length - i));
          const ease = t * t * (3 - 2 * t);
          independent.applyAxisAngle(
            new THREE.Vector3(...(move === "y" ? [0, 1, 0] : [1, 0, 0])),
            (move === "y"
              ? -Math.PI / 2
              : move === "x2"
                ? Math.PI
                : Math.PI / 2) * ease,
          );
        });
        near(scanTurnVertex(vertex, index, progress), independent.toArray());
      }
      const x = scanTurnVertex([1, 0, 0], index, progress),
        y = scanTurnVertex([0, 1, 0], index, progress),
        z = scanTurnVertex([0, 0, 1], index, progress);
      assert.ok(
        Math.abs(new THREE.Vector3(...x).dot(new THREE.Vector3(...y))) < 1e-10,
      );
      near(new THREE.Vector3(...x).cross(new THREE.Vector3(...y)).toArray(), z);
      for (const size of [2, 3, 4] as const) {
        const polygons = scanTurnPolygons(size, index, progress);
        const faces = new Set(polygons.map((p) => p.face));
        assert.ok(faces.size >= 1 && faces.size <= 3);
        assert.equal(polygons.length, faces.size * (size * size + 1));
        for (const p of polygons)
          for (const point of p.points)
            assert.ok(
              point.every((v) => Number.isFinite(v) && v > 0 && v < 220),
            );
      }
    }
  const before = scanTurnPolygons(3, 0, 0),
    after = scanTurnPolygons(3, 0, 1);
  assert.ok(before.some((p) => p.face === "F"));
  assert.ok(!after.some((p) => p.face === "F"));
  assert.ok(
    after.some((p) => p.face === "B"),
    "a previously hidden face emerges",
  );
  near(scanTurnVertex([0, 1, 0], 3, 0.5), [0, 1, 0]);
});

test("the 1.5 second cue leaves readable start and final poses", () => {
  assert.equal(scanTurnProgress(-100), 0);
  assert.equal(scanTurnProgress(0), 0);
  assert.equal(scanTurnProgress(120), 0);
  near([scanTurnProgress(720)], [0.5]);
  assert.equal(scanTurnProgress(1320), 1);
  assert.equal(scanTurnProgress(1500), 1);
  assert.equal(scanTurnProgress(2000), 1);
});
