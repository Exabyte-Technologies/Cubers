import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const names = [
  "EXPO_PUBLIC_REGION",
  "EXPO_PUBLIC_API_URL_INTL",
  "EXPO_PUBLIC_API_URL_CN",
  "EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL",
  "EXPO_PUBLIC_DEV_TOOLS",
];
function actualMetroCache(overrides: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const name of names) delete env[name];
  Object.assign(env, {
    NODE_ENV: "production",
    EXPO_NO_DOTENV: "1",
    EXPO_NO_CLIENT_ENV_VARS: "0",
    EXPO_NO_TELEMETRY: "1",
    ...overrides,
  });
  const output = execFileSync(
    process.execPath,
    [
      "-e",
      `const config=require(${JSON.stringify(resolve("apps/mobile/metro.config.js"))});process.stdout.write(String.fromCharCode(10)+'CUBERS_CACHE:'+JSON.stringify(config.cacheVersion));`,
    ],
    { env, encoding: "utf8", timeout: 20000, maxBuffer: 128 * 1024 },
  );
  const value = output.match(/\nCUBERS_CACHE:("[^\n]+")$/);
  assert.ok(value, "Read the real installed Expo/Metro configuration");
  return JSON.parse(value[1]) as string;
}

test("real Metro configuration separates public region/address transforms, including empty versus absent", () => {
  const baseline = actualMetroCache();
  assert.match(baseline, /:cubers-[a-f0-9]{64}$/);
  for (const name of names) {
    const value =
      name === "EXPO_PUBLIC_REGION"
        ? "CN"
        : name === "EXPO_PUBLIC_DEV_TOOLS"
          ? "true"
          : "https://changed.example.invalid";
    assert.notEqual(actualMetroCache({ [name]: value }), baseline, name);
    assert.notEqual(
      actualMetroCache({ [name]: "" }),
      baseline,
      name + " empty",
    );
  }
});

test("real Metro configuration excludes private provider/session values from the public cache key", () => {
  assert.equal(
    actualMetroCache({
      OPENAI_API_KEY: "synthetic-private-openai",
      QWEN_API_KEY: "synthetic-private-qwen",
      AI_API_KEY: "synthetic-private-provider",
      SESSION_TOKEN: "synthetic-private-session",
    }),
    actualMetroCache(),
  );
});
