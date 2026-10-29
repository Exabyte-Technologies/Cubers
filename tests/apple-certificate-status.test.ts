import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  AppleCertificateStatus,
  appleOcspEndpoint,
  appleOcspUrl,
  resolveAppleOcsp,
} from "../apps/api/src/attestation/apple-certificate-status";
import { ocspFixture } from "./helpers/ocsp-fixture";
import { receiptOpenSsl } from "./helpers/apple-receipt-fixture";

const f = ocspFixture(true);
after(() => f.close());
function reply(
  body: Buffer,
  status: "good" | "revoked" | "unknown" = "good",
  now = Date.now(),
) {
  const issuerStatus = body.equals(f.issuerRequest);
  assert.ok(issuerStatus || body.equals(f.request));
  return f.response({
    issuerStatus,
    status,
    producedAt: now - 1000,
    thisUpdate: now - 1000,
    nextUpdate: now + 60000,
  });
}
test("Apple OCSP endpoints come from exactly one signed AIA and remain fixed to the public vendor host", () => {
  assert.equal(
    appleOcspUrl(f.certificate).href,
    "http://ocsp.apple.com/ocsp03-aaica5g101",
  );
  assert.throws(() => appleOcspUrl(f.root));
  for (const uri of [
    "http://127.0.0.1/x",
    "http://ocsp.apple.com.attacker.invalid/ocsp03-x",
    "http://user@ocsp.apple.com/ocsp03-x",
    "http://ocsp.apple.com:8080/ocsp03-x",
    "http://ocsp.apple.com/ocsp03-x?q=1",
    "http://ocsp.apple.com/ocsp03-x#x",
    "http://ocsp.apple.com/%2e%2e/x",
    "ftp://ocsp.apple.com/ocsp03-x",
  ])
    assert.throws(() => appleOcspEndpoint(uri));
});
test("Apple OCSP DNS rejects private, mapped and mixed address sets", async () => {
  const url = appleOcspEndpoint("http://ocsp.apple.com/ocsp03-aaica5g101"),
    signal = new AbortController().signal;
  for (const addresses of [
    [],
    [{ address: "127.0.0.1", family: 4 }],
    [{ address: "::ffff:127.0.0.1", family: 6 }],
    [
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ],
  ])
    await assert.rejects(
      resolveAppleOcsp(url, signal, (async () => addresses) as any),
      { code: "certificate-status-address" },
    );
  assert.equal(
    (
      await resolveAppleOcsp(url, signal, (async () => [
        { address: "8.8.8.8", family: 4 },
      ]) as any)
    ).address,
    "8.8.8.8",
  );
});
test("Apple certificate status authenticates both chain members, reuses a shared cache and refuses expiry", async () => {
  let now = Date.now(),
    calls = 0;
  const checker = new AppleCertificateStatus(
    f.root,
    receiptOpenSsl,
    async (_url, body) => {
      calls++;
      return reply(body, "good", now);
    },
    () => now,
  );
  try {
    const until = await checker.ensure(f.encoded);
    assert.equal(calls, 2);
    assert.equal(checker.until(f.encoded), until);
    await checker.ensure(f.encoded);
    assert.equal(calls, 2);
    now += 61000;
    assert.throws(() => checker.until(f.encoded), {
      code: "certificate-status-untrusted",
    });
    await checker.ensure(f.encoded);
    assert.equal(calls, 4);
  } finally {
    checker.stop();
  }
});
test("signed revoked and unknown statuses never authorize a receipt", async () => {
  for (const status of ["revoked", "unknown"] as const) {
    const checker = new AppleCertificateStatus(
      f.root,
      receiptOpenSsl,
      async (_url, body) => reply(body, status),
    );
    try {
      await assert.rejects(checker.ensure(f.encoded), {
        code: "certificate-status-untrusted",
      });
      assert.throws(() => checker.until(f.encoded));
    } finally {
      checker.stop();
    }
  }
});
test("coalesced lookups survive one consumer cancellation without granting that consumer trust", async () => {
  let release!: () => void,
    calls = 0;
  const held = new Promise<void>((r) => (release = r)),
    controller = new AbortController();
  const checker = new AppleCertificateStatus(
    f.root,
    receiptOpenSsl,
    async (_url, body) => {
      calls++;
      if (calls === 1) await held;
      return reply(body);
    },
  );
  try {
    const cancelled = checker.ensure(f.encoded, controller.signal),
      other = checker.ensure(f.encoded);
    const rejected = assert.rejects(cancelled, {
      code: "certificate-status-cancelled",
    });
    await delay(5);
    controller.abort();
    await rejected;
    assert.equal(calls, 1);
    release();
    await other;
    assert.equal(calls, 2);
  } finally {
    release();
    checker.stop();
  }
});
test("status retrieval has a bounded deadline even when a transport ignores cancellation", async () => {
  let release!: (body: Buffer) => void,
    calls = 0;
  const held = new Promise<Buffer>((r) => (release = r)),
    checker = new AppleCertificateStatus(f.root, receiptOpenSsl, async () => {
      calls++;
      return held;
    });
  try {
    const rejected = assert.rejects(checker.ensure(f.encoded), {
      code: "certificate-status-timeout",
    });
    await delay(5200);
    await rejected;
    await assert.rejects(checker.ensure(f.encoded), {
      code: "certificate-status-timeout",
    });
    assert.equal(calls, 1);
  } finally {
    checker.stop();
    release(Buffer.alloc(0));
    await delay(5);
  }
});
test("missing metadata and stopped services fail closed", async () => {
  const checker = new AppleCertificateStatus(
    f.root,
    receiptOpenSsl,
    async (_url, body) => reply(body),
  );
  await assert.rejects(checker.ensure([]), {
    code: "certificate-status-chain",
  });
  checker.stop();
  await assert.rejects(checker.ensure(f.encoded), {
    code: "certificate-status-cancelled",
  });
});
