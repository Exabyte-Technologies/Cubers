import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { X509Certificate, generateKeyPairSync } from "node:crypto";
import {
  AppleReceiptVerifier,
  AppleEnrollmentVerifier,
  appleReceiptVerifier,
  appleEnrollmentVerifier,
} from "../apps/api/src/attestation/apple-receipt";
import {
  AppleAppAttestCrypto,
  appleAppAttestCrypto,
} from "../apps/api/src/attestation/apple";
import { encodeCbor } from "./helpers/app-attest-fixture";
import {
  cbor,
  cborMap,
  base64,
  AttestationError,
} from "../apps/api/src/attestation/binary";
import {
  receiptFixture,
  receiptOpenSsl,
} from "./helpers/apple-receipt-fixture";
const f = receiptFixture();
after(() => f.close());
const policy = { appId: f.appId, environment: "production" as const };
const verifier = new AppleReceiptVerifier(
  policy,
  f.root,
  receiptOpenSsl,
  () => f.now,
);
const refuses = (operation: () => Promise<unknown>, code?: string) =>
  assert.rejects(
    operation,
    (e: any) =>
      e instanceof AttestationError &&
      (!code || e.code === code) &&
      !e.message.includes("receipt-token"),
  );
const changed = (id: number, value: string | Buffer) =>
  f
    .fields()
    .map(
      ([key, old]) =>
        [
          key,
          key === id
            ? Buffer.isBuffer(value)
              ? value
              : Buffer.from(value)
            : old,
        ] as [number, Buffer],
    );

test("independent Apple receipt verification accepts the genuine published signature, pinned chain and attested certificate key", async () => {
  const published = JSON.parse(
    readFileSync("tests/helpers/apple-published-attestation.json", "utf8"),
  );
  const object = cborMap(cbor(base64(published.attestation))),
    statement = cborMap(object.get("attStmt")!);
  const receipt = statement.get("receipt") as Buffer,
    chain = statement.get("x5c") as Buffer[];
  const cert = new X509Certificate(chain[0]),
    at = Date.parse("2026-04-21T18:14:00.000Z");
  const root = new X509Certificate(
    readFileSync("apps/api/assets/security/apple-root-g3.pem"),
  );
  const genuine = new AppleReceiptVerifier(
    { appId: published.appId, environment: "production" },
    root,
    receiptOpenSsl,
    () => at,
  );
  const result = await genuine.verify(
    receipt.toString("base64"),
    cert.publicKey,
    "ATTEST",
  );
  assert.equal(result.type, "ATTEST");
  assert.equal(result.createdAt, Date.parse("2026-04-21T18:13:12.153Z"));
  assert.equal(result.riskMetric, null);
  assert.equal(result.notBefore, null);
  assert.equal(result.environment, "production");
  // The attestation object's nonce is still invalid under the documented hash;
  // a valid independent receipt cannot make that object a valid enrollment.
  await refuses(
    () =>
      appleEnrollmentVerifier(
        {
          appId: published.appId,
          distribution: "app-store",
          bundleVersions: ["1"],
        },
        receiptOpenSsl,
      ).verify(
        published.attestation,
        published.keyId,
        Buffer.from(published.challenge),
      ),
    "certificate-expired",
  );
});

test("receipt CMS checks accept definite and streamed BER containers and return verified risk timing without unsigned claims", async () => {
  for (const stream of [false, true]) {
    const value = f.sign(undefined, { stream });
    const result = await verifier.verify(value, f.leaf.publicKey, "ATTEST");
    assert.equal(result.appId, f.appId);
    assert.equal(result.riskMetric, null);
    assert.equal(result.verifiedAt, f.now);
    assert.equal(result.receiptSha256.length, 64);
  }
  const updated = await verifier.verify(
    f.sign(f.fields("RECEIPT")),
    f.leaf.publicKey,
    "RECEIPT",
  );
  assert.equal(updated.riskMetric, 3);
  assert.equal(updated.notBefore, f.now + 3600000);
});

test("receipt certificate status is checked only after authenticated receipt binding and remains current at delivery", async () => {
  let clock = f.now,
    calls = 0;
  let status = async (_chain: string[]) => f.now + 60000;
  const guarded = new AppleReceiptVerifier(
    policy,
    f.root,
    receiptOpenSsl,
    () => clock,
    {
      ensure: async (chain) => {
        calls++;
        assert.equal(chain.length, 3);
        assert.equal(
          new X509Certificate(Buffer.from(chain[2], "base64")).fingerprint256,
          f.root.fingerprint256,
        );
        return status(chain);
      },
    },
  );
  const value = f.sign();
  await refuses(() =>
    guarded.verify(
      f.sign(changed(2, "foreign.app")),
      f.leaf.publicKey,
      "ATTEST",
    ),
  );
  assert.equal(calls, 0);
  const accepted = await guarded.verify(value, f.leaf.publicKey, "ATTEST");
  assert.equal(accepted.certificateChain?.length, 3);
  assert.equal(calls, 1);
  status = async () => {
    throw new AttestationError("certificate-status-not-good");
  };
  await refuses(
    () => guarded.verify(value, f.leaf.publicKey, "ATTEST"),
    "certificate-status-not-good",
  );
  status = async () => {
    clock += 2000;
    return clock - 1;
  };
  await refuses(
    () => guarded.verify(value, f.leaf.publicKey, "ATTEST"),
    "receipt-time",
  );
});

