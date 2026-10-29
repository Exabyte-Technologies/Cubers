import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  applyMoves,
  solvedCube,
  pyraminxApply,
  solvedPyraminx,
} from "@cubers/core";
import { buildCubeGroup, clearCubeGroup } from "../apps/mobile/src/cube-scene";
import {
  buildPyraminxGroup,
  clearPyraminxGroup,
} from "../apps/mobile/src/pyraminx-scene";

test("native unlit puzzles preserve every colored sticker, mesh transform and picking marker from the shaded scene", () => {
  const examples = [
    ...([2, 3, 4] as const).map((size) => ({
      build: (group: THREE.Group, unlit: boolean) =>
        buildCubeGroup(group, applyMoves(solvedCube(size), "R U F2 x"), unlit),
      clear: clearCubeGroup,
    })),
    {
      build: (group: THREE.Group, unlit: boolean) =>
        buildPyraminxGroup(
          group,
          pyraminxApply(solvedPyraminx(), "R U' l B r' L"),
          unlit,
        ),
      clear: clearPyraminxGroup,
    },
  ];
  for (const example of examples) {
    const shaded = new THREE.Group(),
      native = new THREE.Group();
    try {
      example.build(shaded, false);
      example.build(native, true);
      assert.equal(native.children.length, shaded.children.length);
      native.children.forEach((object, index) => {
        const actual = object as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.MeshBasicMaterial
        >;
        const expected = shaded.children[index] as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.MeshStandardMaterial
        >;
        assert.ok(actual.material.isMeshBasicMaterial);
        assert.ok(expected.material.isMeshStandardMaterial);
        assert.equal(
          actual.material.color.getHex(),
          expected.material.color.getHex(),
        );
        assert.equal(actual.material.side, expected.material.side);
        assert.deepEqual(
          actual.geometry.getAttribute("position").array,
          expected.geometry.getAttribute("position").array,
        );
        assert.deepEqual(
          actual.geometry.index?.array,
          expected.geometry.index?.array,
        );
        assert.deepEqual(
          actual.position.toArray(),
          expected.position.toArray(),
        );
        assert.deepEqual(
          actual.quaternion.toArray(),
          expected.quaternion.toArray(),
        );
        assert.deepEqual(actual.userData, expected.userData);
      });
    } finally {
      example.clear(shaded);
      example.clear(native);
    }
  }
});
