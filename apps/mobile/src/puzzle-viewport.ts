import type * as THREE from "three";

/** Expo surfaces can acquire their final pixel size after onContextCreate. */
export function syncPuzzleViewport(
  previous: { width: number; height: number },
  gl: { drawingBufferWidth: number; drawingBufferHeight: number },
  renderer: Pick<THREE.WebGLRenderer, "setSize">,
  camera: Pick<THREE.PerspectiveCamera, "aspect" | "updateProjectionMatrix">,
) {
  const width = gl.drawingBufferWidth,
    height = gl.drawingBufferHeight;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return false;
  if (width !== previous.width || height !== previous.height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    previous.width = width;
    previous.height = height;
  }
  return true;
}
