import test from "node:test";
import sharp from "sharp";
import jpeg from "jpeg-js";
import assert from "node:assert/strict";
import {
  FACES,
  solvedCube,
  facelets,
  applyMoves,
  turn,
  stateKey,
  validateScan,
  type Face,
  type CubeState,
} from "@cubers/core";
import {
  ScanReadLease,
  inspectScanFrame,
  scanSquare,
  AutomaticScanGate,
  SCAN_FACE_ORDER,
  SCAN_TURNS,
  resolveAutomaticScan,
  sameScannedFace,
  type ScanFrame,
} from "../apps/mobile/src/automatic-scan";
import { recognize, type Sample } from "../apps/mobile/src/scan";
const rgb: Record<Face, [number, number, number]> = {
  U: [240, 240, 240],
  R: [230, 20, 15],
  F: [20, 180, 40],
  D: [240, 225, 10],
  L: [240, 125, 10],
  B: [20, 60, 225],
};
const samples = (colors: readonly Face[]) =>
  colors.map((color) => ({ ...recognize(rgb[color]), color }));
function pixels(
  size: 2 | 3 | 4,
  colors: Face[],
  scale = 1,
  shift = 0,
  logo = false,
) {
  const width = 400,
    height = 400,
    data = new Uint8Array(width * height * 4),
    side = 260,
    left = 70,
    top = 70,
    actual = side * scale,
    cell = actual / size;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let value = [85, 85, 85];
      const xx = x - (left + (side - actual) / 2 + shift),
        yy = y - (top + (side - actual) / 2);
      if (xx >= -3 && xx <= actual + 3 && yy >= -3 && yy <= actual + 3)
        value = [12, 12, 12];
      if (xx >= 0 && xx < actual && yy >= 0 && yy < actual) {
        const c = Math.floor(xx / cell),
          r = Math.floor(yy / cell),
          u = xx - c * cell,
          v = yy - r * cell;
        if (u > 3 && u < cell - 3 && v > 3 && v < cell - 3)
          value = rgb[colors[r * size + c]];
        if (
          logo &&
          size === 3 &&
          r === 1 &&
          c === 1 &&
          Math.abs(u / cell - 0.5) < 0.18 &&
          Math.abs(v / cell - 0.5) < 0.18
        )
          value = [15, 30, 120];
      }
      const i = (y * width + x) * 4;
      data.set([...value, 255], i);
    }
  return { data, width, height };
}
const frame = (
  color: Face,
  time: number,
  aligned = true,
  size: 2 | 3 | 4 = 3,
): ScanFrame => ({
  samples: samples(Array(size * size).fill(color)),
  capturedAt: time,
  aligned,
  edgeScores: [1, 1, 1, 1],
});
test("automatic alignment accepts a filled 2x2/3x3/4x4 physical grid and rejects background, wrong scale, partial alignment and invalid buffers", () => {
  for (const size of [2, 3, 4] as const) {
    const colors = Array.from({ length: size * size }, (_, i) => FACES[i % 6]);
    const image = pixels(size, colors);
    assert.equal(
      inspectScanFrame(image.data, image.width, image.height, size, 0).aligned,
      true,
      `${size} aligned`,
    );
    for (const [scale, shift] of [
      [0.65, 0],
      [1.3, 0],
      [1, 60],
    ]) {
      const p = pixels(size, colors, scale, shift);
      assert.equal(
        inspectScanFrame(p.data, p.width, p.height, size, 0).aligned,
        false,
        `${size} scale ${scale} shift ${shift}`,
      );
    }
  }
  const background = new Uint8Array(400 * 400 * 4).fill(230);
  assert.equal(inspectScanFrame(background, 400, 400, 3, 0).aligned, false);
  assert.throws(() => inspectScanFrame(new Uint8Array(4), 400, 400, 3, 0));
});
test("center ring recognition excludes a dark/blue logo on the white center without changing the other eight stickers", () => {
  const colors: Face[] = ["R", "D", "F", "B", "U", "L", "F", "R", "D"];
  const image = pixels(3, colors, 1, 0, true);
  const scan = inspectScanFrame(image.data, image.width, image.height, 3, 0);
  assert.equal(scan.aligned, true);
  assert.deepEqual(
    scan.samples.map((s) => s.color),
    colors,
  );
  assert.equal(scan.samples[4].whiteFraction, 1);
});
test("automatic capture requires 500 ms of stable alignment and resets when alignment or sticker pattern changes", () => {
  const gate = new AutomaticScanGate(3);
  assert.equal(gate.feed(frame("U", 0)).phase, "holding");
  assert.equal(gate.feed(frame("U", 499)).phase, "holding");
  assert.equal(gate.feed(frame("U", 500, false)).phase, "searching");
  assert.equal(gate.feed(frame("U", 600)).phase, "holding");
  assert.equal(gate.feed(frame("R", 900)).phase, "holding");
  assert.equal(gate.feed(frame("R", 1399)).phase, "holding");
  assert.ok(gate.feed(frame("R", 1400)).captured);
  assert.equal(gate.captured.length, 1);
});
test("the turn animation cannot capture, time alone cannot rearm, and a repeat face remains blocked after moving away", () => {
  const gate = new AutomaticScanGate(3);
  gate.feed(frame("U", 0));
  gate.feed(frame("U", 500));
  assert.equal(gate.feed(frame("R", 1000)).phase, "turning");
  assert.equal(gate.feed(frame("R", 2000)).phase, "move-away");
  gate.feed(frame("U", 2100, false));
  gate.feed(frame("U", 2200, false));
  assert.equal(gate.feed(frame("U", 2300)).phase, "duplicate");
  assert.equal(gate.captured.length, 1);
  assert.equal(gate.feed(frame("R", 2400)).phase, "holding");
  assert.ok(gate.feed(frame("R", 2900)).captured);
});
test("movement during the 1.5s animation can rearm, but stale frames and a suspended camera cannot complete the hold", () => {
  const gate = new AutomaticScanGate(3);
  gate.feed(frame("U", 0));
  gate.feed(frame("U", 500));
  gate.feed(frame("U", 650, false));
  gate.feed(frame("R", 800, false));
  assert.equal(gate.feed(frame("R", 1000)).phase, "turning");
  assert.equal(gate.feed(frame("R", 2000)).phase, "holding");
  gate.resetHold();
  assert.equal(gate.feed(frame("R", 2600)).phase, "holding");
  assert.equal(gate.feed(frame("R", 2400)).phase, "searching");
  assert.equal(gate.captured.length, 1);
  assert.ok(gate.feed(frame("R", 3100)).captured);
});
test("repeat-face comparison covers all four in-plane rotations; a centerless ambiguous next face requires explicit confirmation and stability", () => {
  const a = samples(["U", "R", "F", "D"]);
  const b = [a[2], a[0], a[3], a[1]];
  assert.equal(sameScannedFace(a, b, 2), true);
  const gate = new AutomaticScanGate(2);
  gate.feed({ ...frame("U", 0, true, 2), samples: a });
  gate.feed({ ...frame("U", 500, true, 2), samples: a });
  gate.feed(frame("U", 700, false, 2));
  gate.feed(frame("U", 900, false, 2));
  assert.equal(
    gate.feed({ ...frame("U", 2000, true, 2), samples: b }).phase,
    "duplicate",
  );
  gate.confirmDistinctFace();
  assert.equal(
    gate.feed({ ...frame("U", 2100, true, 2), samples: b }).phase,
    "holding",
  );
  assert.ok(gate.feed({ ...frame("U", 2600, true, 2), samples: b }).captured);
});
function tour(cube: CubeState) {
  const captured: Sample[][] = [];
  let held = cube;
  for (let i = 0; i < 6; i++) {
    captured.push(samples(facelets(held).F));
    held = applyMoves(held, [...SCAN_TURNS[i]]);
  }
  assert.equal(
    stateKey(held),
    stateKey(cube),
    "all turn instructions restore the initial grip",
  );
  return captured;
}
test("six-face turn instructions preserve every sticker and accept all 24 starting grips for scrambled 2x2/3x3/4x4 cubes", () => {
  for (const size of [2, 3, 4] as const) {
    const start = applyMoves(solvedCube(size), "R U F2 L D B U2");
    const queue = [start],
      seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const cube = queue[i],
        key = stateKey(cube);
      if (seen.has(key)) continue;
      seen.add(key);
      const captures = tour(cube),
        result = resolveAutomaticScan(size, captures);
      assert.equal(validateScan(result.state).valid, true);
      const expected = facelets(cube);
      SCAN_FACE_ORDER.forEach((face, j) =>
        assert.deepEqual(
          captures[j].map((s) => s.color),
          expected[face],
        ),
      );
      if (size !== 3) assert.equal(stateKey(result.state), stateKey(cube));
      else assert.ok(FACES.every((f) => facelets(result.state)[f][4] === f));
      queue.push(turn(cube, "x"), turn(cube, "y"));
    }
    assert.equal(seen.size, 24);
  }
});
test("whole-cube legality uniquely repairs a duplicated logo-covered white center in every starting grip", () => {
  const start = applyMoves(solvedCube(3), "R U F2 L D");
  const queue = [start],
    seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const cube = queue[i],
      key = stateKey(cube);
    if (seen.has(key)) continue;
    seen.add(key);
    const captures = tour(cube),
      white = captures.findIndex((face) => face[4].color === "U");
    captures[white][4] = { ...captures[white][4], color: "B", confidence: 0.3 };
    const result = resolveAutomaticScan(3, captures);
    assert.equal(result.correctedCenter, SCAN_FACE_ORDER[white]);
    assert.equal(stateKey(result.state), stateKey(start));
    queue.push(turn(cube, "x"), turn(cube, "y"));
  }
  assert.equal(seen.size, 24);
});
test("logo repair never changes a non-center or guesses other missing colors/invalid cube states", () => {
  const captures = tour(solvedCube(3));
  captures[0][0] = { ...captures[0][0], color: "B" };
  assert.throws(() => resolveAutomaticScan(3, captures));
  const bad = tour(solvedCube(3));
  bad[0][4] = { ...bad[0][4], color: "B" };
  assert.throws(() => resolveAutomaticScan(3, bad));
  assert.throws(() => resolveAutomaticScan(3, []));
});

