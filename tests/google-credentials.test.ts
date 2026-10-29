import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
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
import { googleCredentials } from "../apps/api/src/attestation/google-credentials";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const source = () => ({
  type: "service_account",
  project_id: "cubers-synthetic",
  client_email: "verification@cubers-synthetic.iam.gserviceaccount.com",
  private_key_id: "a".repeat(40),
  private_key: key.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
  token_uri: "https://oauth2.googleapis.com/token",
});
test("Google credential loader validates private files and the official SDK signs only the fixed Play scope", async () => {
  const dir = await realpath(
      await mkdtemp(join(tmpdir(), "cubers-google-test-")),
    ),
    path = join(dir, "credential.json");
  try {
    await writeFile(path, JSON.stringify(source()), { mode: 0o600 });
    const loaded = await googleCredentials(path);
    assert.equal(loaded.projectId, "cubers-synthetic");
    assert.match(loaded.fingerprint, /^[a-f0-9]{64}$/);
    const defaults = loaded.client.transporter.defaults;
    assert.equal(defaults.timeout, 4000);
    assert.equal(defaults.maxRedirects, 0);
    assert.equal(defaults.retry, false);
    let calls = 0;
    loaded.client.transporter.request = (async (options: any) => {
      calls++;
      assert.equal(options.url, "https://oauth2.googleapis.com/token");
      const assertion = options.data.get("assertion"),
        [head, body, signature] = assertion.split(".");
      assert.ok(
        verify(
          "sha256",
          Buffer.from(head + "." + body),
          key.publicKey,
          Buffer.from(signature, "base64url"),
        ),
      );
      const claims = JSON.parse(Buffer.from(body, "base64url").toString());
      assert.equal(
        claims.scope,
        "https://www.googleapis.com/auth/playintegrity",
      );
      assert.equal(claims.iss, source().client_email);
      assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
      return {
        data: {
          access_token: "synthetic-no-provider-token",
          expires_in: 3600,
          token_type: "Bearer",
        },
      };
    }) as any;
    assert.equal(
      (await loaded.client.getAccessToken()).token,
      "synthetic-no-provider-token",
    );
    assert.equal(
      (await loaded.client.getAccessToken()).token,
      "synthetic-no-provider-token",
    );
    assert.equal(calls, 1);
    const failed = await googleCredentials(path);
    let attempts = 0;
    failed.client.transporter.defaults.adapter = async (options: any) => {
      attempts++;
      assert.equal(options.retryConfig.retry, 0);
      assert.equal(options.maxRedirects, 0);
      assert.equal(options.timeout, 4000);
      assert.equal(options.maxContentLength, 65536);
      return {
        data: { error: "synthetic unavailable" },
        status: 503,
        statusText: "Unavailable",
        headers: new Headers(),
        config: options,
      } as any;
    };
    await assert.rejects(failed.client.getAccessToken());
    assert.equal(
      attempts,
      1,
      "A failed OAuth POST must not be retried by SDK defaults",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Google credentials refuse public files, aliases and external credential configurations", async () => {
  const dir = await realpath(
      await mkdtemp(join(tmpdir(), "cubers-google-test-")),
    ),
    path = join(dir, "credential.json");
  try {
    await writeFile(path, JSON.stringify(source()), { mode: 0o600 });
    await chmod(path, 0o644);
    await assert.rejects(googleCredentials(path), /unavailable/);
    await chmod(path, 0o600);
    await symlink(path, join(dir, "alias"));
    await assert.rejects(googleCredentials(join(dir, "alias")), /unavailable/);
    await link(path, join(dir, "hard"));
    await assert.rejects(googleCredentials(path), /unavailable/);
    await rm(join(dir, "hard"));
    for (const change of [
      {
        ...source(),
        type: "external_account",
        credential_source: { url: "http://127.0.0.1/secret" },
      },
      { ...source(), token_uri: "https://example.invalid/token" },
      { ...source(), universe_domain: "example.invalid" },
    ]) {
      await writeFile(path, JSON.stringify(change));
      await assert.rejects(googleCredentials(path), /unavailable/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Google provider configuration is explicit, scope-bound and never activates the mainland service", async () => {
  const { readConfig } = await import("../apps/api/src/config");
  const { PlayIntegrityProvider } =
    await import("../apps/api/src/attestation/google-provider");
  const dir = await realpath(
      await mkdtemp(join(tmpdir(), "cubers-google-test-")),
    ),
    path = join(dir, "credential.json");
  const base = {
    DATABASE_URL: "postgresql://unused/unused",
    REDIS_URL: "redis://127.0.0.1:1",
    S3_ENDPOINT: "http://127.0.0.1:1",
    S3_REGION: "unused",
    S3_BUCKET: "unused",
    S3_ACCESS_KEY: "unused",
    S3_SECRET_KEY: "unused",
  };
  try {
    const disabled = new PlayIntegrityProvider({
      config: readConfig(base),
    } as any);
    await disabled.onModuleInit();
    assert.equal(disabled.available(), false);
    assert.throws(
      () => readConfig({ ...base, APP_ATTESTATION_GOOGLE_ENABLED: "true" }),
      /Google app verification requires/,
    );
    await writeFile(path, JSON.stringify(source()), { mode: 0o600 });
    const config = readConfig({
      ...base,
      APP_ATTESTATION_GOOGLE_ENABLED: "true",
      APP_ATTESTATION_GOOGLE_PROJECT_NUMBER: "123456789012",
      APP_ATTESTATION_GOOGLE_PACKAGE: "app.cubers.mobile",
      APP_ATTESTATION_GOOGLE_SIGNERS: Buffer.alloc(32, 7).toString("base64url"),
      APP_ATTESTATION_GOOGLE_BUILDS: "42",
      APP_ATTESTATION_GOOGLE_CREDENTIAL_FILE: path,
    });
    const provider = new PlayIntegrityProvider({ config } as any);
    await provider.onModuleInit();
    assert.equal(provider.available(), true);
    const slots = Array.from({ length: 4 }, () => provider.reserve());
    assert.throws(() => provider.reserve());
    slots[0]();
    slots[0]();
    const replacement = provider.reserve();
    replacement();
    for (const release of slots) release();
    config.APP_ATTESTATION_GOOGLE_BUILDS = "43";
    assert.equal(provider.available(), false);
    const mainland = new PlayIntegrityProvider({
      config: {
        ...config,
        REGION: "CN",
        CN_GAMES_APPROVED: "true",
        APP_ATTESTATION_CN_APPROVED: "true",
      },
    } as any);
    await assert.rejects(mainland.onModuleInit(), /not commissioned/);
    assert.equal(mainland.available(), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
