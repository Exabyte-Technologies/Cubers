import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  AppVerificationClient,
  VerificationError,
  type VerificationNative,
  type VerificationContext,
} from "../apps/mobile/src/verification/client";
const keyView = () => ({
  id: randomUUID(),
  provider: "apple-app-attest",
  version: 0,
  status: "ACTIVE",
  enrolledBundleVersion: "1",
  bundleVersion: "1",
  distribution: "app-store",
  createdAt: new Date().toISOString(),
  lastVerifiedAt: new Date().toISOString(),
  receiptExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  rankingEligible: false,
});
function fixture(timeout = 20000) {
  const stored = new Map<string, string>(),
    calls: { path: string; body?: any; method?: string }[] = [],
    signed: string[] = [],
    keys: any[] = [],
    challenges = new Map<string, any>();
  let generate = 0,
    attest = 0,
    available = true,
    verifyFailure: ((body: any) => void) | undefined;
  const native: VerificationNative = {
    supported: () => true,
    generate: async () => {
      generate++;
      return Buffer.alloc(32, generate).toString("base64");
    },
    attest: async (_key, data) => {
      attest++;
      signed.push(data);
      return "synthetic-attestation";
    },
    assert: async (_key, data) => {
      signed.push(data);
      return "synthetic-assertion";
    },
  };
  const api = async (
    path: string,
    body?: any,
    method?: string,
  ): Promise<any> => {
    calls.push({ path, body, method });
    if (path === "me/app-attestation")
      return {
        providers: [
          { provider: "apple-app-attest", platform: "ios", available },
          { provider: "google-play", platform: "android", available: false },
        ],
        rankingEnabled: false,
        keys: [...keys],
      };
    if (path.endsWith("/challenges")) {
      if (body.kind === "enroll" && keys.some((k) => k.status === "ACTIVE"))
        return {
          kind: "enroll",
          alreadyEnrolled: keys.find((k) => k.status === "ACTIVE"),
          rankingEligible: false,
        };
      const c = {
        id: randomUUID(),
        clientData: "a".repeat(43) + "." + "b".repeat(64),
        encoding: "utf8",
        expiresAt: new Date(Date.now() + 120000).toISOString(),
        ...body,
      };
      challenges.set(c.id, c);
      return c;
    }
    if (path.endsWith("/verify")) {
      verifyFailure?.(body);
      const c = challenges.get(body.challengeId);
      assert.ok(c);
      if (body.kind === "enroll") {
        if (keys.some((k) => k.status === "ACTIVE"))
          throw Object.assign(Error("Consumed"), { status: 409 });
        const key = keyView();
        keys.push(key);
        return { key, rankingEligible: false };
      }
      return {
        grantId: randomUUID(),
        attemptId: c.attemptId,
        operation: c.operation,
        expiresAt: new Date(Date.now() + 30000).toISOString(),
        rankingEligible: false,
      };
    }
    if (method === "DELETE") {
      const key = keys.find((k) => path.endsWith(k.id));
      assert.ok(key);
      key.status = "REVOKED";
      key.version++;
      return key;
    }
    if (path.startsWith("attempts/")) return { ok: true };
    throw Error("Unexpected synthetic request");
  };
  const client = new AppVerificationClient(
    native,
    {
      read: async (k) => stored.get(k) ?? null,
      write: async (k, v) => {
        if (v === null) stored.delete(k);
        else stored.set(k, v);
      },
    },
    timeout,
  );
  const context: VerificationContext = {
    ownerId: randomUUID(),
    region: "INTL",
    token: "synthetic-session",
    canLearn: true,
    api,
  };
  client.setContext(context);
  return {
    client,
    native,
    context,
    calls,
    stored,
    signed,
    keys,
    challenges,
    counts: () => ({ generate, attest }),
    available: (value: boolean) => {
      available = value;
    },
    failVerify: (fn?: typeof verifyFailure) => {
      verifyFailure = fn;
    },
  };
}
const rejects = (work: () => Promise<unknown>, code: string) =>
  assert.rejects(
    work,
    (e: any) => e instanceof VerificationError && e.code === code,
  );
