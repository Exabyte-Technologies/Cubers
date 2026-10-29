import { test, after } from "node:test";
import assert from "node:assert/strict";
import { OcspVerifier, ocspRequest } from "../apps/api/src/attestation/ocsp";
import { ocspFixture } from "./helpers/ocsp-fixture";
import { receiptOpenSsl } from "./helpers/apple-receipt-fixture";

const f = ocspFixture();
after(() => f.close());
const verifier = (clock = () => Date.now()) =>
  new OcspVerifier(f.root, receiptOpenSsl, clock);
const verify = (bytes: Buffer, v = verifier()) =>
  v.verify(f.certificate, f.issuer, [f.root], bytes);

test("OCSP request matches the independent OpenSSL nonce-free certificate request", () => {
  assert.deepEqual(ocspRequest(f.certificate, f.issuer), f.request);
});
test("OCSP checks a real authorized signature and binds signed good/revoked/unknown states", async () => {
  for (const status of ["good", "revoked", "unknown"] as const) {
    const value = await verify(f.response({ status }));
    assert.equal(value.status, status);
    assert.ok(value.validUntil > Date.now());
  }
});
test("OCSP rejects valid-chain signatures from an unauthorized receipt signer", async () => {
  await assert.rejects(verify(f.response({ unauthorized: true })), {
    code: "certificate-status-signature",
  });
});
test("OCSP delegated responders require dedicated signing authority and an explicit issuer lifetime policy", async () => {
  assert.equal(
    (await verify(f.response({ delegated: "nocheck" }))).status,
    "good",
  );
  await assert.rejects(verify(f.response({ delegated: "unreviewed" })), {
    code: "certificate-status-responder-policy",
  });
});
test("OCSP rejects tampering, another certificate and another pinned root", async () => {
  const changed = Buffer.from(f.response());
  changed[changed.length - 5] ^= 1;
  await assert.rejects(verify(changed));
  await assert.rejects(
    verifier().verify(f.issuer, f.root, [f.root], f.response()),
    { code: "certificate-status-id" },
  );
  const other = ocspFixture();
  try {
    await assert.rejects(
      new OcspVerifier(other.root, receiptOpenSsl).verify(
        f.certificate,
        f.issuer,
        [f.root],
        f.response(),
      ),
      { code: "certificate-status-signature" },
    );
  } finally {
    other.close();
  }
});
test("OCSP rejects stale, future, expired, contradictory and weakly signed statuses", async () => {
  for (const options of [
    { thisUpdate: f.now + 60000, producedAt: f.now + 60000 },
    { thisUpdate: f.now - 2 * 86400000, producedAt: f.now - 2 * 86400000 },
    { nextUpdate: f.now - 1000 },
    { thisUpdate: f.now, producedAt: f.now - 60000 },
    { thisUpdate: f.now - 900000, producedAt: f.now - 1000, nextUpdate: null },
    { duplicate: true },
    { criticalExtension: true },
    { weak: true },
  ])
    await assert.rejects(verify(f.response(options)));
});
test("OCSP accepts a fresh status without nextUpdate only for a bounded ten-minute window", async () => {
  const value = await verify(f.response({ nextUpdate: null }));
  assert.equal(value.nextUpdate, null);
  assert.ok(value.validUntil <= f.now + 600000);
});
test("OCSP refuses trailing bytes and oversized responses before external verification", async () => {
  await assert.rejects(verify(Buffer.concat([f.response(), Buffer.from([0])])));
  await assert.rejects(verify(Buffer.alloc(32769)), {
    code: "certificate-status-format",
  });
});
test("OCSP rechecks status freshness after the external verifier completes", async () => {
  let calls = 0;
  await assert.rejects(
    verify(
      f.response(),
      verifier(() => (++calls < 3 ? f.now : f.now + 120000)),
    ),
    { code: "certificate-status-time" },
  );
});
