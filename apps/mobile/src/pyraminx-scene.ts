import { puzzleRenderPalette } from "./design/tokens";
import * as THREE from "three";
import {
  COLORS,
  PYRA_POINTS,
  PYRA_VERTICES,
  pyraminxGeometry,
  pyraminxKey,
  pyraminxTurn,
  type PyraminxState,
} from "@cubers/core";

export function clearPyraminxGroup(group: THREE.Group) {
  for (const object of [...group.children]) {
    group.remove(object);
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (Array.isArray(child.material)
          ? child.material
          : [child.material]
        ).forEach((material) => material.dispose());
      }
    });
  }
}
export function buildPyraminxGroup(
  group: THREE.Group,
  next: PyraminxState,
  unlit = false,
) {
  clearPyraminxGroup(group);
  const body = new THREE.BufferGeometry();
  body.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        [0, 1, 2],
        [0, 2, 3],
        [0, 3, 1],
        [3, 2, 1],
      ].flatMap((face) => face.flatMap((vertex) => PYRA_POINTS[vertex])),
      3,
    ),
  );
  body.computeVertexNormals();
  group.add(
    new THREE.Mesh(
      body,
      unlit
        ? new THREE.MeshBasicMaterial({
            color: puzzleRenderPalette.plastic,
            side: THREE.DoubleSide,
          })
        : new THREE.MeshStandardMaterial({
            color: puzzleRenderPalette.plastic,
            roughness: 0.7,
            side: THREE.DoubleSide,
          }),
    ),
  );
  for (const triangle of pyraminxGeometry(next)) {
    const points = triangle.vertices.map(
        (point) => new THREE.Vector3(...point),
      ),
      center = points
        .reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .divideScalar(3),
      normal = new THREE.Vector3(...PYRA_POINTS[triangle.position.indexOf(0)])
        .normalize()
        .negate();
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((point) =>
        point
          .sub(center)
          .multiplyScalar(0.9)
          .add(center)
          .addScaledVector(normal, 0.012),
      ),
    );
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      unlit
        ? new THREE.MeshBasicMaterial({
            color: COLORS[triangle.color],
            side: THREE.DoubleSide,
          })
        : new THREE.MeshStandardMaterial({
            color: COLORS[triangle.color],
            roughness: 0.65,
            side: THREE.DoubleSide,
          }),
    );
    mesh.userData.position = triangle.position;
    group.add(mesh);
  }
}

/** Centers select a main layer; the three tip stickers select the tip only.
 * Edge stickers have two equally close vertices and deliberately select none.
 * The body participates in picking so rear stickers cannot be hit through gaps.
 */
export function pyraminxTurnAt(
  group: THREE.Group,
  camera: THREE.Camera,
  point: { x: number; y: number },
  viewport: { width: number; height: number },
): string | undefined {
  if (
    ![point.x, point.y, viewport.width, viewport.height].every(
      Number.isFinite,
    ) ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    point.x < 0 ||
    point.y < 0 ||
    point.x >= viewport.width ||
    point.y >= viewport.height
  )
    return;
  camera.updateMatrixWorld();
  group.updateWorldMatrix(true, true);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      (point.x / viewport.width) * 2 - 1,
      1 - (point.y / viewport.height) * 2,
    ),
    camera,
  );
  const hit = ray.intersectObject(group, true)[0];
  const position = hit?.object.userData.position as unknown;
  if (
    !Array.isArray(position) ||
    position.length !== 4 ||
    !position.every(Number.isFinite)
  )
    return;
  const maximum = Math.max(...position);
  if (maximum !== 5 && maximum !== 7) return;
  const vertex = PYRA_VERTICES[position.indexOf(maximum)];
  return maximum === 7 ? vertex.toLowerCase() : vertex;
}

/** Fresh snapshots, undo and multi-move recovery must not invent an animation. */
export function pyraminxAnimatedTurn(
  previous: PyraminxState,
  next: PyraminxState,
  move?: string,
) {
  const match = /^([ULRBulrb])(')?$/.exec(move || "");
  if (!match || previous === next) return;
  try {
    if (pyraminxKey(pyraminxTurn(previous, move!)) !== pyraminxKey(next))
      return;
  } catch {
    return;
  }
  const vertex = PYRA_VERTICES.indexOf(
    match[1].toUpperCase() as (typeof PYRA_VERTICES)[number],
  );
  return {
    vertex,
    threshold: match[1] === match[1].toLowerCase() ? 7 : 4,
    axis: new THREE.Vector3(...PYRA_POINTS[vertex]).normalize(),
    angle: ((match[2] ? 1 : -1) * Math.PI * 2) / 3,
  };
}