test("verification client checks availability and explicit enrollment before generating hardware keys", async () => {
  const f = fixture();
  f.available(false);
  await rejects(() => f.client.enroll(), "UNAVAILABLE");
  assert.deepEqual(f.counts(), { generate: 0, attest: 0 });
  f.available(true);
  await rejects(
    () => f.client.perform(randomUUID(), "inspect", { nonce: "n" }),
    "SETUP",
  );
  assert.equal(f.counts().generate, 0);
  f.client.setContext({ ...f.context, canLearn: false });
  await rejects(() => f.client.enroll(), "CONSENT");
  assert.equal(f.counts().generate, 0);
});
test("verification client enrolls one account key and signs exact UTF-8 server data for an action", async () => {
  const f = fixture(),
    id = await f.client.enroll();
  assert.equal(id, f.keys[0].id);
  await f.client.enroll();
  assert.deepEqual(f.counts(), { generate: 1, attest: 1 });
  const attemptId = randomUUID();
  await f.client.perform(attemptId, "inspect", { nonce: "synthetic-nonce" });
  const nativeChallenges = [...f.challenges.values()];
  assert.deepEqual(
    f.signed,
    nativeChallenges.map((c) => c.clientData),
  );
  const action = f.calls.find(
    (c) => c.path === `attempts/${attemptId}/inspect`,
  )!;
  assert.equal(action.body.nonce, "synthetic-nonce");
  assert.match(action.body.appProofId, /^[a-f0-9-]{36}$/);
  const local = [...f.stored.values()].join("");
  assert.equal(local.includes("synthetic-session"), false);
  assert.equal(local.includes("synthetic-attestation"), false);
  assert.equal(local.includes("clientData"), false);
});
test("verification client retains a timed-out hardware slot until it settles and isolates the next account", async () => {
  const f = fixture(35);
  let release!: (key: string) => void, entered!: () => void;
  const arrived = new Promise<void>((r) => {
    entered = r;
  });
  let nativeCalls = 0;
  f.native.generate = async () => {
    nativeCalls++;
    if (nativeCalls === 1) {
      entered();
      return new Promise<string>((r) => {
        release = r;
      });
    }
    return Buffer.alloc(32, 2).toString("base64");
  };
  const old = f.client.enroll();
  const checked = rejects(() => old, "CANCELLED");
  await arrived;
  await checked;
  f.client.setContext({
    ...f.context,
    ownerId: randomUUID(),
    token: "next-account",
  });
  const next = f.client.enroll();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(nativeCalls, 1);
  release(Buffer.alloc(32, 1).toString("base64"));
  await next;
  assert.equal(nativeCalls, 2);
  assert.equal(
    [...f.stored.keys()].some((k) => k.includes(f.context.ownerId)),
    false,
  );
});
test("verification client suppresses assertions and action submission after backgrounding or leaving a view", async () => {
  const f = fixture();
  await f.client.enroll();
  for (const cancel of [
    () => {
      f.client.setActive(false);
      f.client.setActive(true);
    },
    () => f.client.cancel(),
  ]) {
    let release!: (v: string) => void, entered!: () => void;
    const arrived = new Promise<void>((r) => {
      entered = r;
    });
    f.native.assert = async () => {
      entered();
      return new Promise((r) => {
        release = r;
      });
    };
    const before = f.calls.filter((c) => c.path.startsWith("attempts/")).length;
    const action = f.client.perform(randomUUID(), "inspect", { nonce: "n" });
    const checked = rejects(() => action, "CANCELLED");
    await arrived;
    cancel();
    release("late");
    await checked;
    assert.equal(
      f.calls.filter((c) => c.path.startsWith("attempts/")).length,
      before,
    );
  }
});
test("verification client retries a pending enrollment without another native attestation", async () => {
  const f = fixture();
  let first = true;
  f.failVerify((body) => {
    if (body.kind === "enroll" && first) {
      first = false;
      throw Object.assign(Error("Busy"), { status: 503 });
    }
  });
  await assert.rejects(() => f.client.enroll());
  await f.client.enroll();
  assert.deepEqual(f.counts(), { generate: 1, attest: 1 });
  assert.equal(f.calls.filter((c) => c.path.endsWith("/challenges")).length, 1);
});
test("verification client recovers a lost successful enrollment response by current key ownership", async () => {
  const f = fixture();
  let first = true;
  f.failVerify((body) => {
    if (body.kind === "enroll" && first) {
      first = false;
      f.keys.push(keyView());
      throw Error("Synthetic lost reply");
    }
  });
  await assert.rejects(() => f.client.enroll());
  const recovered = await f.client.enroll();
  assert.equal(recovered, f.keys[0].id);
  assert.equal(f.counts().attest, 1);
});
test("verification client supports revocation after consent withdrawal and requires deliberate recovery for stale keys", async () => {
  const f = fixture(),
    id = await f.client.enroll();
  f.keys[0].status = "EXPIRED";
  await rejects(() => f.client.enroll(), "RECOVERY");
  assert.equal(f.counts().generate, 1);
  f.client.setContext({ ...f.context, canLearn: false });
  assert.equal((await f.client.catalogue()).keys.length, 1);
  await f.client.revoke(id, 0);
  assert.equal(f.stored.size, 0);
  assert.equal(f.keys[0].status, "REVOKED");
  f.client.setContext(f.context);
  await f.client.enroll();
  assert.equal(f.counts().generate, 2);
  f.client.setContext(null);
  await f.client.eraseLocal(f.context.ownerId, f.context.region);
  assert.equal(f.stored.size, 0);
});
