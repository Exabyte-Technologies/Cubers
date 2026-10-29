import { puzzleRenderPalette } from "./design/tokens";
import * as THREE from "three";
import { COLORS, type CubeState, type Face } from "@cubers/core";

export function clearCubeGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
  }
}
export function buildCubeGroup(group: THREE.Group, s: CubeState) {
  clearCubeGroup(group);
  const center = (s.size - 1) / 2,
    step = 2.4 / s.size;
  for (let x = 0; x < s.size; x++)
    for (let y = 0; y < s.size; y++)
      for (let z = 0; z < s.size; z++) {
        if (
          x > 0 &&
          x < s.size - 1 &&
          y > 0 &&
          y < s.size - 1 &&
          z > 0 &&
          z < s.size - 1
        )
          continue;
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(step * 0.96, step * 0.96, step * 0.96),
          new THREE.MeshStandardMaterial({
            color: puzzleRenderPalette.plastic,
            roughness: 0.65,
          }),
        );
        body.position.set(
          (x - center) * step,
          (y - center) * step,
          (z - center) * step,
        );
        body.userData.position = [x, y, z];
        group.add(body);
      }
  for (const sticker of s.stickers) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(step * 0.83, step * 0.83),
      new THREE.MeshStandardMaterial({
        color: COLORS[sticker.color],
        roughness: 0.6,
        side: THREE.DoubleSide,
      }),
    );
    const normal = new THREE.Vector3(...sticker.normal);
    mesh.position.set(
      ...(sticker.p.map(
        (v, i) => (v - center) * step + sticker.normal[i] * step * 0.49,
      ) as [number, number, number]),
    );
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    mesh.userData.position = sticker.p;
    mesh.userData.normal = sticker.normal;
    group.add(mesh);
  }
}

const normalFaces = new Map<string, Face>([
  ["0,1,0", "U"],
  ["1,0,0", "R"],
  ["0,0,1", "F"],
  ["0,-1,0", "D"],
  ["-1,0,0", "L"],
  ["0,0,-1", "B"],
]);
/** Pointer coordinates and viewport dimensions use layout units, not GL pixels. */
export function cubeFaceAt(
  group: THREE.Group,
  camera: THREE.Camera,
  point: { x: number; y: number },
  viewport: { width: number; height: number },
): Face | undefined {
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
  // Every generated mesh is an exact box or rectangle. Intersect its local
  // box directly so a tap on a sticker's triangle seam is still selectable.
  // Bodies take part in depth ordering and occlude rear stickers through gaps.
  const localRay = new THREE.Ray(),
    inverse = new THREE.Matrix4();
  const hit = new THREE.Vector3();
  let nearest: THREE.Object3D | undefined,
    distance = Infinity;
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    inverse.copy(object.matrixWorld).invert();
    localRay.copy(ray.ray).applyMatrix4(inverse);
    if (!localRay.intersectBox(geometry.boundingBox, hit)) return;
    hit.applyMatrix4(object.matrixWorld);
    const candidate = ray.ray.origin.distanceToSquared(hit);
    if (Number.isFinite(candidate) && candidate < distance) {
      nearest = object;
      distance = candidate;
    }
  });
  const normal = nearest?.userData.normal;
  if (!Array.isArray(normal) || normal.length !== 3) return;
  return normalFaces.get(normal.join(","));
}
