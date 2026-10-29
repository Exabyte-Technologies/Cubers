import { parentPort } from "node:worker_threads";
import { GuidedPuzzle, guidedState, isPyraminx } from "@cubers/core";
import { planFirstSolve } from "./first-solve-planner";
import { planPyraminxFirstSolve } from "./pyraminx-first-solve-planner";
import { planFourFirstSolve } from "./four-first-solve-planner";
parentPort?.on("message", ({ id, puzzle, faces }) => {
  try {
    const state = guidedState(GuidedPuzzle.parse(puzzle), faces);
    parentPort!.postMessage({
      id,
      plan: isPyraminx(state)
        ? planPyraminxFirstSolve(state)
        : state.size === 4
          ? planFourFirstSolve(state)
          : planFirstSolve(state),
    });
  } catch {
    parentPort!.postMessage({ id, error: true });
  }
});
