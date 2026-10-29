import { test } from "node:test";
import assert from "node:assert/strict";
import { PlayIntegrityCrypto } from "../apps/api/src/attestation/google";
import { AttestationError } from "../apps/api/src/attestation/binary";
const now = Date.parse("2026-10-20T12:00:00Z"),
  hash = Buffer.alloc(32, 1).toString("base64url"),
  cert = Buffer.alloc(32, 2).toString("base64url");
const policy = {
  packageName: "app.cubers.mobile",
  certificateDigests: [cert],
  versionCodes: ["42"],
};
const context = {
  requestHash: hash,
  issuedAt: now - 5000,
  expiresAt: now + 30000,
};
const token = "synthetic-google-integrity-token",
  bearer = "synthetic-server-access-token";
const payload = () => ({
  tokenPayloadExternal: {
    requestDetails: {
      requestPackageName: policy.packageName,
      requestHash: hash,
      timestampMillis: String(now - 1000),
    },
    accountDetails: { appLicensingVerdict: "LICENSED" },
    appIntegrity: {
      appRecognitionVerdict: "PLAY_RECOGNIZED",
      packageName: policy.packageName,
      certificateSha256Digest: [cert],
      versionCode: "42",
    },
    deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] },
  },
});
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
const refused = (operation: () => Promise<unknown>, code?: string) =>
  assert.rejects(
    operation,
    (e: any) =>
      e instanceof AttestationError &&
      (!code || e.code === code) &&
      !e.message.includes(token) &&
      !e.message.includes(bearer),
  );
const verifier = (value: unknown) =>
  new PlayIntegrityCrypto(
    policy,
    async () => bearer,
    (async () => response(value)) as typeof fetch,
    () => now,
  );

test("Play integrity verifies only server-decoded Google responses bound to the exact released app and request", async () => {
  let requests = 0;
  const crypto = new PlayIntegrityCrypto(
    policy,
    async (signal) => {
      assert.equal(signal.aborted, false);
      return bearer;
    },
    (async (url, init) => {
      requests++;
      assert.equal(
        url,
        "https://playintegrity.googleapis.com/v1/app.cubers.mobile:decodeIntegrityToken",
      );
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      assert.deepEqual(JSON.parse(init!.body as string), {
        integrity_token: token,
      });
      assert.equal((init!.headers as any).Authorization, "Bearer " + bearer);
      return response(payload());
    }) as typeof fetch,
    () => now,
  );
  const result = await crypto.verifyToken(token, context);
  assert.deepEqual(result, {
    provider: "google-play",
    packageName: policy.packageName,
    versionCode: "42",
    certificateDigests: [cert],
    verifiedAt: now,
  });
  assert.equal(requests, 1);
  assert.equal(JSON.stringify(result).includes(token), false);
  await refused(
    () => verifier(payload().tokenPayloadExternal).verifyToken(token, context),
    "verdict",
  );
});

test("Play integrity refuses changed request, time, signer, build, license, device and provider-test verdicts", async () => {
  const mutations: ((p: any) => void)[] = [
    (p) => (p.requestDetails.requestPackageName = "other.app"),
    (p) => (p.appIntegrity.packageName = "other.app"),
    (p) =>
      (p.requestDetails.requestHash = Buffer.alloc(32, 3).toString(
        "base64url",
      )),
    (p) => (p.requestDetails.timestampMillis = String(context.issuedAt - 1001)),
    (p) => (p.requestDetails.timestampMillis = String(now + 5001)),
    (p) => (p.requestDetails.timestampMillis = "9007199254740992"),
    (p) => (p.appIntegrity.certificateSha256Digest = [hash]),
    (p) => (p.appIntegrity.certificateSha256Digest = [cert, hash]),
    (p) => (p.appIntegrity.certificateSha256Digest = [cert, cert]),
    (p) => (p.appIntegrity.certificateSha256Digest = []),
    (p) => (p.appIntegrity.versionCode = "43"),
    (p) => (p.appIntegrity.versionCode = "042"),
    (p) => (p.appIntegrity.appRecognitionVerdict = "UNRECOGNIZED_VERSION"),
    (p) => (p.accountDetails.appLicensingVerdict = "UNLICENSED"),
    (p) =>
      (p.deviceIntegrity.deviceRecognitionVerdict = ["MEETS_BASIC_INTEGRITY"]),
    (p) =>
      (p.deviceIntegrity.deviceRecognitionVerdict = [
        "MEETS_VIRTUAL_INTEGRITY",
      ]),
    (p) => delete p.deviceIntegrity.deviceRecognitionVerdict,
    (p) => (p.testingDetails = { isTestingResponse: true }),
  ];
  for (const change of mutations) {
    const value = payload();
    change(value.tokenPayloadExternal);
    await refused(() => verifier(value).verifyToken(token, context));
  }
});

