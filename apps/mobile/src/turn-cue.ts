import * as THREE from "three";
import { PYRA_POINTS, PYRA_VERTICES } from "@cubers/core";

export function turnCueSpec(move?: string) {
  const m = /^([URFDLBMESxyz])(w)?(2|')?$/.exec(move || "");
  if (!m) return null;
  const face = m[1],
    axis = "RLMx".includes(face) ? 0 : "UDEy".includes(face) ? 1 : 2;
  const negative = "LDBME".includes(face);
  const normal = [0, 0, 0] as [number, number, number];
  normal[axis] = negative ? -1 : 1;
  return {
    normal,
    axis,
    direction: m[3] === "'" ? 1 : -1,
    whole: "xyz".includes(face),
    slice: "MES".includes(face),
    double: m[3] === "2",
    wide: !!m[2],
  };
}

/** Continuous perimeter with counterclockwise tangent, viewed from outside. */
export function squareCuePoint(progress: number, radius = 1.38) {
  const p = (((progress % 1) + 1) % 1) * 4,
    side = Math.floor(p),
    a = (p - side) * 2 * radius;
  return [
    { x: radius, y: -radius + a, angle: Math.PI / 2 },
    { x: radius - a, y: radius, angle: Math.PI },
    { x: -radius, y: radius - a, angle: -Math.PI / 2 },
    { x: -radius + a, y: -radius, angle: 0 },
  ][side];
}

export function buildTurnCue(
  group: THREE.Group,
  move?: string,
  color = "#70b3f7",
  size: 2 | 3 | 4 = 3,
) {
  const spec = turnCueSpec(move);
  if (!spec) return;
  const plane = new THREE.Group(),
    // Float just above the sticker surfaces, across the SIDE of the turning
    // layer. This is a belt around the cubies, not a ring in the face plane.
    radius = 1.225,
    step = 2.4 / size,
    width = spec.whole ? 2.2 : step * (spec.wide ? 1.65 : 0.68),
    depth = spec.whole || spec.slice ? 0 : 1.2 - step * (spec.wide ? 1 : 0.5);
  plane.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(...spec.normal),
  );
  plane.position.copy(new THREE.Vector3(...spec.normal).multiplyScalar(depth));
  const material = (opacity: number) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  for (let side = 0; side < 4; side++) {
    const point = squareCuePoint(side / 4 + 0.125, radius);
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, width),
      material(0.26),
    );
    bar.position.set(point.x, point.y, 0);
    ribbonOrientation(bar, point.angle);
    bar.userData.cueRibbon = true;
    plane.add(bar);
    for (const edge of [-1, 1]) {
      const seam = new THREE.Mesh(
        new THREE.PlaneGeometry(radius * 2, 0.012),
        material(0.6),
      );
      seam.position.set(point.x * 1.001, point.y * 1.001, (edge * width) / 2);
      ribbonOrientation(seam, point.angle);
      plane.add(seam);
    }
    const shape = new THREE.Shape();
    shape.moveTo(0.17, 0);
    shape.lineTo(-0.08, 0.13);
    shape.lineTo(-0.02, 0);
    shape.lineTo(-0.08, -0.13);
    shape.closePath();
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(0.9));
    arrow.userData.cueArrow = side;
    plane.add(arrow);
  }
  plane.userData.cueSpec = { ...spec, radius, width, depth, ribbon: true };
  group.add(plane);
  animateTurnCue(group, 0, true);
}

function ribbonOrientation(mesh: THREE.Object3D, angle: number, direction = 1) {
  const tangent = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0),
    across = new THREE.Vector3(0, 0, 1),
    outward = new THREE.Vector3().crossVectors(tangent, across);
  mesh.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(tangent, across, outward),
  );
  if (direction < 0) mesh.rotateZ(Math.PI);
}

export function animateTurnCue(
  group: THREE.Group,
  time: number,
  reduced: boolean,
) {
  for (const plane of group.children) {
    const spec = plane.userData.cueSpec;
    if (!spec) continue;
    for (const arrow of plane.children) {
      const index = arrow.userData.cueArrow;
      if (index === undefined) continue;
      const point = squareCuePoint(
        index / 4 + 0.125 + (reduced ? 0 : (time / 2400) * spec.direction),
        spec.radius,
      );
      if (spec.ribbon) {
        arrow.position.set(point.x * 1.006, point.y * 1.006, 0);
        ribbonOrientation(arrow, point.angle, spec.direction);
      } else {
        arrow.position.set(point.x, point.y, 0.015);
        arrow.rotation.z = point.angle + (spec.direction < 0 ? Math.PI : 0);
      }
    }
  }
}

export function buildPyraminxTurnCue(
  group: THREE.Group,
  move?: string,
  color?: string,
) {
  const match = /^([ULRBulrb])(')?$/.exec(move || "");
  if (!match) return;
  // Vertex cues remain in the vertex plane; cubes use the side-sticker belt.
  const plane = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const shape = new THREE.Shape();
    shape.moveTo(0.17, 0);
    shape.lineTo(-0.08, 0.13);
    shape.lineTo(-0.02, 0);
    shape.lineTo(-0.08, -0.13);
    shape.closePath();
    const arrow = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color: color || "#70b3f7",
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    arrow.userData.cueArrow = i;
    plane.add(arrow);
  }
  plane.userData.cueSpec = { direction: match[2] ? 1 : -1, radius: 1.38 };
  group.add(plane);
  const axis = new THREE.Vector3(
    ...PYRA_POINTS[
      PYRA_VERTICES.indexOf(
        match[1].toUpperCase() as (typeof PYRA_VERTICES)[number],
      )
    ],
  ).normalize();
  plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  plane.position.copy(
    axis.multiplyScalar(match[1] === match[1].toLowerCase() ? 1.5 : 0.85),
  );
  plane.scale.setScalar(match[1] === match[1].toLowerCase() ? 0.3 : 0.72);
  animateTurnCue(group, 0, true);
}
