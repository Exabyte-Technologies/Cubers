import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PlayVerificationClient } from "../apps/mobile/src/verification/play-client";
import {
  VerificationError,
  type VerificationContext,
} from "../apps/mobile/src/verification/client";
const digest = (s: string) =>
  createHash("sha256").update(s).digest("base64url");
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (e: any) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};
const turn = () => new Promise((resolve) => setTimeout(resolve, 5));
function setup(timeout = 500) {
  const calls: { path: string; body: any; method?: string }[] = [];
  let prepares = 0,
    tokens = 0,
    available = true;
  const id = randomUUID(),
    clientData =
      Buffer.alloc(32, 9).toString("base64url") + "." + "a".repeat(64);
  const native = {
    supported: () => true,
    prepare: async (_: string) => {
      prepares++;
    },
    request: async (_: string) => {
      tokens++;
      return "synthetic-integrity-token";
    },
    hash: async (input: string) => digest(input),
  };
  const client = new PlayVerificationClient(native, timeout);
  const ctx: VerificationContext = {
    ownerId: randomUUID(),
    region: "INTL",
    token: "synthetic-user-session",
    canLearn: true,
    api: async (path, body: any, method) => {
      calls.push({ path, body, method });
      if (path === "me/app-attestation")
        return {
          providers: [
            {
              provider: "google-play",
              platform: "android",
              available,
              ...(available ? { cloudProjectNumber: "123456789012" } : {}),
            },
          ],
          rankingEnabled: false,
          keys: [],
        } as any;
      if (path.endsWith("/challenges"))
        return {
          kind: "play-action",
          id,
          clientData,
          encoding: "utf8",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          requestHash: digest(clientData),
          cloudProjectNumber: "123456789012",
        } as any;
      if (path.endsWith("/verify")) {
        const action = calls.findLast((c) => c.path.endsWith("/challenges"))!;
        return {
          grantId: randomUUID(),
          attemptId: action.body.attemptId,
          operation: action.body.operation,
          expiresAt: new Date(Date.now() + 30000).toISOString(),
          rankingEligible: false,
        } as any;
      }
      return { saved: true } as any;
    },
  };
  client.setContext(ctx);
  return {
    client,
    native,
    ctx,
    calls,
    counters: () => ({ prepares, tokens }),
    available: (value: boolean) => {
      available = value;
    },
  };
}
const refused = (code: string) => (error: any) =>
  error instanceof VerificationError && error.code === code;
test("Android verification requires explicit preparation and never prepares unavailable or unconsented accounts", async () => {
  const f = setup(),
    id = randomUUID();
  await assert.rejects(
    f.client.perform(id, "inspect", { nonce: "n" }),
    refused("SETUP"),
  );
  f.available(false);
  await assert.rejects(f.client.enroll(), refused("UNAVAILABLE"));
  f.available(true);
  f.client.setContext({ ...f.ctx, canLearn: false });
  await assert.rejects(f.client.enroll(), refused("CONSENT"));
  assert.deepEqual(f.counters(), { prepares: 0, tokens: 0 });
});
test("Android verification signs the exact request hash and binds the resulting grant to its action", async () => {
  const f = setup(),
    id = randomUUID();
  await f.client.enroll();
  await f.client.perform(id, "start", { nonce: "n", recordingStarted: false });
  const verified = f.calls.find((c) => c.path.endsWith("/verify"))!;
  assert.equal(verified.body.kind, "play-action");
  assert.equal(verified.body.integrityToken, "synthetic-integrity-token");
  const saved = f.calls.find((c) => c.path.startsWith("attempts/"))!;
  assert.equal(saved.path, `attempts/${id}/start`);
  assert.equal(saved.body.recordingStarted, false);
  assert.ok(saved.body.appProofId);
  assert.deepEqual(f.counters(), { prepares: 1, tokens: 1 });
});
test("Android warmup timeout retains the actual SDK slot and isolates an account change", async () => {
  const f = setup(30),
    pending = deferred<void>();
  let calls = 0;
  f.native.prepare = async () => {
    calls++;
    if (calls === 1) await pending.promise;
  };
  await assert.rejects(f.client.enroll(), refused("CANCELLED"));
  f.client.setContext({
    ...f.ctx,
    ownerId: randomUUID(),
    token: "other-session",
  });
  const next = f.client.enroll();
  await turn();
  assert.equal(calls, 1);
  pending.resolve();
  await next;
  assert.equal(calls, 2);
});
test("Android background and navigation cancellation prevent late tokens from reaching the server", async () => {
  for (const background of [true, false]) {
    const f = setup(),
      token = deferred<string>();
    await f.client.enroll();
    f.native.request = () => token.promise;
    const action = f.client.perform(randomUUID(), "inspect", { nonce: "n" });
    await turn();
    if (background) f.client.setActive(false);
    else f.client.cancel();
    token.resolve("late-synthetic-token");
    await assert.rejects(action, refused("CANCELLED"));
    assert.equal(f.calls.filter((c) => c.path.endsWith("/verify")).length, 0);
  }
});
test("Android reset bypasses a stalled SDK request and remains available after consent withdrawal", async () => {
  const f = setup(),
    token = deferred<string>();
  await f.client.enroll();
  f.native.request = () => token.promise;
  const action = f.client.perform(randomUUID(), "record", { nonce: "n" });
  await turn();
  f.client.setContext({ ...f.ctx, canLearn: false });
  await f.client.reset();
  assert.ok(
    f.calls.some((c) => c.path.endsWith("/play") && c.method === "DELETE"),
  );
  token.resolve("late-synthetic-token");
  await assert.rejects(action, refused("CANCELLED"));
  assert.equal(f.calls.filter((c) => c.path.endsWith("/verify")).length, 0);
});
test("Android invalid providers require deliberate preparation and changed challenge hashes never reach Google", async () => {
  const f = setup();
  await f.client.enroll();
  f.native.request = async () => {
    throw { code: "ERR_APP_INTEGRITY_PROVIDER_INVALID" };
  };
  await assert.rejects(
    f.client.perform(randomUUID(), "inspect", { nonce: "n" }),
    refused("SETUP"),
  );
  await assert.rejects(
    f.client.perform(randomUUID(), "inspect", { nonce: "n" }),
    refused("SETUP"),
  );
  assert.equal(f.counters().prepares, 1);
  await f.client.enroll();
  f.native.hash = async () => "wrong";
  await assert.rejects(
    f.client.perform(randomUUID(), "inspect", { nonce: "n" }),
    refused("UNAVAILABLE"),
  );
  assert.equal(f.calls.filter((c) => c.path.endsWith("/verify")).length, 0);
});
