import test from "node:test";
import assert from "node:assert/strict";
import {
  DeviceTestContent,
  DeviceTestCreate,
  DeviceTestEdit,
  DeviceTestReview,
  deviceTestApprovalProblems,
  requiredDeviceChecks,
} from "@cubers/core";
import {
  deviceTestFixture,
  declaredPassingDeviceTest,
} from "./helpers/device-test-fixture";
test("device reports bind exact configurations, evidence digests, provenance and bounded observations without URLs or extra capability flags", () => {
  const c = deviceTestFixture();
  assert.ok(DeviceTestContent.safeParse(c).success);
  for (const patch of [
    { model: "any-gan" },
    { platform: "web" },
    { buildSha256: "short" },
    { sourceRevision: "main" },
    { caseReference: "https://example.org/evidence" },
    { custodyReference: "../keys/private" },
    { evidenceSha256: "not-a-digest" },
    { phoneModel: "name\nsecond line" },
    { firmware: "bad\u0000value" },
    { summary: { en: "Too short", zh: c.summary.zh } },
    { enabled: true },
    {
      checks: {
        ...c.checks,
        permissions: { status: "passed", notes: "short" },
      },
    },
  ])
    assert.equal(
      DeviceTestContent.safeParse({ ...c, ...patch }).success,
      false,
    );
  assert.ok(
    DeviceTestCreate.safeParse({
      content: c,
      reason: "Store synthetic software evidence",
    }).success,
  );
  assert.equal(
    DeviceTestEdit.safeParse({
      content: c,
      expectedVersion: 0,
      reason: "Version must be positive",
    }).success,
    false,
  );
});
test("physical acceptance is scoped and synthetic evidence, unknown firmware and missing or failed checks cannot pass", () => {
  assert.equal(requiredDeviceChecks("transport").length, 10);
  assert.equal(requiredDeviceChecks("learning").length, 12);
  assert.equal(requiredDeviceChecks("ranked").length, 14);
  for (const scope of ["transport", "learning", "ranked"] as const) {
    const c = declaredPassingDeviceTest(scope);
    assert.deepEqual(deviceTestApprovalProblems(c), []);
    assert.ok(
      deviceTestApprovalProblems({ ...c, provenance: "synthetic" }).length,
    );
    assert.ok(deviceTestApprovalProblems({ ...c, firmware: "unknown" }).length);
    const key = requiredDeviceChecks(scope).at(-1)!;
    for (const status of ["not_run", "failed"] as const)
      assert.ok(
        deviceTestApprovalProblems({
          ...c,
          checks: {
            ...c.checks,
            [key]: { status, notes: "Observed failure in synthetic fixture" },
          },
        }).length,
      );
  }
  assert.equal(
    deviceTestApprovalProblems({
      ...declaredPassingDeviceTest("transport"),
      scope: "ranked",
    }).length,
    4,
  );
});
test("device acceptance requires literal evidence/configuration/physical/independent confirmations for one exact version", () => {
  const b = {
    approve: true,
    expectedVersion: 4,
    reason: "Independently inspect the protected evidence",
    evidenceInspected: true,
    physicalDeviceConfirmed: true,
    configurationConfirmed: true,
    independentReview: true,
  };
  assert.ok(DeviceTestReview.safeParse(b).success);
  for (const key of [
    "evidenceInspected",
    "physicalDeviceConfirmed",
    "configurationConfirmed",
    "independentReview",
  ])
    assert.equal(
      DeviceTestReview.safeParse({ ...b, [key]: false }).success,
      false,
    );
  assert.equal(
    DeviceTestReview.safeParse({ ...b, enabled: true }).success,
    false,
  );
  assert.ok(
    DeviceTestReview.safeParse({
      approve: false,
      expectedVersion: 4,
      reason: "Reject missing physical observations",
    }).success,
  );
});
