import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  AppleAppAttestCrypto,
  appleAppAttestCrypto,
} from "../apps/api/src/attestation/apple";
import {
  AttestationError,
  cbor,
  cborMap,
  base64,
  derItems,
} from "../apps/api/src/attestation/binary";
import { appleFixture, encodeCbor } from "./helpers/app-attest-fixture";
const fixture = appleFixture();
after(() => fixture.close());
const policy = {
  appId: fixture.appId,
  distribution: "app-store" as const,
  bundleVersions: ["1"],
};
const verifier = new AppleAppAttestCrypto(policy, fixture.root);
const encoded = (object: any) => encodeCbor(object).toString("base64");
const rejects = (fn: () => unknown, code?: string) =>
  assert.throws(
    fn,
    (e: any) =>
      e instanceof AttestationError &&
      (!code || e.code === code) &&
      !e.message.includes("synthetic"),
  );

test("Apple's published fixture is parsed but its nonce is rejected under the documented challenge hash", () => {
  const published = JSON.parse(
    readFileSync("tests/helpers/apple-published-attestation.json", "utf8"),
  );
  const object = cborMap(cbor(base64(published.attestation)));
  const auth = object.get("authData") as Buffer;
  const hash = (b: Buffer) => createHash("sha256").update(b).digest();
  const challenge = Buffer.from(published.challenge);
  assert.equal(
    hash(Buffer.concat([auth, challenge])).toString("base64"),
    published.publishedNonce,
  );
  assert.notEqual(
    hash(Buffer.concat([auth, hash(challenge)])).toString("base64"),
    published.publishedNonce,
  );
  const crypto = appleAppAttestCrypto({
    appId: published.appId,
    distribution: "app-store",
    bundleVersions: ["1"],
  });
  // The genuine published certificate chain is evaluated within its validity,
  // without trusting an expired certificate or adding a raw-challenge fallback.
  rejects(
    () =>
      crypto.verifyKeyAttestation(
        published.attestation,
        published.keyId,
        challenge,
        Date.parse("2026-04-21T19:00:00Z"),
      ),
    "nonce",
  );
});

test("Apple key crypto validates dedicated chain, challenge, complete COSE key and launch properties without trusting its receipt", () => {
  const object = fixture.object();
  const result = verifier.verifyKeyAttestation(
    encoded(object),
    fixture.keyId,
    fixture.challenge,
  );
  assert.equal(result.counter, 0);
  assert.equal(result.bundleVersion, "1");
  assert.equal(result.distribution, "app-store");
  assert.equal(
    result.unverifiedReceipt,
    Buffer.from("synthetic-unverified-receipt").toString("base64"),
  );
  assert.deepEqual(
    createPublicKey(result.publicKeyPem).export({ format: "jwk" }),
    fixture.leaf.publicKey.export({ format: "jwk" }),
  );
  rejects(
    () =>
      appleAppAttestCrypto(policy).verifyKeyAttestation(
        encoded(object),
        fixture.keyId,
        fixture.challenge,
      ),
    "certificate-chain",
  );
  rejects(
    () =>
      verifier.verifyKeyAttestation(
        encoded(object),
        fixture.keyId,
        Buffer.alloc(32, 18),
      ),
    "nonce",
  );
  rejects(
    () =>
      verifier.verifyKeyAttestation(
        encoded(object),
        Buffer.alloc(32).toString("base64"),
        fixture.challenge,
      ),
    "key-id",
  );
  rejects(
    () =>
      verifier.verifyKeyAttestation(
        encoded(object),
        fixture.keyId,
        fixture.challenge,
        Date.now() + 4 * 86400000,
      ),
    "certificate-expired",
  );
  const statement = object.get("attStmt"),
    chain = statement.get("x5c");
  statement.set("x5c", [Buffer.concat([chain[0], Buffer.from([0])]), chain[1]]);
  rejects(
    () =>
      verifier.verifyKeyAttestation(
        encoded(object),
        fixture.keyId,
        fixture.challenge,
      ),
    "certificate-encoding",
  );
  statement.set("x5c", [chain[1], chain[0]]);
  rejects(
    () =>
      verifier.verifyKeyAttestation(
        encoded(object),
        fixture.keyId,
        fixture.challenge,
      ),
    "certificate-chain",
  );
});

