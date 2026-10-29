import { test, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify, createHash } from "node:crypto";
import {
  mkdtemp,
  realpath,
  writeFile,
  chmod,
  symlink,
  link,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAppleReceiptCredential } from "../apps/api/src/attestation/apple-credentials";
import {
  AppleReceiptExchange,
  type StoredAppleReceipt,
} from "../apps/api/src/attestation/apple-exchange";
import { AppleReceiptVerifier } from "../apps/api/src/attestation/apple-receipt";
import { AttestationError } from "../apps/api/src/attestation/binary";
import {
  receiptFixture,
  receiptOpenSsl,
} from "./helpers/apple-receipt-fixture";
const f = receiptFixture();
after(() => f.close());
const teamId = f.appId.split(".")[0],
  keyId = "ABCDEFGHIJ";
const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const credentialValue = {
  version: 1,
  teamId,
  keyId,
  privateKey: pair.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
};
const policy = { appId: f.appId, environment: "production" as const };
const verifier = new AppleReceiptVerifier(
  policy,
  f.root,
  receiptOpenSsl,
  () => f.now,
);
async function credential() {
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), "cubers-apple-auth-")),
  );
  const file = join(dir, "credential.json");
  await writeFile(file, JSON.stringify(credentialValue), { mode: 0o600 });
  const value = await loadAppleReceiptCredential(file, teamId);
  return {
    value,
    async close() {
      value.destroy();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
async function previous(): Promise<StoredAppleReceipt> {
  const fields = f
    .fields()
    .map(
      ([id, value]) =>
        [
          id,
          id === 12 ? Buffer.from(new Date(f.now - 1000).toISOString()) : value,
        ] as [number, Buffer],
    );
  const receiptBase64 = f.sign(fields);
  return {
    receiptBase64,
    publicKeyPem: f.leaf.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    receipt: await verifier.verify(receiptBase64, f.leaf.publicKey, "ATTEST"),
  };
}
const refuses = (operation: () => Promise<unknown>, code?: string) =>
  assert.rejects(
    operation,
    (error: unknown) =>
      error instanceof AttestationError &&
      (!code || error.code === code) &&
      !error.message.includes(credentialValue.privateKey),
  );

test("private Apple credentials produce independently verifiable ES256 APNs-shaped JWTs and stop after destruction", async () => {
  const c = await credential();
  try {
    const token = c.value.token(f.now),
      parts = token.split(".");
    assert.equal(parts.length, 3);
    assert.deepEqual(
      JSON.parse(Buffer.from(parts[0], "base64url").toString()),
      { alg: "ES256", kid: keyId },
    );
    assert.deepEqual(
      JSON.parse(Buffer.from(parts[1], "base64url").toString()),
      { iss: teamId, iat: Math.floor(f.now / 1000) },
    );
    assert.equal(Buffer.from(parts[2], "base64url").length, 64);
    assert.ok(
      verify(
        "sha256",
        Buffer.from(parts[0] + "." + parts[1]),
        { key: pair.publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(parts[2], "base64url"),
      ),
    );
    assert.equal(
      c.value.fingerprint,
      createHash("sha256")
        .update(pair.publicKey.export({ type: "spki", format: "der" }))
        .digest("hex"),
    );
    assert.throws(() => c.value.token(NaN));
    c.value.destroy();
    c.value.destroy();
    assert.throws(() => c.value.token(f.now));
  } finally {
    await c.close();
  }
});

test("Apple credential loader refuses unsafe files, aliases, alternate algorithms and executable/endpoint fields", async () => {
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), "cubers-apple-files-")),
  );
  const file = join(dir, "credential.json");
  const valid = () =>
    writeFile(file, JSON.stringify(credentialValue), { mode: 0o600 });
  try {
    await valid();
    await chmod(file, 0o644);
    await assert.rejects(loadAppleReceiptCredential(file, teamId));
    await chmod(file, 0o600);
    await symlink(file, join(dir, "alias"));
    await assert.rejects(
      loadAppleReceiptCredential(join(dir, "alias"), teamId),
    );
    await link(file, join(dir, "hard"));
    await assert.rejects(loadAppleReceiptCredential(file, teamId));
    await rm(join(dir, "hard"));
    await assert.rejects(loadAppleReceiptCredential(dir, teamId));
    await assert.rejects(loadAppleReceiptCredential(file, "DIFFERENT0"));
    for (const bad of [
      { ...credentialValue, keyId: "wrong" },
      { ...credentialValue, teamId: "wrong" },
      { ...credentialValue, token_uri: "https://example.invalid" },
      { ...credentialValue, command: "not-executed" },
      {
        ...credentialValue,
        privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
          .privateKey.export({ type: "pkcs8", format: "pem" })
          .toString(),
      },
      {
        ...credentialValue,
        privateKey: generateKeyPairSync("ec", { namedCurve: "secp384r1" })
          .privateKey.export({ type: "pkcs8", format: "pem" })
          .toString(),
      },
      {
        ...credentialValue,
        privateKey: credentialValue.privateKey + credentialValue.privateKey,
      },
      {
        ...credentialValue,
        privateKey: pair.publicKey
          .export({ type: "spki", format: "pem" })
          .toString(),
      },
    ]) {
      await writeFile(file, JSON.stringify(bad));
      await assert.rejects(loadAppleReceiptCredential(file, teamId));
    }
    await writeFile(file, "x".repeat(16385));
    await assert.rejects(loadAppleReceiptCredential(file, teamId));
    const fifo = join(dir, "fifo");
    execFileSync("mkfifo", [fifo]);
    await assert.rejects(loadAppleReceiptCredential(fifo, teamId));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Apple exchange sends only the existing receipt to its fixed environment endpoint and independently validates the returned CMS", async () => {
  const c = await credential();
  try {
    const stored = await previous();
    const refreshed = f.sign(f.fields("RECEIPT"));
    let calls = 0;
    const client = new AppleReceiptExchange(
      policy,
      c.value,
      verifier,
      (async (url, init) => {
        calls++;
        assert.equal(
          url,
          "https://data.appattest.apple.com/v1/attestationData",
        );
        assert.equal(init?.method, "POST");
        assert.equal(init?.redirect, "error");
        assert.equal(init?.body, stored.receiptBase64);
        const headers = new Headers(init?.headers);
        const auth = headers.get("Authorization")!;
        assert.equal(auth.startsWith("Bearer "), false);
        assert.equal(auth.split(".").length, 3);
        assert.deepEqual([...headers.keys()].sort(), [
          "accept",
          "authorization",
          "content-type",
        ]);
        return new Response(refreshed + "\n", { status: 200 });
      }) as typeof fetch,
      () => f.now,
    );
    const result = await client.refresh(stored);
    assert.equal(calls, 1);
    assert.equal(result.kind, "refreshed");
    if (result.kind !== "refreshed") throw Error("Unexpected deferral");
    assert.equal(result.receiptBase64, refreshed);
    assert.equal(result.receipt.riskMetric, 3);
    assert.equal(
      result.receipt.publicKeySha256,
      stored.receipt.publicKeySha256,
    );
    assert.equal(stored.receipt.type, "ATTEST");
    client.stop();
    await refuses(() => client.refresh(stored), "receipt-service-cancelled");
    let developmentUrl: unknown;
    const dev = new AppleReceiptExchange(
      { ...policy, environment: "development" },
      c.value,
      verifier,
      (async (url) => {
        developmentUrl = url;
        return new Response(null, { status: 304 });
      }) as typeof fetch,
      () => f.now,
    );
    await dev.refresh({
      ...stored,
      receipt: { ...stored.receipt, environment: "development" },
    });
    assert.equal(
      developmentUrl,
      "https://data-development.appattest.apple.com/v1/attestationData",
    );
    dev.stop();
    assert.throws(
      () =>
        new AppleReceiptExchange(
          { ...policy, appId: "WRONGTEAM0.app.cubers.mobile" },
          c.value,
          verifier,
        ),
    );
  } finally {
    await c.close();
  }
});

