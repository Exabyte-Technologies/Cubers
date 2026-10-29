import test from "node:test";
import assert from "node:assert/strict";
import {
  AnnouncementContent,
  AnnouncementCreate,
  AnnouncementEdit,
  AnnouncementPublish,
  AnnouncementPreview,
  AnnouncementDetail,
  AnnouncementsPage,
} from "@cubers/core";
const content = () => ({
  kind: "learning",
  title: { en: "A new practice", zh: "新的练习" },
  summary: { en: "Try a checkpoint", zh: "尝试一个检查点" },
  body: {
    en: "Keep your reference.\nPractice slowly.",
    zh: "保持参照方向。\n慢慢练习。",
  },
  startsAt: "2026-10-19T00:00:00.000Z",
  endsAt: "2026-10-20T00:00:00.000Z",
  courseId: "3-notation",
});
test("announcement drafts require bounded bilingual plain text, valid windows and learning-only lesson actions", () => {
  assert.equal(
    AnnouncementContent.parse(content()).body.zh.split("\n").length,
    2,
  );
  for (const patch of [
    { title: { en: "Missing Chinese", zh: "" } },
    { body: { en: "a\u0000b", zh: "正常正文" } },
    { title: { en: "x".repeat(121), zh: "标题" } },
    { endsAt: content().startsAt },
    { endsAt: "2027-10-19T00:00:00.000Z" },
    { kind: "service" },
    { destination: "https://example.org/" },
  ])
    assert.equal(
      AnnouncementContent.safeParse({ ...content(), ...patch }).success,
      false,
    );
  assert.ok(
    AnnouncementCreate.safeParse({
      content: content(),
      reason: "Original bilingual teaching update",
    }).success,
  );
  assert.equal(
    AnnouncementCreate.safeParse({
      content: content(),
      reason: "short",
      published: true,
    }).success,
    false,
  );
  assert.equal(
    AnnouncementEdit.safeParse({
      content: content(),
      reason: "Explain a valid edit",
      expectedVersion: 0,
    }).success,
    false,
  );
});
test("publishing is an explicit version-bound review and withdrawal does not accept approval shortcuts", () => {
  const approved = {
    expectedVersion: 1,
    published: true,
    englishReviewed: true,
    chineseReviewed: true,
    rightsConfirmed: true,
    serviceOrLearningOnly: true,
    courseVersion: 3,
    reason: "Both languages and original rights reviewed",
  };
  assert.ok(AnnouncementPublish.safeParse(approved).success);
  for (const field of [
    "englishReviewed",
    "chineseReviewed",
    "rightsConfirmed",
    "serviceOrLearningOnly",
  ])
    assert.equal(
      AnnouncementPublish.safeParse({ ...approved, [field]: false }).success,
      false,
    );
  assert.equal(
    AnnouncementPublish.safeParse({ ...approved, expectedVersion: 0 }).success,
    false,
  );
  assert.equal(
    AnnouncementPublish.safeParse({
      ...approved,
      destination: "https://example.org",
    }).success,
    false,
  );
  assert.ok(
    AnnouncementPublish.safeParse({
      expectedVersion: 2,
      published: false,
      reason: "Withdraw this version for correction",
    }).success,
  );
});
test("public announcement contracts exclude staff metadata and bound leases, pages and cursors", () => {
  const c = content(),
    card = {
      id: "11111111-1111-4111-8111-111111111111",
      version: 2,
      kind: "learning",
      title: c.title,
      summary: c.summary,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      validForMs: 30_000,
    };
  assert.ok(AnnouncementPreview.safeParse(card).success);
  for (const patch of [
    { body: c.body },
    { reviewedAt: c.startsAt },
    { actorId: card.id },
    { validForMs: 0 },
    { validForMs: 30001 },
  ])
    assert.equal(
      AnnouncementPreview.safeParse({ ...card, ...patch }).success,
      false,
    );
  assert.ok(
    AnnouncementDetail.safeParse({
      ...card,
      body: c.body,
      courseId: c.courseId,
    }).success,
  );
  assert.ok(
    AnnouncementsPage.safeParse({
      items: Array(10).fill(card),
      nextCursor: "a".repeat(43),
    }).success,
  );
  assert.equal(
    AnnouncementsPage.safeParse({
      items: Array(11).fill(card),
      nextCursor: null,
    }).success,
    false,
  );
  assert.equal(
    AnnouncementsPage.safeParse({ items: [], nextCursor: "foreign" }).success,
    false,
  );
});
