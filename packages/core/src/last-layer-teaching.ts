import { applyMoves, facelets, type CubeState, type Face } from "./puzzle";
import { preservesFirstLayers, type AlgorithmFamily } from "./algorithm-shapes";
import { stateKey } from "./puzzle";

export type LastLayerPiece = {
  slot: string;
  destination: string;
  oriented: boolean;
};
export type LastLayerObservation = {
  family: AlgorithmFamily;
  size: 2 | 3;
  top: Face[];
  orientedCorners: number;
  orientedEdges: number | null;
  sides: {
    face: "F" | "R" | "B" | "L";
    stickers: Face[];
    matchingCorners: boolean;
    solidBar: boolean;
    aligned: boolean;
  }[];
  corners: LastLayerPiece[];
  edges: LastLayerPiece[];
};

// Input must already be a legal engine state or a validated scan in the fixed
// white-up/green-front frame. This observes stickers; it never invents moves.
export function observeLastLayer(
  state: CubeState,
  family: AlgorithmFamily,
): LastLayerObservation | null {
  const size = family === "CLL" ? 2 : 3;
  if (state.size !== size || !preservesFirstLayers(stateKey(state), family))
    return null;
  const faces = facelets(state);
  if (family === "PLL" && faces.U.some((color) => color !== "U")) return null;
  const high = size - 1;
  const corners: LastLayerPiece[] = [],
    edges: LastLayerPiece[] = [];
  for (const slot of [
    "UFR",
    "UFL",
    "UBL",
    "UBR",
    ...(size === 3 ? ["UF", "UL", "UB", "UR"] : []),
  ]) {
    const x = slot.includes("R") ? high : slot.includes("L") ? 0 : 1;
    const z = slot.includes("F") ? high : slot.includes("B") ? 0 : 1;
    const stickers = state.stickers.filter(
      (sticker) =>
        sticker.p[0] === x && sticker.p[1] === high && sticker.p[2] === z,
    );
    const colors = stickers.map((sticker) => sticker.color);
    const targets =
      slot.length === 3
        ? ["UFR", "UFL", "UBL", "UBR"]
        : ["UF", "UL", "UB", "UR"];
    const destination = targets.find(
      (target) =>
        colors.length === target.length &&
        new Set(colors).size === colors.length &&
        colors.every((color) => target.includes(color)),
    );
    if (!destination) return null;
    const piece = {
      slot,
      destination,
      oriented: stickers.some(
        (sticker) => sticker.normal[1] === 1 && sticker.color === "U",
      ),
    };
    (slot.length === 3 ? corners : edges).push(piece);
  }
  return {
    family,
    size,
    top: faces.U.slice(),
    orientedCorners: corners.filter((piece) => piece.oriented).length,
    orientedEdges:
      size === 3 ? edges.filter((piece) => piece.oriented).length : null,
    sides: (["F", "R", "B", "L"] as const).map((face) => {
      const stickers = faces[face].slice(0, size);
      return {
        face,
        stickers,
        // A pair of white stickers describes orientation, not a side-color pair.
        matchingCorners:
          stickers[0] !== "U" && stickers[0] === stickers[size - 1],
        solidBar:
          stickers[0] !== "U" &&
          stickers.every((color) => color === stickers[0]),
        aligned: stickers.every((color) => color === face),
      };
    }),
    corners,
    edges,
  };
}

export function lastLayerObservations(
  state: CubeState,
  family: AlgorithmFamily,
  before: string[],
) {
  const current = observeLastLayer(state, family);
  const prepared = observeLastLayer(applyMoves(state, before), family);
  if (!current || !prepared)
    throw new Error("Last-layer teaching prerequisites are missing");
  return { current, prepared };
}

export type LastLayerGuidance =
  | {
      kind: "case";
      lessonId: string;
      family: AlgorithmFamily;
      before: string[];
      algorithm: string[];
      after: string[];
      target: "oriented" | "solved";
      source: "validated";
      observations: ReturnType<typeof lastLayerObservations>;
    }
  | { kind: "alignment"; moves: string[] }
  | { kind: "stage-complete"; next: "PLL" }
  | {
      kind: "not-ready";
      reason: "FIRST_LAYERS_REQUIRED" | "ORIENTATION_REQUIRED";
    };