test("Apple refresh windows and HTTP 304 defer without extending receipt trust; expiry and changed bindings make no request", async () => {
  const c = await credential();
  try {
    const stored = await previous();
    let calls = 0,
      now = f.now;
    const client = new AppleReceiptExchange(
      policy,
      c.value,
      verifier,
      (async () => {
        calls++;
        return new Response(null, { status: 304 });
      }) as typeof fetch,
      () => now,
    );
    const future = {
      ...stored,
      receipt: { ...stored.receipt, notBefore: now + 1000 },
    };
    assert.deepEqual(await client.refresh(future), {
      kind: "deferred",
      retryAt: now + 1000,
    });
    assert.equal(calls, 0);
    assert.deepEqual(await client.refresh(stored), {
      kind: "deferred",
      retryAt: now + 60000,
    });
    assert.equal(calls, 1);
    for (const receipt of [
      { ...stored.receipt, publicKeySha256: "0".repeat(64) },
      { ...stored.receipt, receiptSha256: "0".repeat(64) },
      { ...stored.receipt, appId: "OTHERTEAM0.app.cubers.mobile" },
    ])
      await refuses(
        () => client.refresh({ ...stored, receipt }),
        "receipt-binding",
      );
    now = stored.receipt.expiresAt;
    await refuses(() => client.refresh(stored), "receipt-time");
    assert.equal(calls, 1);
    client.stop();
  } finally {
    await c.close();
  }
});

