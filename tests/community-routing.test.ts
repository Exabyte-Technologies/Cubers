import test from "node:test";
import assert from "node:assert/strict";
import { CommunityDetection } from "@cubers/core";
import {
  detectCommunity,
  communityEndpoint,
} from "../apps/mobile/src/community-routing";
const detected = (
  region: "CN" | "INTL",
  serverRegion: "CN" | "INTL" = region,
) => ({
  region,
  serverRegion,
  source: "ip",
  country: region === "CN" ? "CN" : "US",
  provider: "FreeIPAPI",
  attribution: {
    label: "IP Geolocation by FreeIPAPI",
    url: "https://freeipapi.com",
  },
});
test("community contracts reject absent countries, inconsistent regions and fictitious country codes", () => {
  for (const value of [
    { ...detected("CN"), country: undefined },
    { ...detected("CN"), country: "US" },
    { ...detected("INTL"), country: "CN" },
    ...["ZZ", "XX", "EU", "AP"].map((country) => ({
      ...detected("INTL"),
      country,
    })),
    { ...detected("CN"), source: "development" },
    { ...detected("CN", "INTL"), country: undefined, source: "development" },
    { ...detected("INTL"), provider: "untrusted" },
  ])
    assert.equal(CommunityDetection.safeParse(value).success, false);
  assert.equal(
    CommunityDetection.safeParse(detected("CN", "INTL")).success,
    true,
  );
});
test("automatic community routing uses only configured origins and sends no credentials during discovery", async () => {
  const requests: any[] = [];
  const fetcher = (async (url: any, options: any) => {
    requests.push({ url, options });
    return new Response(
      JSON.stringify(detected("CN", requests.length === 1 ? "INTL" : "CN")),
    );
  }) as typeof fetch;
  const result = await detectCommunity(
    {
      discovery: "https://discovery.cubers.test",
      CN: "https://cn.cubers.test",
      INTL: "https://intl.cubers.test",
    },
    false,
    fetcher,
  );
  assert.equal(result.region, "CN");
  assert.deepEqual(
    requests.map((r) => r.url),
    [
      "https://discovery.cubers.test/v1/community-region",
      "https://cn.cubers.test/v1/community-region",
    ],
  );
  for (const { options } of requests) {
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.body, undefined);
    assert.equal(options.headers.Authorization, undefined);
  }
});
test("routing refuses unconfigured, insecure and response-supplied regional destinations", async () => {
  assert.throws(() => communityEndpoint({}, "CN", false), /not configured/);
  for (const value of [
    "http://cn.cubers.test",
    "https://user:password@cn.cubers.test",
    "https://cn.cubers.test?target=x",
    "https://cn.cubers.test/path",
  ])
    assert.throws(
      () => communityEndpoint({ CN: value }, "CN", false),
      /Invalid/,
    );
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response(
      JSON.stringify({ ...detected("CN"), apiUrl: "https://attacker.invalid" }),
    );
  }) as typeof fetch;
  await assert.rejects(() =>
    detectCommunity(
      {
        discovery: "https://discovery.cubers.test",
        CN: "https://cn.cubers.test",
      },
      false,
      fetcher,
    ),
  );
  assert.equal(calls, 1);
});
test("a network or deployment region change aborts routing before any account request", async () => {
  let calls = 0;
  const fetcher = (async () =>
    new Response(
      JSON.stringify(++calls === 1 ? detected("CN", "INTL") : detected("INTL")),
    )) as typeof fetch;
  await assert.rejects(
    () =>
      detectCommunity(
        {
          discovery: "https://discovery.cubers.test",
          CN: "https://cn.cubers.test",
        },
        false,
        fetcher,
      ),
    /Community changed/,
  );
  assert.equal(calls, 2);
});
test("loopback fallback is allowed only in development and production requires discovery configuration", async () => {
  const data = { ...detected("INTL"), source: "development" };
  delete (data as any).country;
  const fetcher = (async () =>
    new Response(JSON.stringify(data))) as typeof fetch;
  assert.equal(
    (await detectCommunity({}, true, fetcher)).source,
    "development",
  );
  await assert.rejects(
    () =>
      detectCommunity(
        {
          discovery: "https://discovery.cubers.test",
          INTL: "https://intl.cubers.test",
        },
        false,
        fetcher,
      ),
    /could not be located/,
  );
  await assert.rejects(
    () => detectCommunity({}, false, fetcher),
    /not configured/,
  );
});
