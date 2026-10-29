import {
  FACES,
  fromFacelets,
  validateScan,
  type CubeState,
  type Face,
} from "../puzzle";
export const GAN_CORNERS = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];
export const GAN_EDGES = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];
export const GIIKER_CORNERS = [
  [26, 15, 29],
  [20, 8, 9],
  [18, 38, 6],
  [24, 27, 44],
  [51, 35, 17],
  [45, 11, 2],
  [47, 0, 36],
  [53, 42, 33],
];
export const GIIKER_EDGES = [
  [25, 28],
  [23, 12],
  [19, 7],
  [21, 41],
  [32, 16],
  [5, 10],
  [3, 37],
  [30, 43],
  [52, 34],
  [48, 14],
  [46, 1],
  [50, 39],
];
export function smartFacelets(values: string[]): CubeState {
  if (
    values.length !== 54 ||
    values.some((value) => !FACES.includes(value as Face))
  )
    throw new Error("Invalid smart-cube colors");
  const faces = Object.fromEntries(
    FACES.map((face, index) => [face, values.slice(index * 9, index * 9 + 9)]),
  ) as Record<Face, Face[]>;
  if (FACES.some((face) => faces[face][4] !== face))
    throw new Error("Unsupported smart-cube holding frame");
  const state = fromFacelets(3, faces),
    result = validateScan(state);
  if (!result.valid) throw new Error("Unreachable smart-cube state");
  return state;
}
export function smartCubies(
  cp: number[],
  co: number[],
  ep: number[],
  eo: number[],
  corners = GAN_CORNERS,
  edges = GAN_EDGES,
) {
  if (
    cp.length !== 8 ||
    ep.length !== 12 ||
    co.length !== 8 ||
    eo.length !== 12 ||
    new Set(cp).size !== 8 ||
    new Set(ep).size !== 12 ||
    cp.some((v) => !Number.isInteger(v) || v < 0 || v > 7) ||
    ep.some((v) => !Number.isInteger(v) || v < 0 || v > 11) ||
    co.some((v) => !Number.isInteger(v) || v < 0 || v > 2) ||
    eo.some((v) => v !== 0 && v !== 1)
  )
    throw new Error("Invalid smart-cube piece coordinates");
  const values: string[] = Array.from(
    { length: 54 },
    (_, index) => FACES[Math.floor(index / 9)],
  );
  for (let slot = 0; slot < 8; slot++)
    for (let side = 0; side < 3; side++)
      values[corners[slot][(side + co[slot]) % 3]] =
        FACES[Math.floor(corners[cp[slot]][side] / 9)];
  for (let slot = 0; slot < 12; slot++)
    for (let side = 0; side < 2; side++)
      values[edges[slot][(side + eo[slot]) % 2]] =
        FACES[Math.floor(edges[ep[slot]][side] / 9)];
  return smartFacelets(values);
}
export function readBits(bytes: Uint8Array, offset: number, length: number) {
  if (
    !Number.isInteger(offset) ||
    !Number.isInteger(length) ||
    length < 1 ||
    length > 24 ||
    offset < 0 ||
    offset + length > bytes.length * 8
  )
    throw new Error("Truncated smart-cube bit field");
  let value = 0;
  for (let bit = offset; bit < offset + length; bit++)
    value = value * 2 + ((bytes[Math.floor(bit / 8)] >> (7 - (bit % 8))) & 1);
  return value;
}
