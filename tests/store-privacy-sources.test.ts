import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { privacySources } from "../scripts/store-privacy-sources.mjs";

test("store privacy evidence includes every primary and additional implementation source once", () => {
  assert.deepEqual(
    privacySources([
      {
        source: "apps/api/src/community-region.ts",
        additionalSources: ["apps/api/src/freeip-country.ts"],
      },
      { source: "apps/api/src/freeip-country.ts" },
    ]),
    ["apps/api/src/community-region.ts", "apps/api/src/freeip-country.ts"],
  );
  for (const source of [
    ".env.local",
    "/etc/passwd",
    "apps/../../.env.local",
    "apps/.data/private.json",
    "apps/api/../private.ts",
    "apps\\api\\config.ts",
    "apps//api/config.ts",
    "apps/api/secret\0.ts",
  ]) {
    assert.throws(() => privacySources([{ source }]));
    assert.throws(() =>
      privacySources([
        { source: "apps/api/src/config.ts", additionalSources: [source] },
      ]),
    );
  }
  for (const value of [
    null,
    {},
    [{ source: "apps/api/src/config.ts", additionalSources: "ignored" }],
    [{ additionalSources: [] }],
  ])
    assert.throws(() => privacySources(value));
});

test("current store worksheet discloses the actual production IP vendor and stage-state data flow", async () => {
  const worksheet = JSON.parse(
    await readFile("store/privacy-inventory.json", "utf8"),
  );
  assert.equal(worksheet.operatorApproved, false);
  const account = worksheet.flows.find((flow: any) => flow.id === "account");
  assert.match(account.purpose, /OS secure storage/);
  assert.match(account.purpose, /Failed reads do not clear stored credentials/);
  assert.ok(account.additionalSources.includes("apps/mobile/src/state.tsx"));
  assert.ok(
    account.additionalSources.includes("apps/mobile/src/stored-session.ts"),
  );
  const routing = worksheet.flows.find((flow: any) => flow.id === "routing");
  assert.match(routing.data, /FreeIPAPI/);
  assert.match(routing.data, /production/);
  assert.match(routing.purpose, /Development\/test/);
  assert.ok(
    routing.additionalSources.includes("apps/api/src/freeip-country.ts"),
  );
  const paths = privacySources(worksheet.flows);
  for (const path of paths) await readFile(path);
  for (const path of [
    "packages/core/src/lesson-stage.ts",
    "apps/api/src/first-solve.controller.ts",
    "apps/api/src/smart-first-solve.controller.ts",
    "apps/mobile/src/Scanner.web.tsx",
  ])
    assert.ok(paths.includes(path));
  const scanner = worksheet.flows.find(
    (flow: any) => flow.id === "scan-frames",
  );
  assert.equal(scanner.leavesDevice, false);
  assert.match(scanner.purpose, /not camera images/);
});