test("receipt exchange rejects redirects, provider errors, oversized/invalid bodies, unbound receipts and old signed replies without retries", async () => {
  const c = await credential();
  try {
    const stored = await previous();
    const wrongFields = f
      .fields("RECEIPT")
      .map(
        ([id, value]) =>
          [
            id,
            id === 2 ? Buffer.from("OTHERTEAM0.app.cubers.mobile") : value,
          ] as [number, Buffer],
      );
    const oldFields = f
      .fields("RECEIPT")
      .map(
        ([id, value]) =>
          [
            id,
            id === 12
              ? Buffer.from(new Date(stored.receipt.createdAt).toISOString())
              : value,
          ] as [number, Buffer],
      );
    const responses: (() => Response)[] = [
      ...[301, 302, 400, 401, 404, 429, 500, 503].map(
        (status) => () => new Response(null, { status }),
      ),
      () => new Response("AA==", { headers: { "content-length": "21851" } }),
      () => new Response("x".repeat(21851)),
      () => new Response("not-base64"),
      () => new Response(stored.receiptBase64),
      () => new Response(f.sign(wrongFields)),
      () => new Response(f.sign(oldFields)),
      () => {
        const r = new Response(f.sign(f.fields("RECEIPT")));
        Object.defineProperty(r, "redirected", { value: true });
        return r;
      },
      () => {
        const r = new Response(f.sign(f.fields("RECEIPT")));
        Object.defineProperty(r, "url", { value: "https://example.invalid" });
        return r;
      },
    ];
    for (const response of responses) {
      let calls = 0;
      const client = new AppleReceiptExchange(
        policy,
        c.value,
        verifier,
        (async () => {
          calls++;
          return response();
        }) as typeof fetch,
        () => f.now,
      );
      await refuses(() => client.refresh(stored));
      assert.equal(calls, 1);
      client.stop();
    }
  } finally {
    await c.close();
  }
});

test("cancelled or stalled receipt exchanges retain their bounded slots and discard late callbacks", async () => {
  const c = await credential();
  try {
    const stored = await previous();
    const releases: ((r: Response) => void)[] = [];
    const client = new AppleReceiptExchange(
      policy,
      c.value,
      verifier,
      (() =>
        new Promise<Response>((resolve) => {
          releases.push(resolve);
        })) as typeof fetch,
      () => f.now,
    );
    const a = new AbortController(),
      b = new AbortController();
    const pa = client.refresh(stored, a.signal);
    const pb = client.refresh(stored, b.signal);
    a.abort();
    b.abort();
    await refuses(() => pa, "receipt-service-cancelled");
    await refuses(() => pb, "receipt-service-cancelled");
    await refuses(() => client.refresh(stored), "receipt-service-busy");
    releases.forEach((resolve) =>
      resolve(new Response("sensitive-invalid-late-response")),
    );
    await new Promise((resolve) => setImmediate(resolve));
    const beforeAbort = new AbortController();
    beforeAbort.abort();
    await refuses(
      () => client.refresh(stored, beforeAbort.signal),
      "receipt-service-cancelled",
    );
    client.stop();
    await refuses(() => client.refresh(stored), "receipt-service-cancelled");
  } finally {
    await c.close();
  }
});

