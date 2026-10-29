import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedOrigin,
  clientIp,
  privateAddress,
  proxyTrust,
} from "../apps/api/src/network-security";
import { resolveAiEndpoint, pinnedLookup } from "../apps/api/src/ai";
import { passwordMatches } from "../apps/api/src/crypto";
import type { IncomingMessage } from "node:http";
import type { lookup } from "node:dns/promises";
const config = {
  NODE_ENV: "test",
  AI_MODE: "live",
  REGION: "INTL",
  AI_ALLOWED_HOSTS: "ai.example",
  AI_CN_APPROVED_HOSTS: "",
} as const;
test("AI destinations reject reserved, mapped, transition and malformed IPv4/IPv6 addresses", () => {
  for (const address of [
    "0.0.0.0",
    "100.64.0.1",
    "198.18.0.1",
    "192.88.99.1",
    "192.0.2.1",
    "240.0.0.1",
    "::ffff:8.8.8.8",
    "2001::1",
    "2002:0808:0808::1",
    "2001:db8::1",
    "64:ff9b::808:808",
    "fe80::1",
    "fc00::1",
    "not-an-ip",
  ])
    assert.equal(privateAddress(address), true, address);
  for (const address of ["8.8.8.8", "2606:4700:4700::1111"])
    assert.equal(privateAddress(address), false, address);
});
test("AI connection pins the validated DNS result and retains the original hostname", async () => {
  let calls = 0;
  const resolver = (async () => {
    calls++;
    return [{ address: calls === 1 ? "8.8.8.8" : "127.0.0.1", family: 4 }];
  }) as unknown as typeof lookup;
  const endpoint = await resolveAiEndpoint(
    "https://ai.example/v1",
    config,
    resolver,
  );
  const lookupPinned = pinnedLookup(endpoint);
  lookupPinned("ai.example", {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, "8.8.8.8");
    assert.equal(family, 4);
  });
  lookupPinned("ai.example", { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]);
  });
  lookupPinned("metadata.internal", {}, (error) => assert.ok(error));
  assert.equal(calls, 1);
  assert.equal(endpoint.url.hostname, "ai.example");
});
test("mixed public/private DNS and poisoned localhost are rejected before connecting", async () => {
  const resolver = (async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]) as unknown as typeof lookup;
  await assert.rejects(
    resolveAiEndpoint("https://ai.example/v1", config, resolver),
    /private/,
  );
  const poisoned = (async () => [
    { address: "8.8.8.8", family: 4 },
  ]) as unknown as typeof lookup;
  await assert.rejects(
    resolveAiEndpoint(
      "http://localhost:4010/v1",
      { ...config, AI_MODE: "mock" },
      poisoned,
    ),
    /private/,
  );
});
test("only explicit trusted proxies can supply forwarded client addresses", () => {
  const request = {
    socket: { remoteAddress: "::ffff:172.30.70.2" },
    headers: { "x-forwarded-for": "10.0.0.99, 198.51.100.7" },
  } as unknown as IncomingMessage;
  assert.equal(clientIp(request, ""), "172.30.70.2");
  assert.equal(clientIp(request, "172.30.70.2/32"), "198.51.100.7");
  assert.throws(() => proxyTrust("0.0.0.0/0"));
  assert.throws(() => proxyTrust("loopback"));
});
test("browser origin checks allow approved origins and native clients, rejecting null and deceptive hosts", () => {
  const allowed = ["https://app.example"];
  assert.ok(allowedOrigin(undefined, allowed));
  assert.ok(allowedOrigin("https://app.example", allowed));
  for (const origin of [
    "null",
    "https://app.example.evil",
    "http://app.example",
    ["https://app.example"],
  ])
    assert.equal(allowedOrigin(origin, allowed), false);
});
test("malformed password encodings fail closed without invoking the expensive password derivation", async () => {
  for (const encoded of [
    "",
    "scrypt:x:00",
    "other:" + "a".repeat(32) + ":" + "b".repeat(128),
    "scrypt:" + "a".repeat(32) + ":" + "b".repeat(128) + ":extra",
  ])
    assert.equal(await passwordMatches("test", encoded), false);
});
test("password derivation bounds concurrent memory use and recovers after saturation", async () => {
  const { passwordHash } = await import("../apps/api/src/crypto");
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => passwordHash("local-test-password")),
  );
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 4);
  for (const row of results.filter((row) => row.status === "rejected"))
    assert.equal((row as PromiseRejectedResult).reason.getStatus(), 429);
  assert.equal(
    await passwordMatches(
      "local-test-password",
      await passwordHash("local-test-password"),
    ),
    true,
  );
});
