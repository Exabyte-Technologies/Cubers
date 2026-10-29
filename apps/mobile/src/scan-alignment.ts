import { recognize, type Sample } from "./scan";

export type ScanPoint = readonly [number, number];
export type ScanFrame = {
  samples: Sample[];
  aligned: boolean;
  edgeScores: number[];
  capturedAt: number;
  corners?: readonly ScanPoint[];
};
export function scanSquare(width: number, height: number) {
  const side = Math.min(width, height) * 0.65;
  return { side, left: (width - side) / 2, top: (height - side) / 2 };
}
type Fit = {
  x: number;
  y: number;
  scale: number;
  angle: number;
  px: number;
  py: number;
  aspect: number;
  shear: number;
};
const median = (a: number[]) => a.sort((a, b) => a - b)[a.length >> 1];

/** Fit the face's complete grid, rather than demanding that every seam land
 * exactly on the painted guide. All fitting stays in a bounded neighborhood
 * of that guide; it cannot accept a distant/small cube elsewhere in the frame.
 * Geometric admission is independent of red/orange classification ambiguity. */
export function inspectScanFrame(
  data: Uint8Array,
  width: number,
  height: number,
  size: 2 | 3 | 4,
  capturedAt: number,
): ScanFrame {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 48 ||
    height < 48 ||
    width > 2048 ||
    height > 2048 ||
    data.length !== width * height * 4 ||
    !Number.isFinite(capturedAt)
  )
    throw Error("Invalid scan image");
  const { side } = scanSquare(width, height),
    cell = side / size;
  const index = (x: number, y: number) =>
    (Math.max(0, Math.min(height - 1, Math.round(y))) * width +
      Math.max(0, Math.min(width - 1, Math.round(x)))) *
    4;
  const rgb = (x: number, y: number): [number, number, number] => {
    const i = index(x, y);
    return [data[i], data[i + 1], data[i + 2]];
  };
  function contrast(a: number, b: number) {
    const d = Math.max(
      Math.abs(data[a] - data[b]),
      Math.abs(data[a + 1] - data[b + 1]),
      Math.abs(data[a + 2] - data[b + 2]),
    );
    const light = Math.max(
      data[a],
      data[a + 1],
      data[a + 2],
      data[b],
      data[b + 1],
      data[b + 2],
    );
    // Relative contrast survives dim rooms and light stickerless seams. The
    // absolute floor still excludes small sensor fluctuations in flat fields.
    return d < 6 ? 0 : Math.min(1, d / (18 + light) / 0.25);
  }
  function project(f: Fit) {
    const cos = Math.cos(f.angle),
      sin = Math.sin(f.angle);
    return (u: number, v: number): ScanPoint => {
      u -= 0.5;
      v -= 0.5;
      const d = 1 + f.px * u + f.py * v;
      return [
        width / 2 +
          side *
            (f.x + (f.scale * (cos * u * f.aspect + (-sin + f.shear) * v)) / d),
        height / 2 +
          side * (f.y + (f.scale * (sin * u * f.aspect + cos * v)) / d),
      ];
    };
  }
  function measure(f: Fit) {
    const p = project(f),
      lines: number[] = [];
    for (let axis = 0; axis < 2; axis++)
      for (let line = 0; line <= size; line++) {
        let support = 0;
        for (let row = 0; row < size; row++)
          for (const along of [0.3, 0.7]) {
            const u = axis === 0 ? line / size : (row + along) / size;
            const v = axis === 1 ? line / size : (row + along) / size;
            const distance = 0.12 / size;
            const a = p(
              u - (axis === 0 ? distance : 0),
              v - (axis === 1 ? distance : 0),
            );
            const b = p(
              u + (axis === 0 ? distance : 0),
              v + (axis === 1 ? distance : 0),
            );
            const center = p(u, v);
            const ia = index(...a),
              ib = index(...b),
              ic = index(...center);
            support += Math.max(
              contrast(ia, ib),
              contrast(ic, ia),
              contrast(ic, ib),
            );
          }
        lines.push(support / (size * 2));
      }
    const outer = [lines[0], lines[size], lines[size + 1], lines.at(-1)!];
    const internal = lines.filter(
      (_, i) => i % (size + 1) !== 0 && i % (size + 1) !== size,
    );
    // A weak side under glare is tolerable; weak internal grid lines are not.
    const score =
      (outer.reduce((a, b) => a + b, 0) / 4) * 0.4 +
      (internal.reduce((a, b) => a + b, 0) / internal.length) * 0.4 +
      Math.min(...internal) * 0.2;
    return { f, outer, internal, score };
  }
  const seeds: ReturnType<typeof measure>[] = [];
  for (const x of [-0.06, -0.03, 0, 0.03, 0.06])
    for (const y of [-0.06, -0.03, 0, 0.03, 0.06])
      for (const scale of [0.92, 1, 1.08])
        for (const angle of [-8, 0, 8]) {
          const r = measure({
            x,
            y,
            scale,
            angle: (angle * Math.PI) / 180,
            px: 0,
            py: 0,
            aspect: 1,
            shear: 0,
          });
          seeds.push(r);
        }
  seeds.sort((a, b) => b.score - a.score);
  let best = seeds[0];
  for (const seed of seeds.slice(0, 3)) {
    let local = seed;
    for (const px of [-0.16, 0, 0.16])
      for (const py of [-0.16, 0, 0.16]) {
        const r = measure({ ...seed.f, px, py });
        if (r.score > local.score) local = r;
      }
    for (const [key, delta] of [
      ["x", 0.015],
      ["y", 0.015],
      ["scale", 0.025],
      ["angle", Math.PI / 90],
      ["aspect", 0.06],
      ["shear", 0.06],
      ["px", 0.08],
      ["py", 0.08],
    ] as const) {
      const start = local;
      for (const sign of [-1, 1]) {
        const r = measure({ ...start.f, [key]: start.f[key] + delta * sign });
        if (r.score > local.score) local = r;
      }
    }
    if (local.score > best.score) best = local;
  }
  const p = project(best.f),
    spreads: number[] = [],
    usable: boolean[] = [];
  const samples = Array.from({ length: size * size }, (_, i) => {
    const col = i % size,
      row = Math.floor(i / size),
      points: number[][] = [];
    for (const dy of [-0.3, -0.15, 0, 0.15, 0.3])
      for (const dx of [-0.3, -0.15, 0, 0.15, 0.3]) {
        if (size === 3 && i === 4 && Math.hypot(dx, dy) < 0.25) continue;
        points.push(
          rgb(...p((col + 0.5 + dx) / size, (row + 0.5 + dy) / size)),
        );
      }
    const color = [0, 1, 2].map((k) => median(points.map((v) => v[k]))) as [
      number,
      number,
      number,
    ];
    const spread = median(
      points.map((v) => Math.max(...v.map((n, k) => Math.abs(n - color[k])))),
    );
    spreads.push(spread);
    const light = Math.max(...color),
      saturation = light - Math.min(...color);
    usable.push(light >= 38 && (saturation >= 20 || light >= 70));
    const whiteFraction =
      points.filter(
        (v) =>
          Math.max(...v) >= 70 &&
          (Math.max(...v) - Math.min(...v)) / Math.max(...v) < 0.23,
      ).length / points.length;
    const sample = recognize(color);
    // A neutral sticker stays white under lower exposure; do not interpret its
    // tiny hue differences as yellow/orange merely because value fell below
    // the old fixed bright-white cutoff. Dark plastic remains ineligible.
    if (light >= 70 && saturation / light < 0.23) {
      sample.color = "U";
      sample.confidence = Math.max(sample.confidence, whiteFraction);
    }
    return { ...sample, whiteFraction };
  });
  // A 4x4 also has a central cross. Do not mistake it for a 2x2 by ignoring
  // the extra seams running through the middle of its expected stickers.
  const interiorSeams = [0, 1].map((axis) => {
    let split = 0,
      count = 0;
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        if (size === 3 && row === 1 && col === 1) continue;
        let strongest = 0;
        for (const across of [
          0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7,
        ]) {
          let support = 0;
          for (const along of [0.2, 0.35, 0.65, 0.8]) {
            const u = (col + (axis === 0 ? across : along)) / size;
            const v = (row + (axis === 1 ? across : along)) / size;
            const a = p(
              u - (axis === 0 ? 0.07 / size : 0),
              v - (axis === 1 ? 0.07 / size : 0),
            );
            const b = p(
              u + (axis === 0 ? 0.07 / size : 0),
              v + (axis === 1 ? 0.07 / size : 0),
            );
            const center = index(...p(u, v));
            support += Math.max(
              contrast(center, index(...a)),
              contrast(center, index(...b)),
            );
          }
          strongest = Math.max(strongest, support / 4);
        }
        if (strongest >= 0.75) split++;
        count++;
      }
    return split / count;
  });
  return {
    samples,
    capturedAt,
    edgeScores: best.outer,
    corners: [p(0, 0), p(1, 0), p(1, 1), p(0, 1)],
    aligned:
      best.outer.every((v) => v >= 0.25) &&
      best.outer.filter((v) => v >= 0.48).length >= 3 &&
      best.outer.reduce((a, b) => a + b, 0) / 4 >= 0.55 &&
      // Light stickerless seams can be much weaker than color transitions.
      // Require coherent evidence on every line plus a strong grid overall.
      best.internal.every((v) => v >= 0.28) &&
      best.internal.reduce((a, b) => a + b, 0) / best.internal.length >= 0.52 &&
      !interiorSeams.every((v) => v >= 0.6) &&
      usable.every(
        (v, i) =>
          (size === 3 && i === 4) ||
          (v && spreads[i] <= Math.max(25, Math.max(...samples[i].rgb) * 0.22)),
      ),
  };
}