test(
  "receipt exchange enforces its real eight-second deadline even when transport ignores abort",
  { timeout: 20000 },
  async () => {
    const c = await credential();
    try {
      const stored = await previous();
      let release!: (r: Response) => void;
      let signal: AbortSignal | null | undefined;
      const client = new AppleReceiptExchange(
        policy,
        c.value,
        verifier,
        ((_, init) => {
          signal = init?.signal;
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }) as typeof fetch,
        () => f.now,
      );
      await refuses(() => client.refresh(stored), "receipt-service-timeout");
      assert.equal(signal?.aborted, true);
      release(new Response("invalid-late-response"));
      await new Promise((resolve) => setImmediate(resolve));
      client.stop();
    } finally {
      await c.close();
    }
  },
);

test("receipt-body cancellation discards partial streams before any CMS verifier receives them", async () => {
  const c = await credential();
  try {
    const stored = await previous();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let verifications = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    const client = new AppleReceiptExchange(
      policy,
      c.value,
      {
        verify: async (...args) => {
          verifications++;
          return verifier.verify(...args);
        },
      },
      (async () => new Response(stream)) as typeof fetch,
      () => f.now,
    );
    const stop = new AbortController(),
      job = client.refresh(stored, stop.signal);
    await new Promise((resolve) => setImmediate(resolve));
    stop.abort();
    await refuses(() => job, "receipt-service-cancelled");
    controller.enqueue(Buffer.from("invalid-late-body"));
    controller.close();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(verifications, 0);
    client.stop();
  } finally {
    await c.close();
  }
});

test("Apple receipt exchange requires separately enabled private credentials and an explicit nonblank operator risk policy", async () => {
  const { readConfig } = await import("../apps/api/src/config");
  const base = {
    NODE_ENV: "test",
    REGION: "INTL",
    DATABASE_URL: "postgresql://localhost/test",
    REDIS_URL: "redis://localhost:6389",
    S3_ENDPOINT: "http://localhost:9009",
    S3_BUCKET: "test",
    S3_ACCESS_KEY: "test",
    S3_SECRET_KEY: "test",
  };
  assert.equal(readConfig(base).APP_ATTESTATION_APPLE_RECEIPT_ENABLED, "false");
  const enabled = {
    ...base,
    APP_ATTESTATION_APPLE_ENABLED: "true",
    APP_ATTESTATION_APPLE_RECEIPT_ENABLED: "true",
    APP_ATTESTATION_APPLE_APP_ID: f.appId,
    APP_ATTESTATION_APPLE_BUILDS: "1",
    APP_ATTESTATION_RECEIPT_KEY_FILE: "/private/synthetic-storage.json",
    APP_ATTESTATION_APPLE_CREDENTIAL_FILE: "/private/synthetic-credential.json",
    APP_ATTESTATION_APPLE_RISK_MAX: "5",
  };
  assert.equal(readConfig(enabled).APP_ATTESTATION_APPLE_RISK_MAX, 5);
  for (const change of [
    { APP_ATTESTATION_APPLE_RISK_MAX: undefined },
    { APP_ATTESTATION_APPLE_RISK_MAX: "" },
    { APP_ATTESTATION_APPLE_RISK_MAX: "  " },
    { APP_ATTESTATION_APPLE_RISK_MAX: "-1" },
    { APP_ATTESTATION_APPLE_RISK_MAX: "1.5" },
    { APP_ATTESTATION_APPLE_RISK_MAX: "1000000000" },
    { APP_ATTESTATION_APPLE_ENABLED: "false" },
    { APP_ATTESTATION_APPLE_CREDENTIAL_FILE: undefined },
    { APP_ATTESTATION_APPLE_CREDENTIAL_FILE: "relative.json" },
  ])
    assert.throws(() => readConfig({ ...enabled, ...change }));
});
