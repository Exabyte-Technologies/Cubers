import { parentPort } from "node:worker_threads";
import { validatedReplay } from "@cubers/core";
parentPort?.on("message", ({ id, source }) => {
  try {
    parentPort!.postMessage({ id, packet: validatedReplay(source) });
  } catch {
    parentPort!.postMessage({ id, invalid: true });
  }
});
