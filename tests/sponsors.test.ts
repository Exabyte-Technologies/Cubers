import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CampaignContent,
  CampaignCreate,
  CampaignReview,
  SponsorDestination,
  SponsorCard,
  SponsorCards,
  campaignArchiveExpiry,
} from "@cubers/core";
const content = {
  title: { en: "Cube class", zh: "魔方课堂" },
  summary: { en: "A cubing lesson", zh: "一节魔方体验课" },
  category: "cubing-education",
  destination: "https://example.org/cubing",
  startsAt: "2026-10-18T00:00:00.000Z",
  endsAt: "2026-10-19T00:00:00.000Z",
};
test("sponsor destinations reject credentials, local/IP endpoints, tracking parameters and malformed schemes without fetching", () => {
  assert.equal(
    SponsorDestination.parse("https://EXAMPLE.org:443/cubing"),
    "https://example.org/cubing",
  );
  for (const url of [
    "not a url",
    "javascript:alert(1)",
    "http://example.org",
    "https://user:pass@example.org",
    "https://127.0.0.1",
    "https://2130706433",
    "https://[::1]",
    "https://foo.local",
    "https://foo.test",
    "https://example.org:444",
    "https://example.org/?user=1",
    "https://example.org/#fragment",
    "https://example.org/\npath",
  ])
    assert.equal(SponsorDestination.safeParse(url).success, false, url);
});
test("campaigns require bounded bilingual cubing copy, valid schedules and explicit advertiser/destination review", () => {
  assert.equal(CampaignContent.safeParse(content).success, true);
  for (const value of [
    { ...content, title: { en: "Cube class", zh: "" } },
    { ...content, summary: { ...content.summary, en: "hi\nthere" } },
    { ...content, category: "medical" },
    { ...content, endsAt: content.startsAt },
    { ...content, endsAt: "2030-01-01T00:00:00.000Z" },
  ])
    assert.equal(CampaignContent.safeParse(value).success, false);
  assert.equal(
    CampaignCreate.safeParse({ content, reason: "Reviewed original draft" })
      .success,
    true,
  );
  const review = {
    expectedVersion: 1,
    decision: "approve",
    archiveReference: "REGISTER/2026/001",
    advertiserRecordReviewed: true,
    destinationReviewed: true,
    bilingualReviewed: true,
    reason: "Reviewed advertiser register",
  };
  assert.equal(CampaignReview.safeParse(review).success, true);
  assert.equal(
    CampaignReview.safeParse({ ...review, destinationReviewed: false }).success,
    false,
  );
  assert.equal(
    CampaignReview.safeParse({
      ...review,
      archiveReference: "https://example.org/private",
    }).success,
    false,
  );
});
test("campaign archive minimum covers three UTC calendar years including leap days and late changes", () => {
  assert.equal(
    campaignArchiveExpiry(
      new Date("2028-02-29T12:00:00Z"),
      new Date("2026-01-01T00:00:00Z"),
    ).toISOString(),
    "2031-03-01T12:00:00.000Z",
  );
  assert.equal(
    campaignArchiveExpiry(
      new Date("2020-01-01T00:00:00Z"),
      new Date("2026-10-18T00:00:00Z"),
    ).toISOString(),
    "2029-10-18T00:00:00.000Z",
  );
});
test("public ad cards contain no archive/identity fields and have bounded short leases", () => {
  const card = {
    id: "11111111-1111-4111-8111-111111111111",
    version: 1,
    title: content.title,
    summary: content.summary,
    destination: content.destination,
    endsAt: content.endsAt,
    validForMs: 30000,
  };
  assert.equal(SponsorCard.safeParse(card).success, true);
  for (const value of [
    { ...card, archiveReference: "PRIVATE" },
    { ...card, userId: "PRIVATE" },
    { ...card, validForMs: 0 },
    { ...card, validForMs: 30001 },
  ])
    assert.equal(SponsorCard.safeParse(value).success, false);
  assert.equal(
    SponsorCards.safeParse(Array.from({ length: 4 }, () => card)).success,
    false,
  );
});

test("reviewed destinations remain exact under React Native-style URL normalization", () => {
  const original = globalThis.URL;
  try {
    globalThis.URL = class extends original {
      get href() {
        return super.href.endsWith("/") ? super.href : super.href + "/";
      }
    } as typeof URL;
    assert.equal(
      SponsorDestination.parse("https://EXAMPLE.org:443/cubing"),
      "https://example.org/cubing",
    );
    assert.equal(
      SponsorDestination.safeParse("https://user@example.org/cubing").success,
      false,
    );
    for (const path of ["/a/../b", "/%2e%2e/secret", "/%0a", "/%5c", "/%zz"])
      assert.equal(
        SponsorDestination.safeParse("https://example.org" + path).success,
        false,
      );
  } finally {
    globalThis.URL = original;
  }
});
