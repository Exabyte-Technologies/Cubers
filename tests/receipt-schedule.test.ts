import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptRefreshAt } from "../apps/api/src/attestation/receipt-schedule";
import { AppAttestationReceiptSchedule } from "@cubers/core";
test("automatic receipt timing stays strictly after signed not-before, bounds exponential backoff and never extends expiry", () => {
  const now = Date.now(),
    expiry = now + 86400000;
  assert.equal(
    receiptRefreshAt(
      { expiresAt: expiry, notBefore: now + 3600000 },
      now,
    ).getTime(),
    now + 3600001,
  );
  assert.equal(
    receiptRefreshAt(
      { expiresAt: expiry, notBefore: null },
      now,
      0,
      10,
    ).getTime(),
    now + 6 * 3600000,
  );
  assert.equal(
    receiptRefreshAt({ expiresAt: now + 1000, notBefore: null }, now).getTime(),
    now + 1000,
  );
  assert.equal(
    receiptRefreshAt(
      { expiresAt: expiry, notBefore: null },
      now,
      now + 3600000,
    ).getTime(),
    now + 3600000,
  );
});
test("receipt opt-in rejects coercion, unknown input and unbounded stale-version values", () => {
  assert.equal(
    AppAttestationReceiptSchedule.safeParse({
      expectedVersion: 0,
      enabled: true,
    }).success,
    true,
  );
  for (const body of [
    { expectedVersion: 0, enabled: "true" },
    { expectedVersion: 0, enabled: true, userId: "foreign" },
    { expectedVersion: -1, enabled: false },
    { expectedVersion: 2147483648, enabled: false },
  ])
    assert.equal(AppAttestationReceiptSchedule.safeParse(body).success, false);
});
