import { parentPort } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { randomScrambleForEvent } from "cubing/scramble";
import { setSearchDebug } from "cubing/search";
import { passesMinimumDistance } from "./wca-filter.mjs";

const entry = import.meta.resolve("cubing/scramble");
const version = JSON.parse(
  readFileSync(new URL("../../../../package.json", entry), "utf8"),
).version;
setSearchDebug({ logPerf: false, scramblePrefetchLevel: "none" });
parentPort.on("message", async ({ id, event, count }) => {
  try {
    if (
      !["222", "333", "444", "pyram"].includes(event) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 30
    )
      throw Error("Invalid generator job");
    const scrambles = [];
    for (let i = 0; i < count; i++) {
      let accepted = false;
      // Rejection sampling keeps the upstream random-state distribution within
      // the accepted distance range. Exhaustion fails closed, never random moves.
      for (let tries = 0; tries < 128; tries++) {
        const text = (await randomScrambleForEvent(event)).toString();
        if (await passesMinimumDistance(event, text)) {
          scrambles.push(text);
          accepted = true;
          break;
        }
      }
      if (!accepted) throw Error("Scramble filtering exhausted");
    }
    parentPort.postMessage({ id, version, scrambles });
  } catch {
    parentPort.postMessage({ id, error: true });
  }
});