test("Play integrity rechecks expiry after provider work and snapshots its trusted policy", async () => {
  let clock = now,
    requests = 0;
  const configured = structuredClone(policy);
  const crypto = new PlayIntegrityCrypto(
    configured,
    async () => bearer,
    (async () => {
      requests++;
      return response(payload());
    }) as typeof fetch,
    () => clock,
  );
  configured.versionCodes.push("43");
  configured.certificateDigests.push(hash);
  configured.packageName = "other.app";
  assert.equal((await crypto.verifyToken(token, context)).versionCode, "42");
  clock = context.expiresAt;
  await refused(() => crypto.verifyToken(token, context), "challenge-expired");
  assert.equal(requests, 1);
  const late = new PlayIntegrityCrypto(
    policy,
    async () => bearer,
    (async () => {
      clock = context.expiresAt;
      return response(payload());
    }) as typeof fetch,
    () => clock,
  );
  clock = now;
  await refused(() => late.verifyToken(token, context), "challenge-expired");
});

test("Play integrity bounds provider responses and refuses redirects, failed HTTP, malformed data and transport errors", async () => {
  const cases: (() => Promise<Response>)[] = [
    async () =>
      new Response("{}", {
        status: 302,
        headers: { Location: "https://attacker.invalid/" },
      }),
    async () => new Response("{}", { status: 503 }),
    async () =>
      new Response("{}", { headers: { "Content-Type": "text/html" } }),
    async () =>
      new Response("{}", {
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "65537",
        },
      }),
    async () =>
      new Response(" ".repeat(65537), {
        headers: { "Content-Type": "application/json" },
      }),
    async () =>
      new Response("{", { headers: { "Content-Type": "application/json" } }),
    async () => {
      throw new Error(token + bearer);
    },
  ];
  for (const operation of cases) {
    const crypto = new PlayIntegrityCrypto(
      policy,
      async () => bearer,
      operation as typeof fetch,
      () => now,
    );
    await refused(() => crypto.verifyToken(token, context));
  }
  let fetched = false;
  const noCredentials = new PlayIntegrityCrypto(
    policy,
    async () => "bad\nheader",
    (async () => {
      fetched = true;
      return response(payload());
    }) as typeof fetch,
    () => now,
  );
  await refused(
    () => noCredentials.verifyToken(token, context),
    "provider-credentials",
  );
  assert.equal(fetched, false);
});

test("Play integrity bounds credential and decode waits and cancels timed-out transport", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  const stalled = new PlayIntegrityCrypto(
    policy,
    async (s) => {
      signal = s;
      return await new Promise(() => {});
    },
    undefined,
    () => now,
  );
  const failure = refused(
    () => stalled.verifyToken(token, context),
    "provider-timeout",
  );
  t.mock.timers.tick(8000);
  await failure;
  assert.equal(signal?.aborted, true);
  let transport: AbortSignal | undefined;
  const stalledDecode = new PlayIntegrityCrypto(
    policy,
    async () => bearer,
    (async (_, init) => {
      transport = init?.signal as AbortSignal;
      return await new Promise(() => {});
    }) as typeof fetch,
    () => now,
  );
  const decodeFailure = refused(
    () => stalledDecode.verifyToken(token, context),
    "provider-timeout",
  );
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(8000);
  await decodeFailure;
  assert.equal(transport?.aborted, true);
});
