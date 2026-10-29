// Explicit fixture generation only. Tests never regenerate their own expected states.
// The unmodified official program computes every move; no Cubers turn code is used.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
// Historical, independent test oracle only. Never used by the app or deployment.
import { WCA_EVENTS } from "../apps/api/src/wca-scrambles";
const WCA_PROGRAM = {
  program: "TNoodle-WCA",
  version: "1.2.3",
  artifactSha256:
    "e9ff6a164effee8a7ecdcc5c18111d4aa09d1de471b71de224889a1282d98cd5",
};
async function main() {
  const origin = new URL(
    process.env.WCA_REFERENCE_URL || "http://127.0.0.1:2015",
  );
  assert.ok(
    origin.protocol === "http:" &&
      !origin.username &&
      !origin.password &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash,
  );
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname),
    "Fixture generation is loopback-only",
  );
  const jar = await readFile(".data/tnoodle/TNoodle-WCA-1.2.3.jar");
  assert.equal(
    createHash("sha256").update(jar).digest("hex"),
    WCA_PROGRAM.artifactSha256,
  );
  async function reference(path: string) {
    const r = await fetch(new URL(path, origin), {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(r.status, 200);
    let size = 0;
    const chunks: Uint8Array[] = [];
    for await (const chunk of r.body!) {
      size += chunk.length;
      assert.ok(size <= 262144);
      chunks.push(chunk);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  }
  const version = JSON.parse(await reference("/version"));
  assert.equal(version.projectName, WCA_PROGRAM.program);
  assert.equal(version.projectVersion, WCA_PROGRAM.version);
  assert.equal(version.signedBuild, true);
  const samples = JSON.parse(
    await readFile("tests/helpers/wca-samples.json", "utf8"),
  );
  const color: Record<string, string> = {
    "#ffffff": "U",
    "#ffff00": "D",
    "#00ff00": "F",
    "#ff0000": "R",
    "#ff8000": "L",
    "#0000ff": "B",
  };
  const rects = (s: string) =>
    [...s.matchAll(/<rect\b([^>]+)>/g)].map((m) =>
      Object.fromEntries(
        [...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]),
      ),
    );
  const triangles = (s: string) =>
    [...s.matchAll(/<path\b[^>]*d="([^"]+)"[^>]*fill="([^"]+)"/g)].map((m) => ({
      points: m[1].match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)!.map(Number),
      color: m[2],
    }));
  const result: any = {
    ...WCA_PROGRAM,
    method:
      "Official state drawings; fixed cube net rows and geometrically unfolded Pyraminx sticker centers. No Cubers turn code.",
    puzzles: {},
  };
  for (const [puzzle, event] of Object.entries(WCA_EVENTS)) {
    const pyra = puzzle === "pyraminx";
    const svg = (scramble: string) =>
      reference(
        `/api/v0/view/${event}/svg?` +
          new URLSearchParams({
            scramble,
            ...(pyra ? { scheme: "ffff00,00ff00,0000ff,ff0000" } : {}),
          }),
      );
    const solved = await svg("");
    const moves = pyra
      ? ["U", "L", "R", "B", "u", "l", "r", "b"].flatMap((m) => [m, m + "'"])
      : [
          "U",
          "R",
          "F",
          "D",
          "L",
          "B",
          ...(puzzle === "4x4" ? ["Uw", "Rw", "Fw", "Dw", "Lw", "Bw"] : []),
        ].flatMap((m) => [m, m + "'", m + "2"]);
    const cases: any[] = [];
    let keys: string[] = [];
    if (pyra) {
      const shapes = triangles(solved);
      assert.equal(shapes.length, 36);
      // Unfolded net: front U at top, L/R at lower corners; bottom B below.
      // The two remaining faces fold onto those same named tetrahedral vertices.
      const faceVertices: Record<string, string[]> = {
        F: ["U", "L", "R"],
        R: ["U", "R", "B"],
        B: ["U", "B", "L"],
        D: ["B", "R", "L"],
      };
      const vertex: Record<string, number> = { U: 0, L: 1, R: 2, B: 3 },
        outer: Record<string, number[][]> = {};
      for (const c of ["#00ff00", "#ff0000", "#0000ff", "#ffff00"]) {
        const points = shapes
          .filter((t) => t.color === c)
          .flatMap((t) => {
            assert.equal(t.points.length, 6);
            return [
              [t.points[0], t.points[1]],
              [t.points[2], t.points[3]],
              [t.points[4], t.points[5]],
            ];
          });
        assert.equal(points.length, 27);
        const minx = points.reduce((a, b) => (a[0] < b[0] ? a : b)),
          maxx = points.reduce((a, b) => (a[0] > b[0] ? a : b)),
          miny = points.reduce((a, b) => (a[1] < b[1] ? a : b)),
          maxy = points.reduce((a, b) => (a[1] > b[1] ? a : b)),
          f = color[c];
        outer[f] =
          f === "F"
            ? [miny, minx, maxx]
            : f === "R"
              ? [minx, maxy, maxx]
              : f === "B"
                ? [maxx, minx, maxy]
                : [maxy, maxx, minx];
      }
      keys = shapes.map((t) => {
        const f = color[t.color],
          [a, b, c] = outer[f],
          x = (t.points[0] + t.points[2] + t.points[4]) / 3,
          y = (t.points[1] + t.points[3] + t.points[5]) / 3,
          den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]),
          wa = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den,
          wb = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den,
          position = [0, 0, 0, 0];
        [wa, wb, 1 - wa - wb].forEach((w, i) => {
          assert.ok(Math.abs(w * 9 - Math.round(w * 9)) < 1e-5);
          position[vertex[faceVertices[f][i]]] = Math.round(w * 9);
        });
        assert.equal(
          position.reduce((a, b) => a + b, 0),
          9,
        );
        return position.join(",");
      });
      assert.equal(new Set(keys).size, 36);
    }
    for (const algorithm of [...moves, ...samples[puzzle]]) {
      const drawn = await svg(algorithm);
      if (pyra) {
        const shapes = triangles(drawn);
        assert.equal(shapes.length, 36);
        const stickers = keys
          .map((key, i) => ({
            position: key.split(",").map(Number),
            color: color[shapes[i].color],
          }))
          .sort((a, b) =>
            a.position.join(",").localeCompare(b.position.join(",")),
          );
        assert.ok(stickers.every((x) => x.color));
        cases.push({ moves: algorithm.split(/\s+/), stickers });
      } else {
        const base = rects(solved),
          actual = rects(drawn);
        assert.equal(base.length, 6 * Number(puzzle[0]) ** 2);
        assert.equal(actual.length, base.length);
        const faces: Record<string, string[]> = {
          U: [],
          R: [],
          F: [],
          D: [],
          L: [],
          B: [],
        };
        base.forEach((r, i) => {
          assert.equal(r.x, actual[i].x);
          assert.equal(r.y, actual[i].y);
          assert.ok(color[actual[i].fill]);
          faces[color[r.fill]].push(color[actual[i].fill]);
        });
        cases.push({ moves: algorithm.split(/\s+/), faces });
      }
    }
    result.puzzles[puzzle] = cases;
    console.log(`${puzzle}: ${cases.length} official expected sticker states`);
  }
  await writeFile(
    "tests/helpers/wca-oracle-states.json",
    JSON.stringify(result, null, 2) + "\n",
  );
}
void main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Official state fixture generation failed",
  );
  process.exitCode = 1;
});
