import * as THREE from "three";
import type { TutorialSticker } from "@cubers/core";

export const tutorialPulseOn = (time: number, reduced = false) =>
  reduced || time % 2000 < 1000;
export function highlightTutorialStickers(
  group: THREE.Group,
  targets: TutorialSticker[],
  time: number,
  reduced: boolean,
) {
  let active = false;
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.tutorialOverlay)
      return;
    const p = object.userData.position as number[] | undefined;
    if (!p) return;
    const selected = targets.some(
      (t) =>
        t.position.join(",") === p.join(",") &&
        (!t.normal || t.normal.join(",") === object.userData.normal?.join(",")),
    );
    let overlay = object.children.find((c) => c.userData.tutorialOverlay) as
      THREE.Mesh | undefined;
    if (selected && !overlay) {
      overlay = new THREE.Mesh(
        object.geometry.clone(),
        new THREE.MeshBasicMaterial({
          color: "#ffe135",
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        }),
      );
      overlay.userData.tutorialOverlay = true;
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(object.geometry),
        new THREE.LineBasicMaterial({ color: "#ffe135", depthTest: false }),
      );
      outline.userData.tutorialOverlay = true;
      overlay.add(outline);
      object.add(overlay);
    }
    if (overlay) {
      overlay.visible = selected && tutorialPulseOn(time, reduced);
      (overlay.material as THREE.MeshBasicMaterial).opacity = reduced
        ? 0
        : 0.45;
    }
    active ||= selected;
  });
  return active;
}
