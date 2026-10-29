// Offline curriculum tooling only. No network, account data, AI or live solver.
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

if (isMainThread) {
  const entries = JSON.parse(
    readFileSync("packages/core/src/algorithm-cases.json", "utf8"),
  ).families.flatMap((f) => f.cases);
  const output = resolve(
    process.argv[2] || "packages/core/src/algorithm-alternatives.json",
  );
  const worker = new Worker(new URL(import.meta.url), {
    workerData: entries,
    execArgv: [],
    resourceLimits: { maxOldGenerationSizeMb: 512, stackSizeMb: 4 },
  });
  let timer;
  const results = await new Promise((resolve, reject) => {
    const deadline = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void worker
          .terminate()
          .then(() =>
            reject(Error("Case solver timed out; no output replaced")),
          );
      }, 15000);
    };
    deadline();
    worker.on("message", (message) => {
      if (message.type === "progress") {
        deadline();
        return;
      }
      clearTimeout(timer);
      if (message.type === "result") resolve(message.entries);
      else reject(Error("Case generation failed; no output replaced"));
    });
    worker.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(Error("Case worker exited; no output replaced"));
    });
  }).finally(() => worker.terminate());
  const data = {
    schemaVersion: 1,
    generator: "cubing.js",
    version: "0.66.1",
    method:
      "Offline complete-state 2x2 and two-phase 3x3 solving; exact Cubers facelet verification; strictly fewer outer face turns, not an optimality or speed claim.",
    entries: results,
  };
  writeFileSync(output + ".tmp", JSON.stringify(data, null, 2) + "\n");
  renameSync(output + ".tmp", output);
  for (const family of ["OLL", "PLL", "CLL"]) {
    const rows = results.filter((row) => row.family === family);
    console.log(
      JSON.stringify({
        family,
        alternatives: rows.length,
        oldTurns: rows.reduce(
          (n, row) => n + row.baselineAlgorithm.split(" ").length,
          0,
        ),
        newTurns: rows.reduce(
          (n, row) => n + row.algorithm.split(" ").length,
          0,
        ),
      }),
    );
  }
} else {
  try {
    const { puzzles } = await import("cubing/puzzles"),
      { Alg } = await import("cubing/alg"),
      search = await import("cubing/search"),
      require = createRequire(import.meta.url),
      core = require("@cubers/core");
    const version = JSON.parse(
      readFileSync(
        new URL(
          "../../../../package.json",
          import.meta.resolve("cubing/scramble"),
        ),
        "utf8",
      ),
    ).version;
    if (version !== "0.66.1")
      throw Error("Review a generator version change explicitly");
    search.setSearchDebug({ logPerf: false, scramblePrefetchLevel: "none" });
    const entries = [];
    for (const entry of workerData) {
      const puzzle =
          await puzzles[entry.puzzle === "2x2" ? "2x2x2" : "3x3x3"].kpuzzle(),
        pattern = puzzle
          .defaultPattern()
          .applyAlg(new Alg(entry.algorithm).invert()),
        solution =
          entry.puzzle === "2x2"
            ? await search.experimentalSolve2x2x2(pattern)
            : await search.experimentalSolve3x3x3IgnoringCenters(pattern),
        moves = solution
          .toString()
          .trim()
          .split(/\s+/)
          .map((move) => move.replace(/2'$/, "2"));
      if (moves.some((move) => !/^[URFDLB](?:2|')?$/.test(move)))
        throw Error("Unsupported solver notation");
      const setup = core.practiceSetup(entry.puzzle, entry.algorithm),
        algorithm = moves.join(" ");
      if (
        core.practiceKey(setup) !== entry.representative ||
        core.practiceKey(core.practiceSetup(entry.puzzle, algorithm)) !==
          entry.representative ||
        core.practiceKey(core.practiceApply(setup, moves)) !==
          core.practiceKey(core.solvedPuzzle(entry.puzzle))
      )
        throw Error("Independent facelet verification failed");
      if (moves.length < entry.algorithm.split(" ").length)
        entries.push({
          lessonId: entry.id,
          family: entry.family,
          puzzle: entry.puzzle,
          baselineAlgorithm: entry.algorithm,
          algorithm,
        });
      parentPort.postMessage({ type: "progress", id: entry.id });
    }
    parentPort.postMessage({ type: "result", entries });
  } catch {
    parentPort.postMessage({ type: "error" });
  }
}