test("Apple key crypto refuses changed application, environment, counter, credential, COSE coordinates and unknown critical extensions", () => {
  for (const [code, modify] of [
    [
      "app-id",
      (b: Buffer) => {
        b[0] ^= 1;
        return b;
      },
    ],
    [
      "authenticator",
      (b: Buffer) => {
        b[36] = 1;
        return b;
      },
    ],
    [
      "environment",
      (b: Buffer) => {
        b[37] ^= 1;
        return b;
      },
    ],
    [
      "key-id",
      (b: Buffer) => {
        b[55] ^= 1;
        return b;
      },
    ],
    [
      "cose-key",
      (b: Buffer) => {
        b[110] ^= 1;
        return b;
      },
    ],
  ] as const) {
    const object = fixture.object({ modify });
    rejects(
      () =>
        verifier.verifyKeyAttestation(
          encoded(object),
          fixture.keyId,
          fixture.challenge,
        ),
      code,
    );
  }
  const critical = fixture.object({
    extraCertificateExtension: "1.2.3.4=critical,DER:05:00\n",
  });
  rejects(
    () =>
      verifier.verifyKeyAttestation(
        encoded(critical),
        fixture.keyId,
        fixture.challenge,
      ),
    "certificate-critical-extension",
  );
  for (const category of [0, 1, 2, 3, 5, 10])
    rejects(
      () =>
        verifier.verifyKeyAttestation(
          encoded(fixture.object({ category })),
          fixture.keyId,
          fixture.challenge,
        ),
      "app-distribution",
    );
  rejects(
    () =>
      verifier.verifyKeyAttestation(
        encoded(fixture.object({ version: "2" })),
        fixture.keyId,
        fixture.challenge,
      ),
    "app-version",
  );
});

test("Apple assertions bind the request, key, application, strictly increasing counter and current released build", () => {
  const assertion = fixture.assertion(7);
  assert.deepEqual(
    verifier.verifyAssertion(
      assertion,
      fixture.leaf.publicKey,
      fixture.challenge,
      6,
    ),
    { counter: 7, bundleVersion: "1", distribution: "app-store" },
  );
  rejects(
    () =>
      verifier.verifyAssertion(
        assertion,
        fixture.leaf.publicKey,
        fixture.challenge,
        7,
      ),
    "counter",
  );
  rejects(
    () =>
      verifier.verifyAssertion(
        assertion,
        fixture.leaf.publicKey,
        Buffer.alloc(32),
        6,
      ),
    "signature",
  );
  rejects(
    () =>
      verifier.verifyAssertion(
        assertion,
        fixture.root.publicKey,
        fixture.challenge,
        6,
      ),
    "key",
  );
  for (const category of [0, 1, 2, 3, 5])
    rejects(
      () =>
        verifier.verifyAssertion(
          fixture.assertion(8, { category }),
          fixture.leaf.publicKey,
          fixture.challenge,
          7,
        ),
      "app-distribution",
    );
  rejects(
    () =>
      verifier.verifyAssertion(
        fixture.assertion(8, { version: "2" }),
        fixture.leaf.publicKey,
        fixture.challenge,
        7,
      ),
    "app-version",
  );
  rejects(
    () =>
      verifier.verifyAssertion(
        fixture.assertion(8, {
          modify: (b) => {
            b[0] ^= 1;
            return b;
          },
        }),
        fixture.leaf.publicKey,
        fixture.challenge,
        7,
      ),
    "app-id",
  );
  rejects(
    () =>
      verifier.verifyAssertion(
        fixture.assertion(8, { modify: (b) => b.subarray(0, 37) }),
        fixture.leaf.publicKey,
        fixture.challenge,
        7,
      ),
    "cbor",
  );
  rejects(
    () =>
      verifier.verifyAssertion(
        fixture.assertion(8, {
          modify: (b) => {
            b[32] = 0;
            return b.subarray(0, 37);
          },
        }),
        fixture.leaf.publicKey,
        fixture.challenge,
        7,
      ),
    "app-properties-missing",
  );
  rejects(
    () =>
      verifier.verifyAssertion(
        fixture.assertion(0),
        fixture.leaf.publicKey,
        fixture.challenge,
        0,
      ),
    "counter",
  );
});

test("attestation binary inputs reject duplicate keys, ambiguous encodings, trailing bytes, excessive nesting and malformed DER", () => {
  for (const hex of [
    "a201010102",
    "bf616101ff",
    "c001",
    "190001",
    "f6",
    "617fff",
    "62c0af",
    "a1810101",
    "1b0000000000000001",
    "5a00010000",
    "8181818181818181818101",
  ])
    rejects(() => cbor(Buffer.from(hex, "hex")));
  for (const value of ["", "YQ", "YQ=", "YR==", "YQ==\n", "-___"])
    rejects(() => base64(value));
  for (const hex of [
    "30030400",
    "30800000",
    "30820001ff",
    "1f0000",
    "30810100",
  ])
    rejects(() => derItems(Buffer.from(hex, "hex")));
  assert.equal(cbor(Buffer.from("190100", "hex")), 256);
  assert.equal(cbor(Buffer.from("3a00010000", "hex")), -65537);
  assert.deepEqual(base64("YQ=="), Buffer.from("a"));
});
