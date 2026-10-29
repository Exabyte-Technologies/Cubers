import { test } from "node:test";
import assert from "node:assert/strict";
import { orderedWriter } from "../apps/mobile/src/ordered-storage";
test("slow sign-out cleanup cannot overwrite a newer stored sign-in, and unrelated keys proceed", async () => {
  const values = new Map<string, string | null>();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const write = orderedWriter(async (key, value) => {
    if (key === "session" && value === null) await gate;
    values.set(key, value);
  });
  const logout = write("session", null),
    login = write("session", "new-session");
  await write("language", "zh");
  assert.equal(values.get("language"), "zh");
  assert.equal(values.has("session"), false);
  release();
  await Promise.all([logout, login]);
  assert.equal(values.get("session"), "new-session");
});
