// Synthetic guidance diagnostic. Run only in the resource-limited API container, via stdin.
require("/app/node_modules/reflect-metadata");
const { performance } = require("node:perf_hooks");
const { FirstSolveSolver } = require("/app/apps/api/dist/first-solve-solver");
const {
  solvedPuzzle,
  practiceApply,
  practiceSolved,
  guidedState,
  guidedFacelets,
  guidedGoal,
  scramble,
  pyraminxScramble,
} = require("/app/packages/core/dist");
let seed = 0x506c6179;
const random = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const cases = [];
async function solve(solver, phase, index, puzzle = "4x4") {
  const moves =
    puzzle === "pyraminx"
      ? pyraminxScramble(random)
      : scramble(Number(puzzle[0]), random);
  const state = guidedState(
    puzzle,
    guidedFacelets(practiceApply(solvedPuzzle(puzzle), moves)),
  );
  const start = performance.now();
  try {
    const plan = await solver.solve(state);
    const elapsedMs = Math.round(performance.now() - start);
    let current = guidedState(puzzle, plan.startingFaces);
    for (const step of plan.steps) {
      current = practiceApply(current, step.moves);
      if (!guidedGoal(current, step))
        throw Error("Checkpoint reconstruction failed");
    }
    if (!practiceSolved(current)) throw Error("Reconstruction failed");
    cases.push({
      phase,
      index,
      puzzle,
      elapsedMs,
      checkpoints: plan.steps.length,
      ok: true,
    });
  } catch (e) {
    cases.push({
      phase,
      index,
      puzzle,
      elapsedMs: Math.round(performance.now() - start),
      ok: false,
      error: e.message,
    });
  }
}
(async () => {
  for (let i = 0; i < 12; i++) {
    const s = new FirstSolveSolver();
    try {
      await solve(s, "cold", i);
    } finally {
      await s.onModuleDestroy();
    }
  }
  const s = new FirstSolveSolver();
  try {
    for (let i = 0; i < 2000; i++)
      await solve(
        s,
        "warm",
        i,
        ["4x4", "3x3", "2x2", "pyraminx", "4x4"][i % 5],
      );
  } finally {
    await s.onModuleDestroy();
  }
  if (cases.some((entry) => !entry.ok)) process.exitCode = 1;
  console.log(
    JSON.stringify({
      node: process.version,
      cases,
      failures: cases.filter((x) => !x.ok).length,
    }),
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