test("receipt verification refuses tampered signatures, foreign trust roots, wrong purpose and changed app/key/environment/type", async () => {
  const value = f.sign(),
    bytes = Buffer.from(value, "base64");
  bytes[bytes.length - 8] ^= 1;
  await refuses(
    () => verifier.verify(bytes.toString("base64"), f.leaf.publicKey, "ATTEST"),
    "receipt-signature",
  );
  await refuses(
    () =>
      appleReceiptVerifier(policy, receiptOpenSsl).verify(
        value,
        f.leaf.publicKey,
        "ATTEST",
      ),
    "receipt-signature",
  );
  await refuses(
    () =>
      verifier.verify(
        f.sign(undefined, { noPurpose: true }),
        f.leaf.publicKey,
        "ATTEST",
      ),
    "receipt-purpose",
  );
  await refuses(
    () =>
      verifier.verify(
        f.sign(changed(2, "ABCDE12345.other.app")),
        f.leaf.publicKey,
        "ATTEST",
      ),
    "receipt-app",
  );
  await refuses(
    () =>
      verifier.verify(
        f.sign(changed(7, "development")),
        f.leaf.publicKey,
        "ATTEST",
      ),
    "receipt-app",
  );
  await refuses(
    () =>
      verifier.verify(
        f.sign(),
        generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey,
        "ATTEST",
      ),
    "receipt-key",
  );
  await refuses(
    () => verifier.verify(f.sign(), f.leaf.publicKey, "RECEIPT"),
    "receipt-type",
  );
});

test("receipt verification refuses stale/future/expired/inverted times and malformed or duplicated signed attributes", async () => {
  for (const rows of [
    changed(12, new Date(f.now - 300001).toISOString()),
    changed(12, new Date(f.now + 5001).toISOString()),
    changed(21, new Date(f.now).toISOString()),
    changed(12, "2026-02-31T12:00:00.000Z"),
    [...f.fields(), [2, Buffer.from(f.appId)]] as [number, Buffer][],
    f.fields().filter(([id]) => id !== 7),
  ])
    await refuses(() =>
      verifier.verify(f.sign(rows), f.leaf.publicKey, "ATTEST"),
    );
  const risk = f.fields("RECEIPT");
  await refuses(
    () =>
      verifier.verify(
        f.sign(risk.map(([id, b]) => [id, id === 17 ? Buffer.from("-1") : b])),
        f.leaf.publicKey,
        "RECEIPT",
      ),
    "receipt-risk",
  );
  await refuses(
    () =>
      verifier.verify(
        f.sign(risk.filter(([id]) => id !== 19)),
        f.leaf.publicKey,
        "RECEIPT",
      ),
    "receipt-risk",
  );
  await refuses(
    () =>
      verifier.verify(
        f.sign([...f.fields(), [17, Buffer.from("1")]]),
        f.leaf.publicKey,
        "ATTEST",
      ),
    "receipt-risk",
  );
});

test("receipt verifier bounds envelope size/extent and concurrent processes, honors cancellation and removes private temporary files", async () => {
  const encoded = f.sign(),
    bytes = Buffer.from(encoded, "base64");
  for (const value of [
    Buffer.concat([bytes, Buffer.from([0])]),
    Buffer.from("30800000ff", "hex"),
    Buffer.alloc(16385),
  ])
    await refuses(() =>
      verifier.verify(value.toString("base64"), f.leaf.publicKey, "ATTEST"),
    );
  const controller = new AbortController();
  controller.abort();
  await refuses(
    () =>
      verifier.verify(encoded, f.leaf.publicKey, "ATTEST", controller.signal),
    "receipt-cancelled",
  );
  const lateController = new AbortController();
  let clockReads = 0;
  const cancelledAtDelivery = new AppleReceiptVerifier(
    policy,
    f.root,
    receiptOpenSsl,
    () => {
      if (++clockReads === 2) lateController.abort();
      return f.now;
    },
  );
  await refuses(
    () =>
      cancelledAtDelivery.verify(
        encoded,
        f.leaf.publicKey,
        "ATTEST",
        lateController.signal,
      ),
    "receipt-cancelled",
  );
  const before = readdirSync(tmpdir()).filter((n) =>
    n.startsWith("cubers-receipt-"),
  );
  const first = verifier.verify(encoded, f.leaf.publicKey, "ATTEST"),
    second = verifier.verify(encoded, f.leaf.publicKey, "ATTEST");
  await refuses(
    () => verifier.verify(encoded, f.leaf.publicKey, "ATTEST"),
    "receipt-busy",
  );
  await Promise.all([first, second]);
  assert.deepEqual(
    readdirSync(tmpdir()).filter((n) => n.startsWith("cubers-receipt-")),
    before,
  );
  const absent = new AppleReceiptVerifier(
    policy,
    f.root,
    "/nonexistent/cubers-openssl",
    () => f.now,
  );
  await refuses(
    () => absent.verify(encoded, f.leaf.publicKey, "ATTEST"),
    "receipt-tool-unavailable",
  );
  assert.deepEqual(
    readdirSync(tmpdir()).filter((n) => n.startsWith("cubers-receipt-")),
    before,
  );
});

