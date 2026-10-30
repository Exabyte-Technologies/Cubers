import { puzzleRenderPalette } from "./design/tokens";
import * as THREE from "three";
import { COLORS, type CubeState, type Face } from "@cubers/core";

export function clearCubeGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
  }
}
export function buildCubeGroup(
  group: THREE.Group,
  s: CubeState,
  unlit = false,
) {
  clearCubeGroup(group);
  group.userData.size = s.size;
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
          unlit
            ? new THREE.MeshBasicMaterial({
                color: puzzleRenderPalette.plastic,
              })
            : new THREE.MeshStandardMaterial({
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
        body.userData.basePosition = body.position.clone();
        body.userData.baseQuaternion = body.quaternion.clone();
        group.add(body);
      }
  for (const sticker of s.stickers) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(step * 0.83, step * 0.83),
      unlit
        ? new THREE.MeshBasicMaterial({
            color: COLORS[sticker.color],
            side: THREE.DoubleSide,
          })
        : new THREE.MeshStandardMaterial({
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
    mesh.userData.basePosition = mesh.position.clone();
    mesh.userData.baseQuaternion = mesh.quaternion.clone();
    group.add(mesh);
  }
}

export const faceNormal = (face: Face) =>
  new THREE.Vector3(
    ...({
      U: [0, 1, 0],
      D: [0, -1, 0],
      R: [1, 0, 0],
      L: [-1, 0, 0],
      F: [0, 0, 1],
      B: [0, 0, -1],
    }[face] as [number, number, number]),
  );
export function cubeDragAngle(
  group: THREE.Group,
  camera: THREE.Camera,
  start: { x: number; y: number },
  delta: { x: number; y: number },
  viewport: { width: number; height: number },
  face: Face,
) {
  if (
    Math.hypot(delta.x, delta.y) < 12 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return 0;
  camera.updateMatrixWorld();
  group.updateWorldMatrix(true, true);
  const normal = faceNormal(face),
    plane = new THREE.Plane(normal, -1.2),
    inverse = group.matrixWorld.clone().invert();
  const at = (x: number, y: number) => {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        (x / viewport.width) * 2 - 1,
        1 - (y / viewport.height) * 2,
      ),
      camera,
    );
    const local = ray.ray.clone().applyMatrix4(inverse),
      hit = new THREE.Vector3();
    return local.intersectPlane(plane, hit)
      ? hit.addScaledVector(normal, -1.2)
      : null;
  };
  const a = at(start.x, start.y),
    b = at(start.x + delta.x, start.y + delta.y);
  if (!a || !b || a.length() < 0.15 || b.length() < 0.15) return 0;
  return THREE.MathUtils.clamp(
    Math.atan2(a.clone().cross(b).dot(normal), a.dot(b)),
    -Math.PI / 2,
    Math.PI / 2,
  );
}
export function previewCubeFace(
  group: THREE.Group,
  face: Face | null,
  angle: number,
  lift: number,
) {
  const normal = face ? faceNormal(face) : new THREE.Vector3();
  const axis =
    face && "RL".includes(face) ? 0 : face && "UD".includes(face) ? 1 : 2;
  const rotation = new THREE.Quaternion().setFromAxisAngle(normal, angle);
  for (const mesh of group.children) {
    const base = mesh.userData.basePosition as THREE.Vector3 | undefined;
    const quaternion = mesh.userData.baseQuaternion as
      THREE.Quaternion | undefined;
    if (!base || !quaternion) continue;
    mesh.position.copy(base);
    mesh.quaternion.copy(quaternion);
    const p = mesh.userData.position as number[] | undefined;
    const extent = group.userData.size - 1;
    if (face && p?.[axis] === ("RUF".includes(face) ? extent : 0)) {
      mesh.position.applyQuaternion(rotation);
      mesh.quaternion.premultiply(rotation);
      if (mesh.userData.normal?.join(",") === normal.toArray().join(","))
        mesh.position.addScaledVector(normal, lift);
    }
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
    if (!(object instanceof THREE.Mesh) || object.userData.tutorialOverlay)
      return;
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