test("a fully ink-covered uncertain center can be read without blocking alignment and is repaired only by the full cube validation", () => {
  const image = pixels(3, Array(9).fill("U"));
  const { left, top, side } = scanSquare(image.width, image.height),
    cell = side / 3;
  for (let y = Math.ceil(top + cell + 4); y < top + 2 * cell - 4; y++)
    for (let x = Math.ceil(left + cell + 4); x < left + 2 * cell - 4; x++)
      image.data.set([10, 10, 10, 255], (y * image.width + x) * 4);
  const frame = inspectScanFrame(image.data, image.width, image.height, 3, 0);
  assert.equal(frame.aligned, true);
  assert.equal(frame.samples[4].confidence, 0);
  const captures = tour(solvedCube(3));
  captures[SCAN_FACE_ORDER.indexOf("U")] = frame.samples;
  const fixed = resolveAutomaticScan(3, captures);
  assert.equal(fixed.correctedCenter, "U");
  assert.equal(stateKey(fixed.state), stateKey(solvedCube(3)));
});

test("camera read leases reject background/restarted results and preserve one in-flight native capture until it completes", () => {
  const reader = new ScanReadLease(),
    old = reader.begin()!;
  assert.equal(reader.isCurrent(old), true);
  assert.equal(reader.begin(), null);
  reader.invalidate();
  assert.equal(reader.isCurrent(old), false);
  assert.equal(reader.begin(), null);
  reader.finish(old);
  const fresh = reader.begin()!;
  assert.equal(reader.isCurrent(fresh), true);
  reader.finish(old);
  assert.equal(reader.begin(), null);
  reader.finish(fresh);
  assert.ok(reader.begin());
});