test("combined Apple enrollment requires both independent checks and never promotes a mismatched receipt", async () => {
  const crypto = new AppleAppAttestCrypto(
    { appId: f.appId, distribution: "app-store", bundleVersions: ["1"] },
    f.root,
  );
  const enrollment = new AppleEnrollmentVerifier(crypto, verifier, () => f.now);
  const object = f.object(),
    receipt = f.sign();
  object.get("attStmt").set("receipt", Buffer.from(receipt, "base64"));
  const result = await enrollment.verify(
    encodeCbor(object).toString("base64"),
    f.keyId,
    f.challenge,
  );
  assert.equal(result.receipt.appId, f.appId);
  assert.equal(result.receipt.type, "ATTEST");
  assert.equal(result.receiptBase64, receipt);
  assert.equal(Object.hasOwn(result, "unverifiedReceipt"), false);
  object
    .get("attStmt")
    .set(
      "receipt",
      Buffer.from(f.sign(changed(2, "ABCDE12345.other.app")), "base64"),
    );
  await refuses(
    () =>
      enrollment.verify(
        encodeCbor(object).toString("base64"),
        f.keyId,
        f.challenge,
      ),
    "receipt-app",
  );
  const published = JSON.parse(
      readFileSync("tests/helpers/apple-published-attestation.json", "utf8"),
    ),
    at = Date.parse("2026-04-21T18:14:00.000Z");
  const genuineReceipt = new AppleReceiptVerifier(
    { appId: published.appId, environment: "production" },
    new X509Certificate(
      readFileSync("apps/api/assets/security/apple-root-g3.pem"),
    ),
    receiptOpenSsl,
    () => at,
  );
  const combined = new AppleEnrollmentVerifier(
    appleAppAttestCrypto({
      appId: published.appId,
      distribution: "app-store",
      bundleVersions: ["1"],
    }),
    genuineReceipt,
    () => at,
  );
  await refuses(
    () =>
      combined.verify(
        published.attestation,
        published.keyId,
        Buffer.from(published.challenge),
      ),
    "nonce",
  );
});

test("receipt subprocess cancellation and timeout kill work and clean private proof files before releasing capacity", async () => {
  const script = join(f.directory, "stalled-verifier"),
    pidFile = join(f.directory, "stalled-pid.txt"),
    encoded = f.sign();
  const quotedPidFile = "'" + pidFile.replace(/'/g, "'\\''") + "'";
  writeFileSync(
    script,
    '#!/bin/sh\numask 077\nprintf \'%s\\n%s\\n\' "$$" "$PWD" > ' +
      quotedPidFile +
      "\nexec /bin/sleep 60\n",
    { mode: 0o700 },
  );
  const stalled = new AppleReceiptVerifier(policy, f.root, script, () => f.now),
    controller = new AbortController();
  const work = stalled.verify(
    encoded,
    f.leaf.publicKey,
    "ATTEST",
    controller.signal,
  );
  let settled = false;
  void work.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  const pending = refuses(() => work, "receipt-cancelled");
  const readChild = () => {
    const [pid, cwd] = readFileSync(pidFile, "utf8").trim().split("\n");
    return { pid: Number(pid), cwd };
  };
  // Observe the actual child, allowing unrelated suite work to delay the
  // preceding async filesystem operations. Its own two-second deadline stays.
  void pending.catch(() => {});
  try {
    for (let i = 0; i < 500 && !existsSync(pidFile) && !settled; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(
      existsSync(pidFile),
      "The cancellation fixture must reach a live subprocess",
    );
    const child = readChild();
    assert.equal(statSync(child.cwd).mode & 0o777, 0o700);
    for (const file of [
      "receipt.der",
      "payload.der",
      "signers.pem",
      "chain.pem",
      "root.pem",
    ])
      assert.equal(statSync(join(child.cwd, file)).mode & 0o777, 0o600);
    controller.abort();
    await pending;
    assert.equal(existsSync(child.cwd), false);
    assert.throws(
      () => process.kill(child.pid, 0),
      (e: any) => e.code === "ESRCH",
    );
  } finally {
    controller.abort();
    await pending.catch(() => {});
  }
  await refuses(
    () => stalled.verify(encoded, f.leaf.publicKey, "ATTEST"),
    "receipt-timeout",
  );
  const timed = readChild();
  assert.equal(existsSync(timed.cwd), false);
  assert.throws(
    () => process.kill(timed.pid, 0),
    (e: any) => e.code === "ESRCH",
  );
});
