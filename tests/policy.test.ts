import { test } from "node:test";
import assert from "node:assert/strict";
import {
  permissions,
  isYoungChild,
  ageOn,
  assertTransition,
  type AccountPolicy,
} from "@cubers/core";
const adult: AccountPolicy = {
  region: "INTL",
  age: 25,
  guardianVerified: false,
  postingConsent: false,
  recordingConsent: false,
  adultVerified: true,
  identityVerified: true,
};
test("no minor or unverified adult gets ads, open AI, or private messaging", () => {
  for (const age of [7, 12, 13, 14, 17]) {
    const p = permissions({ ...adult, age });
    assert.equal(p.canSeeSponsors, false);
    assert.equal(p.canChat, false);
    assert.equal(p.canMessage, false);
  }
  assert.equal(
    permissions({ ...adult, adultVerified: false }).canSeeSponsors,
    false,
  );
});
test("regional child thresholds and separate consent permissions", () => {
  assert.equal(isYoungChild({ ...adult, age: 13, region: "CN" }), true);
  assert.equal(isYoungChild({ ...adult, age: 13, region: "INTL" }), false);
  assert.equal(permissions({ ...adult, age: 10 }).canLearn, false);
  assert.equal(
    permissions({ ...adult, age: 10, guardianVerified: true }).canLearn,
    true,
  );
  assert.equal(
    permissions({
      ...adult,
      age: 10,
      guardianVerified: true,
      postingConsent: true,
    }).canPost,
    true,
  );
  assert.equal(
    permissions({
      ...adult,
      age: 10,
      guardianVerified: true,
      postingConsent: true,
    }).canRecord,
    false,
  );
});
test("CN posting always needs identity verification", () => {
  assert.equal(
    permissions({ ...adult, region: "CN", identityVerified: false }).canPost,
    false,
  );
});
test("terminal and interrupted attempts cannot silently resume", () => {
  assert.throws(() => assertTransition("INTERRUPTED", "SOLVING"));
  assert.throws(() => assertTransition("PROVISIONAL", "SOLVING"));
  assert.throws(() => assertTransition("APPROVED", "APPROVED"));
  assert.throws(() => assertTransition("SOLVING", "PROVISIONAL"));
  assert.doesNotThrow(() => assertTransition("SOLVING", "AWAITING_EVIDENCE"));
  assert.doesNotThrow(() =>
    assertTransition("AWAITING_EVIDENCE", "PROVISIONAL"),
  );
});
test("birthday calculation rejects invalid and future dates", () => {
  assert.equal(ageOn("2012-10-16", new Date("2026-10-15T00:00:00Z")), 13);
  assert.throws(() => ageOn("2024-02-31"));
  assert.throws(() => ageOn("2099-01-01"));
});
