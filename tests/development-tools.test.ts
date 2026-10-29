import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  createDevelopmentRuntime,
  defaultDevelopmentSettings,
  developmentStorageKey,
  sameDevelopmentServers,
  validateDevelopmentSettings,
} from "../apps/mobile/src/development/runtime";

const defaults = () =>
  defaultDevelopmentSettings({
    INTL: "http://127.0.0.1:3000",
    CN: "https://cn.example.invalid",
    discovery: "https://discovery.example.invalid",
  });
test("development server configuration accepts origins and rejects credential/path/query injection and invalid parameters", () => {
  const value = defaults();
  assert.equal(
    validateDevelopmentSettings({
      ...value,
      endpoints: { ...value.endpoints, INTL: "  HTTP://LOCALHOST:3000/  " },
    }).endpoints.INTL,
    "http://localhost:3000",
  );
  for (const address of [
    "",
    "https://user:password@example.com",
    "https://example.com/v1",
    "https://example.com?token=secret",
    "https://example.com/#secret",
    "file:///private",
    "ftp://example.com",
    "https://" + "x".repeat(301),
  ])
    assert.throws(() =>
      validateDevelopmentSettings({
        ...value,
        endpoints: { ...value.endpoints, INTL: address },
      }),
    );
  for (const changed of [
    { timeoutMs: 499 },
    { timeoutMs: 60001 },
    { timeoutMs: 1000.5 },
    { latencyMs: -1 },
    { latencyMs: 10001 },
    { offline: "true" },
    { version: 2 },
    { secret: "never accepted" },
    { endpoints: { ...value.endpoints, extra: "https://other.invalid" } },
  ])
    assert.throws(() => validateDevelopmentSettings({ ...value, ...changed }));
  assert.equal(
    sameDevelopmentServers(value, { ...value, offline: true }),
    true,
  );
  assert.equal(
    sameDevelopmentServers(value, {
      ...value,
      endpoints: { ...value.endpoints, INTL: "http://localhost:3001" },
    }),
    false,
  );
});
test("disabled development runtime uses the original transport and original credential keys without enabling configuration", async () => {
  const fetcher = (async () => new Response("ok")) as typeof fetch;
  const runtime = createDevelopmentRuntime(false, defaults(), fetcher);
  assert.equal(runtime.fetch, fetcher);
  assert.throws(() => runtime.configure(defaults()));
  assert.throws(() => runtime.lock());
  assert.equal(
    developmentStorageKey("cubers-token-CN", false),
    "cubers-token-CN",
  );
  assert.match(developmentStorageKey("cubers-token-CN", true), /^[\w.-]+$/);
  assert.notEqual(
    developmentStorageKey("cubers-token-CN", true),
    developmentStorageKey("cubers-token-CN", false),
  );
  await runtime.fetch("https://example.invalid");
  assert.deepEqual(runtime.diagnostics, []);
});
test("development HTTP diagnostics exclude credentials, bodies, query strings, IDs and arbitrary path names", async () => {
  let received: RequestInit | undefined;
  const runtime = createDevelopmentRuntime(true, defaults(), (async (
    _input,
    init,
  ) => {
    received = init;
    return new Response("ok", { status: 201 });
  }) as typeof fetch);
  const init = {
    method: "POST",
    headers: { Authorization: "Bearer synthetic-secret-token" },
    body: JSON.stringify({
      email: "private@cubers.test",
      password: "secret-password",
    }),
  };
  await runtime.fetch(
    "https://api.invalid/v1/courses/private-account-id?token=private-link",
    init,
  );
  assert.equal(received?.body, init.body);
  assert.deepEqual(received?.headers, init.headers);
  assert.deepEqual(
    runtime.diagnostics.map(({ durationMs, ...row }) => row),
    [{ method: "POST", category: "courses", outcome: "response", status: 201 }],
  );
  await runtime.fetch("https://api.invalid/v1/secretlowercasepath");
  assert.equal(runtime.diagnostics.at(-1)?.category, "request");
  assert.doesNotMatch(
    JSON.stringify(runtime.diagnostics),
    /synthetic-secret|private|password|secretlowercasepath|Bearer|https/,
  );
});
test("development offline simulation fails locally without contacting a server", async () => {
  let calls = 0;
  const runtime = createDevelopmentRuntime(
    true,
    { ...defaults(), offline: true },
    (async () => {
      calls++;
      return new Response("ok");
    }) as typeof fetch,
  );
  await assert.rejects(
    runtime.fetch("https://api.invalid/v1/me"),
    /offline simulation/,
  );
  assert.equal(calls, 0);
  assert.equal(runtime.pendingRequests, 0);
  assert.equal(runtime.diagnostics[0].outcome, "failed");
});
test("development timeout includes injected latency and never starts a late network request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const runtime = createDevelopmentRuntime(
    true,
    { ...defaults(), timeoutMs: 500, latencyMs: 1000 },
    (async () => {
      calls++;
      return new Response("ok");
    }) as typeof fetch,
  );
  const pending = assert.rejects(
    runtime.fetch("https://api.invalid/v1/me"),
    /cancelled or timed out/,
  );
  t.mock.timers.tick(500);
  await pending;
  t.mock.timers.tick(1000);
  await Promise.resolve();
  assert.equal(calls, 0);
  assert.equal(runtime.pendingRequests, 0);
  assert.equal(runtime.diagnostics[0].outcome, "cancelled");
});
test("changing development configuration cancels pending requests even if a transport ignores abort", async () => {
  let complete!: (r: Response) => void;
  const runtime = createDevelopmentRuntime(
    true,
    defaults(),
    (() =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      })) as typeof fetch,
  );
  const rejected = assert.rejects(
    runtime.fetch("https://api.invalid/v1/me"),
    /cancelled/,
  );
  runtime.lock();
  await rejected;
  assert.equal(runtime.locked, true);
  assert.equal(runtime.pendingRequests, 0);
  await assert.rejects(
    runtime.fetch("https://api.invalid/v1/me"),
    /servers are changing/,
  );
  complete(new Response("late private reply"));
  await Promise.resolve();
  assert.equal(runtime.diagnostics.length, 1);
  assert.equal(runtime.diagnostics[0].outcome, "cancelled");
  assert.throws(() => runtime.configure(defaults()));
  runtime.unlock();
  runtime.configure({ ...defaults(), offline: true });
  await assert.rejects(runtime.fetch("https://api.invalid/v1/me"), /offline/);
});
test("caller cancellation is forwarded and development diagnostics stay bounded and immutable", async () => {
  let calls = 0;
  const runtime = createDevelopmentRuntime(true, defaults(), (async () => {
    calls++;
    return new Response("ok");
  }) as typeof fetch);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runtime.fetch("https://api.invalid/v1/me", { signal: controller.signal }),
    /cancelled/,
  );
  assert.equal(calls, 0);
  for (let i = 0; i < 105; i++)
    await runtime.fetch("https://api.invalid/v1/health");
  assert.equal(runtime.diagnostics.length, 100);
  const copy = runtime.settings;
  copy.endpoints.INTL = "http://other.invalid";
  assert.equal(runtime.settings.endpoints.INTL, defaults().endpoints.INTL);
  const log = runtime.diagnostics;
  log[0].category = "changed";
  assert.equal(runtime.diagnostics[0].category, "health");
  runtime.clearDiagnostics();
  assert.deepEqual(runtime.diagnostics, []);
});
function buildConfig(extra: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const k of [
    "EXPO_PUBLIC_DEV_TOOLS",
    "CUBERS_APP_ATTEST_ENV",
    "EAS_BUILD_PROFILE",
  ])
    delete env[k];
  return execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      "process.stdout.write(JSON.stringify(require('./apps/mobile/app.config.ts').default))",
    ],
    {
      env: { ...env, ...extra },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20000,
    },
  );
}
test("real app configuration keeps production identity and network policy while development gets a separate ID", () => {
  const production = JSON.parse(
    buildConfig({
      EXPO_PUBLIC_DEV_TOOLS: "false",
      EAS_BUILD_PROFILE: "production-intl",
    }),
  );
  assert.equal(production.ios.bundleIdentifier, "app.cubers.mobile");
  assert.equal(production.android.package, "app.cubers.mobile");
  assert.equal(production.ios.infoPlist.NSAppTransportSecurity, undefined);
  assert.equal(
    production.ios.infoPlist.NSLocalNetworkUsageDescription,
    undefined,
  );
  assert.ok(
    !production.plugins.includes("./plugins/with-development-tools.js"),
  );
  const development = JSON.parse(
    buildConfig({
      EXPO_PUBLIC_DEV_TOOLS: "true",
      EAS_BUILD_PROFILE: "development-standalone",
    }),
  );
  assert.equal(development.ios.bundleIdentifier, "app.cubers.mobile.dev");
  assert.equal(development.android.package, "app.cubers.mobile.dev");
  assert.equal(
    development.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads,
    true,
  );
  assert.ok(
    development.plugins.includes("./plugins/with-development-tools.js"),
  );
  assert.deepEqual(production, JSON.parse(buildConfig()));
});
test("production profiles and production App Attest cannot opt into development tools", () => {
  for (const extra of [
    { EAS_BUILD_PROFILE: "production-intl" },
    { EAS_BUILD_PROFILE: "production-cn" },
    { CUBERS_APP_ATTEST_ENV: "production" },
  ])
    assert.throws(
      () => buildConfig({ EXPO_PUBLIC_DEV_TOOLS: "true", ...extra }),
      /Command failed/,
    );
  assert.throws(
    () => buildConfig({ EXPO_PUBLIC_DEV_TOOLS: "yes" }),
    /Command failed/,
  );
});
