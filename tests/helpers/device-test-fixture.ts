// All evidence here is synthetic. A physical declaration below exercises the
// independent-review API only; it never proves a real hardware test occurred.
import {
  deviceTestChecks,
  requiredDeviceChecks,
  type DeviceTestContent,
} from "@cubers/core";
export function deviceTestFixture(
  patch: Partial<DeviceTestContent> = {},
): DeviceTestContent {
  return {
    model: "gan-356-i3",
    platform: "ios",
    scope: "transport",
    provenance: "synthetic",
    firmware: "synthetic-firmware-1",
    phoneModel: "Synthetic test phone",
    osVersion: "Synthetic OS 1",
    appBuild: "synthetic-fixture-build",
    buildSha256: "a".repeat(64),
    sourceRevision: "b".repeat(40),
    testedAt: new Date(Date.now() - 60000).toISOString(),
    caseReference: "SYNTHETIC-TEST-CASE",
    custodyReference: "SYNTHETIC-LOCAL-REGISTER",
    evidenceSha256: "c".repeat(64),
    summary: {
      en: "Synthetic automated fixture only; no actual hardware was connected or tested.",
      zh: "仅用于自动化软件验证的模拟设备验收档案，不代表真实硬件测试。",
    },
    checks: Object.fromEntries(
      deviceTestChecks.map((key) => [key, { status: "not_run", notes: "" }]),
    ) as DeviceTestContent["checks"],
    ...patch,
  };
}
export function declaredPassingDeviceTest(
  scope: DeviceTestContent["scope"] = "transport",
) {
  const content = deviceTestFixture({ scope, provenance: "physical" });
  for (const key of requiredDeviceChecks(scope))
    content.checks[key] = {
      status: "passed",
      notes: "Synthetic API-path observation, not actual physical evidence.",
    };
  return content;
}
