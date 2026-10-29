import sharp from "sharp";
import type { Face } from "@cubers/core";

export const cameraColors: Record<Face, readonly number[]> = {
  U: [222, 216, 200],
  R: [210, 65, 35],
  F: [38, 154, 75],
  D: [230, 211, 45],
  L: [238, 115, 42],
  B: [34, 79, 173],
};
type Point = readonly [number, number];
export type CameraFixture = {
  size: 2 | 3 | 4;
  colors: readonly Face[];
  corners?: readonly [Point, Point, Point, Point];
  light?: number;
  gap?: number;
  blur?: number;
  glare?: boolean;
};
// Independent square-to-quadrilateral homography. The fixture never calls the
// detector's geometry or color sampler; rasterization is libvips/librsvg.
export async function cameraFixture({
  size,
  colors,
  corners = [
    [70, 70],
    [330, 70],
    [330, 330],
    [70, 330],
  ],
  light = 1,
  gap = 0.03,
  blur = 0.5,
  glare = false,
}: CameraFixture) {
  const [a, b, c, d] = corners;
  const dx1 = b[0] - c[0],
    dx2 = d[0] - c[0],
    dx3 = a[0] - b[0] + c[0] - d[0];
  const dy1 = b[1] - c[1],
    dy2 = d[1] - c[1],
    dy3 = a[1] - b[1] + c[1] - d[1];
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / denominator,
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  const project = (u: number, v: number): Point => [
    ((b[0] - a[0] + g * b[0]) * u + (d[0] - a[0] + h * d[0]) * v + a[0]) /
      (g * u + h * v + 1),
    ((b[1] - a[1] + g * b[1]) * u + (d[1] - a[1] + h * d[1]) * v + a[1]) /
      (g * u + h * v + 1),
  ];
  const polygon = (points: readonly Point[], fill: string) =>
    `<polygon points="${points.map((p) => p.join(",")).join(" ")}" fill="${fill}"/>`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="shade" x1="0" y1="0" x2="1" y2="1"><stop stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".23"/></linearGradient></defs><rect width="400" height="400" fill="#89847c"/>`;
  svg += polygon(corners, "#303332");
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      const color = cameraColors[colors[row * size + col]].map((n) =>
        Math.round(n * light),
      );
      svg += polygon(
        [
          project((col + gap) / size, (row + gap) / size),
          project((col + 1 - gap) / size, (row + gap) / size),
          project((col + 1 - gap) / size, (row + 1 - gap) / size),
          project((col + gap) / size, (row + 1 - gap) / size),
        ],
        `rgb(${color.join(",")})`,
      );
    }
  svg += polygon(corners, "url(#shade)");
  if (glare)
    svg +=
      '<ellipse cx="214" cy="119" rx="27" ry="11" fill="white" opacity=".65"/>';
  svg += "</svg>";
  let image = sharp(Buffer.from(svg));
  if (blur >= 0.3) image = image.blur(blur);
  const jpeg = await image.jpeg({ quality: 82 }).toBuffer();
  const { data, info } = await sharp(jpeg)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, jpeg };
}
