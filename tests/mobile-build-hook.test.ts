import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

test("every EAS profile retains the saved-audit-only boundary and regional release settings", async () => {
  const config = JSON.parse(await readFile("apps/mobile/eas.json", "utf8"));
  for (const [name, profile] of Object.entries(config.build) as [string, any][])
    assert.equal(profile.env.NPM_CONFIG_AUDIT, "false", name);
  assert.equal(config.build["production-intl"].env.EXPO_PUBLIC_REGION, "INTL");
  assert.equal(config.build["production-cn"].env.EXPO_PUBLIC_REGION, "CN");
});

test("mobile build hook compiles fresh shared sources, replaces stale output and propagates compiler failure", async () => {
  const root = resolve("."),
    fixture = await mkdtemp(join(tmpdir(), "cubers-mobile-build-"));
  try {
    for (const folder of ["apps/mobile", "packages/core"])
      await mkdir(join(fixture, folder), { recursive: true });
    for (const file of [
      "package.json",
      "tsconfig.base.json",
      "apps/mobile/package.json",
      "packages/core/package.json",
      "packages/core/tsconfig.json",
    ])
      await cp(join(root, file), join(fixture, file));
    await cp(
      join(root, "packages/core/src"),
      join(fixture, "packages/core/src"),
      { recursive: true },
    );
    // Use the installed, lockfile-pinned compiler/runtime dependencies. The
    // fixture owns all source and generated output; no existing dist is copied.
    await symlink(
      join(root, "node_modules"),
      join(fixture, "node_modules"),
      "junction",
    );
    await writeFile(join(fixture, ".npmrc"), "audit=false\nfund=false\n");
    const index = join(fixture, "packages/core/src/index.ts"),
      original = await readFile(index, "utf8"),
      runtime = join(fixture, "packages/core/dist/index.js");
    await assert.rejects(readFile(runtime), { code: "ENOENT" });
    const marker = randomUUID();
    await writeFile(
      index,
      original +
        `\nexport const mobileBuildMarker = ${JSON.stringify(marker)};\n`,
    );
    const env = {
      ...process.env,
      NPM_CONFIG_AUDIT: "false",
      NPM_CONFIG_FUND: "false",
      NPM_CONFIG_OFFLINE: "true",
      NPM_CONFIG_UPDATE_NOTIFIER: "false",
      NPM_CONFIG_CACHE: join(fixture, ".npm-cache"),
    };
    const run = () =>
      execFileSync("npm", ["run", "eas-build-post-install"], {
        cwd: join(fixture, "apps/mobile"),
        env,
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 256 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    const compiledMarker = () =>
      execFileSync(
        process.execPath,
        [
          "-e",
          `process.stdout.write(require(${JSON.stringify(runtime)}).mobileBuildMarker)`,
        ],
        { env, encoding: "utf8", timeout: 10000 },
      );
    run();
    assert.equal(compiledMarker(), marker);
    await writeFile(
      index,
      original +
        `\nexport const mobileBuildMarker = ${JSON.stringify(marker + "-updated")};\n`,
    );
    run();
    assert.equal(compiledMarker(), marker + "-updated");
    await writeFile(
      join(fixture, "packages/core/src/build-failure.ts"),
      "export const impossible: string = 123;\n",
    );
    assert.throws(
      run,
      (error: any) =>
        error.status !== 0 && String(error.stdout).includes("TS2322"),
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
