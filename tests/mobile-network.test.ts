import { test } from "node:test";
import assert from "node:assert/strict";
import { withTimeout } from "../apps/mobile/src/timeout";
test("native-compatible timeout cancels stalled requests without AbortSignal.timeout", async () => {
  const original = AbortSignal.timeout;
  Object.defineProperty(AbortSignal, "timeout", {
    value: undefined,
    configurable: true,
  });
  try {
    await assert.rejects(
      () =>
        withTimeout(
          (signal) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => reject(new Error("Timed out")),
                { once: true },
              );
            }),
          10,
        ),
      /Timed out/,
    );
  } finally {
    Object.defineProperty(AbortSignal, "timeout", {
      value: original,
      configurable: true,
    });
  }
});
test("completed requests release their timeout and keep the signal usable", async () => {
  let signal!: AbortSignal;
  const result = await withTimeout(async (value) => {
    signal = value;
    return "saved";
  }, 10);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(result, "saved");
  assert.equal(signal.aborted, false);
});
