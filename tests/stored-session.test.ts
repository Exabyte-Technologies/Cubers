import test from "node:test";
import assert from "node:assert/strict";
import {
  readStoredSession,
  SessionStorageUnavailable,
} from "../apps/mobile/src/stored-session";

const values = new Map([
  ["cubers-locale", "zh"],
  ["cubers-region", "CN"],
  ["cubers-token-CN", "synthetic-cn-session"],
  ["cubers-token-INTL", "different-international-session"],
]);

test("restoration reads only the saved account's community and does not fall back to another token", async () => {
  const keys: string[] = [];
  const result = await readStoredSession(async (key) => {
    keys.push(key);
    return values.get(key) ?? null;
  });
  assert.deepEqual(result, {
    locale: "zh",
    region: "CN",
    token: "synthetic-cn-session",
  });
  assert.deepEqual(keys, ["cubers-locale", "cubers-region", "cubers-token-CN"]);
  const missing = new Map(values);
  missing.delete("cubers-token-CN");
  assert.equal(
    (await readStoredSession(async (key) => missing.get(key) ?? null)).token,
    null,
  );
});

test("a rejected key read fails closed without clearing stored credentials and a later retry restores them", async () => {
  for (const deniedKey of [
    "cubers-locale",
    "cubers-region",
    "cubers-token-CN",
  ]) {
    const retained = new Map(values);
    const keys: string[] = [];
    await assert.rejects(
      readStoredSession(async (key) => {
        keys.push(key);
        if (key === deniedKey)
          throw new Error(
            "Synthetic native entitlement error with private details",
          );
        return retained.get(key) ?? null;
      }),
      (error: Error) =>
        error instanceof SessionStorageUnavailable &&
        !error.message.includes("private details"),
    );
    assert.equal(keys.at(-1), deniedKey);
    assert.deepEqual(retained, values);
    assert.equal(
      (await readStoredSession(async (key) => retained.get(key) ?? null)).token,
      "synthetic-cn-session",
    );
  }
});

test("a hanging storage operation has a bounded deadline and late completion cannot read or restore another key", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let resolveRead!: (value: string) => void;
  const keys: string[] = [];
  const pending = readStoredSession((key) => {
    keys.push(key);
    return new Promise<string>((resolve) => {
      resolveRead = resolve;
    });
  });
  const rejected = assert.rejects(pending, SessionStorageUnavailable);
  t.mock.timers.tick(7999);
  assert.deepEqual(keys, ["cubers-locale"]);
  t.mock.timers.tick(1);
  await rejected;
  resolveRead("zh");
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.deepEqual(keys, ["cubers-locale"]);
  assert.equal(
    (await readStoredSession(async (key) => values.get(key) ?? null)).token,
    "synthetic-cn-session",
  );
});

test("fresh storage remains a normal signed-out snapshot with no invented account or language", async () => {
  assert.deepEqual(await readStoredSession(async () => null), {
    locale: undefined,
    region: "INTL",
    token: null,
  });
});
