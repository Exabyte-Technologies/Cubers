import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { FreeIpCountry } from "../apps/api/src/freeip-country";
import {
  CommunityRegion,
  regionalAccessExempt,
} from "../apps/api/src/community-region";
import type { Config } from "../apps/api/src/config";
const config = { NODE_ENV: "production", REGION: "INTL" } as Config;
const reply = (ipAddress: string, countryCode = "US") => ({
  ipAddress,
  countryCode,
  ipVersion: ipAddress.includes(":") ? 6 : 4,
  cityName: "Ignored",
  latitude: 1,
});
test("FreeIPAPI validates the queried address, country and address family and returns only country", async () => {
  for (const address of [
    "114.114.114.114",
    "2400:3200::1",
    "::ffff:114.114.114.114",
  ]) {
    const service = new FreeIpCountry(async (ip) => reply(ip, "CN"));
    assert.equal(await service.country(address), "CN");
  }
  for (const invalid of [
    reply("1.1.1.1"),
    reply("8.8.8.8", "ZZ"),
    reply("8.8.8.8", "QQ"),
    { ...reply("8.8.8.8"), ipVersion: 6 },
    null,
    [],
  ]) {
    await assert.rejects(
      new FreeIpCountry(async () => invalid).country("8.8.8.8"),
      /unavailable/,
    );
  }
});
test("private, malformed, multicast and mapped-private addresses never reach the vendor", async () => {
  let calls = 0;
  const service = new FreeIpCountry(async () => {
    calls++;
    return reply("8.8.8.8");
  });
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "224.0.0.1",
    "fe80::1",
    "not-ip",
    "8.8.8.8/32",
  ])
    await assert.rejects(service.country(ip));
  assert.equal(calls, 0);
});
test("same-IP concurrent lookups coalesce, discard extra location data and expire without stale acceptance", async () => {
  let now = 0,
    calls = 0,
    fail = false;
  const service = new FreeIpCountry(
    async (ip) => {
      calls++;
      if (fail) throw Error("down");
      return reply(ip);
    },
    () => now,
  );
  assert.deepEqual(
    await Promise.all(
      Array.from({ length: 20 }, () => service.country("8.8.8.8")),
    ),
    Array(20).fill("US"),
  );
  assert.equal(calls, 1);
  assert.equal(await service.country("::ffff:8.8.8.8"), "US");
  assert.equal(calls, 1);
  now = 300001;
  fail = true;
  await assert.rejects(service.country("8.8.8.8"));
  await assert.rejects(service.country("8.8.8.8"));
  assert.equal(calls, 2);
  now += 5001;
  fail = false;
  assert.equal(await service.country("8.8.8.8"), "US");
  assert.equal(calls, 3);
});
test("outbound admission respects the documented ten-in-ten-second free allowance", async () => {
  let now = 0,
    calls = 0;
  const service = new FreeIpCountry(
    async (ip) => {
      calls++;
      return reply(ip);
    },
    () => now,
  );
  for (let n = 1; n <= 10; n++) await service.country(`8.8.8.${n}`);
  await assert.rejects(service.country("8.8.8.11"), /capacity/);
  assert.equal(calls, 10);
  now = 10001;
  assert.equal(await service.country("8.8.8.11"), "US");
  assert.equal(calls, 11);
});
test("production rejects a wrong community or unavailable lookup instead of falling back to International", async () => {
  const service = new CommunityRegion(config, { country: async () => "CN" });
  const detection = await service.detect("114.114.114.114");
  assert.equal(detection.region, "CN");
  assert.equal(detection.serverRegion, "INTL");
  assert.equal(detection.provider, "FreeIPAPI");
  assert.equal(JSON.stringify(detection).includes("114.114"), false);
  await assert.rejects(
    service.requireMatchingConnection("114.114.114.114"),
    (e: any) =>
      e.getStatus() === 409 && e.getResponse().code === "COMMUNITY_CHANGED",
  );
  const down = new CommunityRegion(config, {
    country: async () => {
      throw Error("down");
    },
  });
  await assert.rejects(
    down.detect("8.8.8.8"),
    (e: any) => e.getStatus() === 503,
  );
});
test("development uses only its server setting, defaulting to International, without vendor lookup", async () => {
  let calls = 0;
  const lookup = {
    country: async () => {
      calls++;
      return "CN";
    },
  };
  for (const NODE_ENV of ["development", "test"] as const) {
    const service = new CommunityRegion({ ...config, NODE_ENV }, lookup);
    for (const ip of ["114.114.114.114", "127.0.0.1", undefined]) {
      assert.equal((await service.detect(ip)).region, "INTL");
      assert.equal((await service.detect(ip)).source, "development");
    }
  }
  assert.equal(calls, 0);
  assert.equal(
    (
      await new CommunityRegion(
        { ...config, NODE_ENV: "test", REGION: "CN" },
        lookup,
      ).detect("8.8.8.8")
    ).region,
    "CN",
  );
});
test("region-independent access is limited to exact public discovery, legal, recovery and erasure routes", () => {
  for (const [method, path] of [
    ["GET", "/v1/community-region"],
    ["GET", "/v1/legal/privacy"],
    ["POST", "/v1/auth/deletion-login"],
    ["DELETE", "/v1/me"],
  ])
    assert.equal(regionalAccessExempt(method, path), true);
  for (const [method, path] of [
    ["GET", "/v1/me"],
    ["GET", "/v1/me/export"],
    ["DELETE", "/v1/me/export"],
    ["POST", "/v1/auth/login"],
    ["POST", "/v1/auth/register"],
    ["GET", "/v1/admin/users"],
    ["GET", "/v1/legal/privacy/private"],
  ])
    assert.equal(regionalAccessExempt(method, path), false);
});
