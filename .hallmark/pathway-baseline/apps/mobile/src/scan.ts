import { FACES, type Face, type PyraColor } from "@cubers/core";
export type Sample = {
  color: Face;
  confidence: number;
  rgb: [number, number, number];
};
function hsv([r, g, b]: number[]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d) {
    h =
      max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}
export function recognize(rgb: [number, number, number]): Sample {
  const [h, s, v] = hsv(rgb);
  if (s < 0.23 && v > 0.35)
    return {
      color: "U",
      confidence: Math.max(0, Math.min(1, (0.3 - s) * 3 + (v - 0.35))),
      rgb,
    };
  const prototypes: [Face, number][] = [
    ["R", 2],
    ["L", 28],
    ["D", 57],
    ["F", 135],
    ["B", 220],
  ];
  const distances = prototypes
    .map(([color, hue]) => ({
      color,
      d: Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue)) / 180,
    }))
    .sort((a, b) => a.d - b.d);
  return {
    color: distances[0].color,
    confidence: Math.max(
      0,
      Math.min(
        1,
        (distances[1].d - distances[0].d) * 4 * s * (v > 0.2 ? 1 : v / 0.2),
      ),
    ),
    rgb,
  };
}
export function sampleGrid(
  data: Uint8Array,
  width: number,
  height: number,
  size: number,
): Sample[] {
  const side = Math.min(width, height) * 0.65,
    left = (width - side) / 2,
    top = (height - side) / 2;
  return Array.from({ length: size * size }, (_, i) => {
    const x = Math.round(left + (((i % size) + 0.5) * side) / size),
      y = Math.round(top + ((Math.floor(i / size) + 0.5) * side) / size);
    let r = 0,
      g = 0,
      b = 0,
      count = 0;
    const radius = Math.max(2, Math.round((side / size) * 0.1));
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const index = ((y + dy) * width + x + dx) * 4;
        r += data[index];
        g += data[index + 1];
        b += data[index + 2];
        count++;
      }
    return recognize([r / count, g / count, b / count]);
  });
}
export type TriangularSample = {
  color: PyraColor;
  confidence: number;
  rgb: [number, number, number];
};
export function recognizeTriangular(
  rgb: [number, number, number],
): TriangularSample {
  const [h, saturation, value] = hsv(rgb);
  const prototypes: [PyraColor, number][] = [
    ["R", 2],
    ["D", 57],
    ["F", 135],
    ["B", 220],
  ];
  const distances = prototypes
    .map(([color, hue]) => ({
      color,
      distance: Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue)) / 180,
    }))
    .sort((a, b) => a.distance - b.distance);
  return {
    color: distances[0].color,
    confidence: Math.max(
      0,
      Math.min(
        1,
        (distances[1].distance - distances[0].distance) *
          4 *
          saturation *
          value,
      ),
    ),
    rgb,
  };
}
// Triangle centroids in the same 1/3/5 row order as the core facelet model.
export function sampleTriangular(
  data: Uint8Array,
  width: number,
  height: number,
): TriangularSample[] {
  if (width < 16 || height < 16 || data.length !== width * height * 4)
    throw new Error("Invalid image size");
  const side = Math.min(width, height) * 0.65,
    triangleHeight = (side * Math.sqrt(3)) / 2,
    unit = side / 3,
    rowHeight = triangleHeight / 3;
  const left = (width - side) / 2,
    top = (height - triangleHeight) / 2;
  return Array.from({ length: 9 }, (_, index) => {
    const row = Math.floor(Math.sqrt(index)),
      column = index - row * row,
      down = column % 2 === 1;
    const x = Math.round(
        left + ((2 - row) * unit) / 2 + ((column + 1) * unit) / 2,
      ),
      y = Math.round(top + (row + (down ? 1 / 3 : 2 / 3)) * rowHeight);
    const rgb: [number, number, number] = [0, 0, 0],
      radius = Math.max(1, Math.floor(unit * 0.08));
    let count = 0;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const offset = ((y + dy) * width + x + dx) * 4;
        rgb[0] += data[offset];
        rgb[1] += data[offset + 1];
        rgb[2] += data[offset + 2];
        count++;
      }
    return recognizeTriangular(
      rgb.map((value) => value / count) as [number, number, number],
    );
  });
}
export const faceInstructions: Record<Face, { en: string; zh: string }> = {
  U: {
    en: "White face up; keep the green side toward you. Photograph the white face with green along its lower edge.",
    zh: "白面朝上，绿面朝向你。拍白面时，让绿面位于画面下边缘。",
  },
  R: {
    en: "Turn the entire cube to see red on the right. Keep white along the top edge.",
    zh: "转动整个魔方，拍右侧红面，白面保持在画面上边缘。",
  },
  F: {
    en: "Photograph the green front face, with white at the top.",
    zh: "拍正面绿面，白面保持在上边缘。",
  },
  D: {
    en: "Photograph yellow on the bottom, with green along the upper edge.",
    zh: "拍底部黄面，让绿面位于画面上边缘。",
  },
  L: {
    en: "Photograph orange on the left, keeping white at the top.",
    zh: "拍左侧橙面，白面保持在上边缘。",
  },
  B: {
    en: "Photograph the blue back face, keeping white at the top.",
    zh: "拍背面蓝面，白面保持在上边缘。",
  },
};
export function scanInstructions(size: 2 | 3 | 4, face: Face) {
  if (size === 3) return faceInstructions[face];
  const directions: Record<Face, { en: string; zh: string }> = {
    U: {
      en: "Photograph the upper face U, with the chosen front along the lower edge.",
      zh: "拍摄上面 U，让选定的正面位于画面下边缘。",
    },
    R: {
      en: "Photograph the right face R, keeping the original upper edge at the top.",
      zh: "拍摄右面 R，让原来的上边缘保持在画面顶部。",
    },
    F: {
      en: "Photograph the chosen front F, with the original upper edge at the top.",
      zh: "拍摄选定的正面 F，让原来的上边缘保持在画面顶部。",
    },
    D: {
      en: "Photograph the underside D, with the chosen front along the upper edge.",
      zh: "拍摄底面 D，让选定的正面位于画面上边缘。",
    },
    L: {
      en: "Photograph the left face L, keeping the original upper edge at the top.",
      zh: "拍摄左面 L，让原来的上边缘保持在画面顶部。",
    },
    B: {
      en: "Photograph the back B, keeping the original upper edge at the top.",
      zh: "拍摄背面 B，让原来的上边缘保持在画面顶部。",
    },
  };
  return {
    en: `There is no fixed center on a ${size}×${size}. Face letters describe positions, not the dominant sticker color. Keep one reference frame for all six scans; for a checkpoint, match the displayed model. ${directions[face].en}`,
    zh: `${size}×${size} 没有固定中心，面记号表示位置，并非该面最多的贴片颜色。六面扫描请保持同一参照方向；验证检查点时，请与展示的模型一致。${directions[face].zh}`,
  };
}
