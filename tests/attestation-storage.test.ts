import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  realpath,
  writeFile,
  chmod,
  symlink,
  link,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ReceiptStorage,
  type ReceiptBinding,
} from "../apps/api/src/attestation/receipt-storage";
import {
  AppAttestationChallengeRequest,
  AppAttestationProofRequest,
  appAttestationActionBody,
} from "@cubers/core";

test("receipt storage authenticates ciphertext and every account, region and key binding", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "cubers-storage-")));
  const path = join(dir, "key.json");
  const secret = randomBytes(32).toString("base64");
  await writeFile(
    path,
    JSON.stringify({ version: 1, id: randomUUID(), key: secret }),
    { mode: 0o600 },
  );
  try {
    const storage = await ReceiptStorage.load(path);
    const binding: ReceiptBinding = {
      region: "INTL",
      userId: randomUUID(),
      id: randomUUID(),
      keyIdHash: "a".repeat(64),
    };
    const value = { receiptBase64: "sensitive-synthetic-receipt", counter: 0 };
    const sealed = storage.seal(binding, value);
    assert.deepEqual(storage.open(binding, sealed), value);
    assert.notEqual(storage.seal(binding, value), sealed);
    assert.equal(sealed.includes(secret), false);
    assert.equal(sealed.includes(value.receiptBase64), false);
    for (const change of [
      { region: "CN" },
      { userId: randomUUID() },
      { id: randomUUID() },
      { keyIdHash: "b".repeat(64) },
    ])
      assert.throws(() =>
        storage.open({ ...binding, ...change } as ReceiptBinding, sealed),
      );
    const envelope = JSON.parse(sealed);
    for (const field of ["iv", "tag", "data"]) {
      const b = Buffer.from(envelope[field], "base64");
      b[0] ^= 1;
      assert.throws(() =>
        storage.open(
          binding,
          JSON.stringify({ ...envelope, [field]: b.toString("base64") }),
        ),
      );
    }
    for (const change of [
      { kid: randomUUID() },
      { v: 2 },
      { extra: true },
      { tag: envelope.tag + "\n" },
      { iv: "AA==" },
    ])
      assert.throws(() =>
        storage.open(binding, JSON.stringify({ ...envelope, ...change })),
      );
    assert.throws(() => storage.seal(binding, "x".repeat(40000)));
    assert.throws(() => storage.open(binding, "x".repeat(65537)));
    storage.destroy();
    storage.destroy();
    assert.throws(() => storage.open(binding, sealed));
    assert.throws(() => storage.seal(binding, value));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("receipt storage refuses unsafe permissions, aliases and malformed key files", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "cubers-keyfile-")));
  const path = join(dir, "key.json");
  const valid = {
    version: 1,
    id: randomUUID(),
    key: randomBytes(32).toString("base64"),
  };
  await writeFile(path, JSON.stringify(valid), { mode: 0o600 });
  try {
    for (const mode of [0o644, 0o640, 0o700, 0o660]) {
      await chmod(path, mode);
      await assert.rejects(() => ReceiptStorage.load(path));
    }
    await chmod(path, 0o600);
    const alias = join(dir, "alias");
    await symlink(path, alias);
    await assert.rejects(() => ReceiptStorage.load(alias));
    await rm(alias);
    await link(path, alias);
    await assert.rejects(() => ReceiptStorage.load(path));
    await rm(alias);
    await assert.rejects(() => ReceiptStorage.load(dir));
    if (process.platform !== "win32") {
      execFileSync("mkfifo", [alias]);
      await assert.rejects(() => ReceiptStorage.load(alias));
      await rm(alias);
    }
    for (const value of [
      { ...valid, extra: true },
      { ...valid, version: 2 },
      { ...valid, key: valid.key + "\n" },
      { ...valid, key: "AA==" },
      { ...valid, id: "invalid" },
      "x".repeat(4097),
    ]) {
      await writeFile(path, JSON.stringify(value));
      await assert.rejects(() => ReceiptStorage.load(path));
    }
    await assert.rejects(() => ReceiptStorage.load("relative-key.json"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("app proof contracts bind strict operation bodies and bound request sizes", () => {
  const nonce = "synthetic-attempt-nonce",
    evidenceId = randomUUID();
  assert.deepEqual(
    appAttestationActionBody("evidence", {
      nonce,
      evidenceId: evidenceId.toUpperCase(),
    }),
    { nonce, evidenceId },
  );
  assert.deepEqual(
    appAttestationActionBody("start", { nonce, recordingStarted: false }),
    { nonce, recordingStarted: false },
  );
  for (const op of ["record", "inspect", "finish"] as const) {
    assert.deepEqual(appAttestationActionBody(op, { nonce }), { nonce });
    assert.throws(() => appAttestationActionBody(op, { nonce, evidenceId }));
  }
  assert.throws(() =>
    appAttestationActionBody("start", { nonce, recordingStarted: "false" }),
  );
  assert.throws(() => appAttestationActionBody("evidence", { nonce }));
  const challenge = {
    kind: "enroll",
    provider: "apple-app-attest",
    keyId: randomBytes(32).toString("base64"),
  };
  assert.equal(
    AppAttestationChallengeRequest.safeParse(challenge).success,
    true,
  );
  assert.equal(
    AppAttestationChallengeRequest.safeParse({
      ...challenge,
      userId: randomUUID(),
    }).success,
    false,
  );
  const proof = {
    kind: "action",
    challengeId: randomUUID(),
    clientData: "a".repeat(43) + "." + "b".repeat(64),
    assertion: "AA==",
  };
  assert.equal(AppAttestationProofRequest.safeParse(proof).success, true);
  for (const change of [
    { assertion: "a".repeat(5465) },
    { clientData: "a".repeat(32) },
    { kind: "enroll" },
    { counter: 0 },
  ])
    assert.equal(
      AppAttestationProofRequest.safeParse({ ...proof, ...change }).success,
      false,
    );
});