test("camera ROI matches the square cover-preview in portrait and landscape", () => {
  assert.deepEqual(scanSquare(640, 480), { side: 312, left: 164, top: 84 });
  assert.deepEqual(scanSquare(480, 640), { side: 312, left: 84, top: 164 });
});
test("automatic alignment and sticker colors survive JPEG encoding, dimming and small sensor noise", async () => {
  for (const size of [2, 3, 4] as const)
    for (const light of [1, 0.7]) {
      const colors = Array.from(
        { length: size * size },
        (_, i) => FACES[i % 6],
      );
      const image = pixels(size, colors);
      for (let i = 0; i < image.data.length; i += 4)
        for (let channel = 0; channel < 3; channel++)
          image.data[i + channel] = Math.max(
            0,
            Math.min(
              255,
              Math.round(image.data[i + channel] * light) + (i % 7) - 3,
            ),
          );
      const encoded = await sharp(image.data, {
        raw: { width: 400, height: 400, channels: 4 },
      })
        .jpeg({ quality: 85 })
        .toBuffer();
      const decoded = jpeg.decode(encoded, { useTArray: true });
      const frame = inspectScanFrame(
        decoded.data,
        decoded.width,
        decoded.height,
        size,
        0,
      );
      assert.equal(frame.aligned, true, `${size} JPEG light ${light}`);
      assert.deepEqual(
        frame.samples.map((s) => s.color),
        colors,
      );
    }
});
