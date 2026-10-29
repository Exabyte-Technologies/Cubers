import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WcaScrambles,
  WCA_PROGRAM,
  WCA_EVENTS,
  parseWcaSet,
} from "../apps/api/src/wca-scrambles";
import {
  inverse,
  practiceApply,
  practiceSolved,
  solvedPuzzle,
  facelets,
  isPyraminx,
  type Puzzle,
} from "@cubers/core";
const samples = JSON.parse(
  readFileSync("tests/helpers/wca-samples.json", "utf8"),
) as Record<Puzzle, string[]>;
const oracle = JSON.parse(
  readFileSync("tests/helpers/wca-oracle-states.json", "utf8"),
);
for (const [puzzle, count] of [
  ["2x2", 20],
  ["3x3", 20],
  ["4x4", 38],
  ["pyraminx", 18],
] as const)
  test(`${puzzle}: all supported face, wide or tip turns and sample scrambles match independent official sticker states`, () => {
    assert.deepEqual(
      {
        program: oracle.program,
        version: oracle.version,
        artifactSha256: oracle.artifactSha256,
      },
      {
        program: "TNoodle-WCA",
        version: "1.2.3",
        artifactSha256:
          "e9ff6a164effee8a7ecdcc5c18111d4aa09d1de471b71de224889a1282d98cd5",
      },
    );
    assert.equal(oracle.puzzles[puzzle].length, count);
    for (const item of oracle.puzzles[puzzle]) {
      const state = practiceApply(solvedPuzzle(puzzle), item.moves);
      if (puzzle === "pyraminx") {
        assert.ok(isPyraminx(state));
        const stickers = [...state.stickers].sort((a, b) =>
          a.position.join(",").localeCompare(b.position.join(",")),
        );
        assert.deepEqual(stickers, item.stickers, item.moves.join(" "));
      } else {
        assert.ok(!isPyraminx(state));
        assert.deepEqual(facelets(state), item.faces, item.moves.join(" "));
      }
    }
  });

for (const puzzle of Object.keys(WCA_EVENTS) as Puzzle[])
  test(`${puzzle}: actual community random-state generation reconstructs and stores exact provenance`, async () => {
    const client = new WcaScrambles({ SCRAMBLE_TIMEOUT_MS: 30000 });
    try {
      const set = await client.generate(puzzle, 3);
      assert.deepEqual(set.source, {
        ...WCA_PROGRAM,
        event: WCA_EVENTS[puzzle],
      });
      assert.equal(set.scrambles.length, 3);
      for (const moves of set.scrambles) {
        const state = practiceApply(solvedPuzzle(puzzle), moves);
        assert.equal(practiceSolved(state), false);
        assert.equal(
          practiceSolved(practiceApply(state, inverse(moves))),
          true,
        );
      }
      assert.deepEqual(client.stored(puzzle, set, 3), set);
      // Parsing the independently captured Java samples remains interoperable;
      // parsing alone does not claim those historic strings came from cubing.js.
      assert.equal(parseWcaSet(puzzle, samples[puzzle], 2).scrambles.length, 2);
    } finally {
      await client.close();
    }
  });
test("malformed output and changed provenance fail closed", async () => {
  for (const raw of [
    [],
    [""],
    ["R R'"],
    ["x R"],
    ["r"],
    ["R (U)"],
    ["R " + "U ".repeat(101)],
  ])
    assert.throws(() => parseWcaSet("3x3", raw, 1));
  assert.throws(() => parseWcaSet("pyraminx", ["U2 R"], 1));
  assert.throws(() => parseWcaSet("2x2", ["Rw U"], 1));
  const c = new WcaScrambles({ SCRAMBLE_TIMEOUT_MS: 30000 });
  try {
    const set = parseWcaSet("3x3", [samples["3x3"][0]], 1);
    for (const change of [
      { event: "222" },
      { version: "0.0.0" },
      { program: "TNoodle-WCA" },
      { filter: "none" },
      { artifactSha256: "0".repeat(64) },
      { extra: true },
    ])
      assert.throws(() =>
        c.stored("3x3", { ...set, source: { ...set.source, ...change } }),
      );
    for (const count of [0, 31, 1.5])
      assert.throws(() => c.generate("3x3", count));
  } finally {
    await c.close();
  }
});
test("community workers time out, capacity is bounded and closing rejects all admitted work", async () => {
  const timed = new WcaScrambles({ SCRAMBLE_TIMEOUT_MS: 1 });
  try {
    await assert.rejects(
      timed.generate("4x4", 30),
      (e: any) => e.getStatus?.() === 503,
    );
  } finally {
    await timed.close();
  }
  const client = new WcaScrambles({ SCRAMBLE_TIMEOUT_MS: 30000 });
  const jobs = Array.from({ length: 132 }, () => client.generate("4x4", 30));
  const results = Promise.allSettled(jobs);
  await assert.rejects(
    client.generate("4x4"),
    (e: any) => e.getStatus?.() === 503,
  );
  await client.close();
  assert.ok(
    (await results).every(
      (r) => r.status === "rejected" && r.reason.getStatus?.() === 503,
    ),
  );
  await assert.rejects(
    client.generate("3x3"),
    (e: any) => e.getStatus?.() === 503,
  );
});
test("distance filters reject short states, rotated 2x2 states and tip-padded Pyraminx bodies", async () => {
  // Import the native ESM implementation without a CommonJS transform.
  const { passesMinimumDistance: passes } = await new Function(
    "return import('../apps/api/src/wca-filter.mjs')",
  )();
  for (const alg of ["", "R", "R U F", "x R U F y"])
    assert.equal(await passes("222", alg), false, alg);
  for (const event of ["333", "444"])
    for (const alg of ["", "R2", "x R' y"])
      assert.equal(await passes(event, alg), false, `${event}: ${alg}`);
  assert.equal(await passes("444", "Rw"), false);
  for (const alg of ["", "U R L B U", "U R L B U u r b l"])
    assert.equal(await passes("pyram", alg), false, alg);
  for (const [puzzle, event] of Object.entries(WCA_EVENTS))
    assert.equal(await passes(event, samples[puzzle as Puzzle][0]), true);
});
