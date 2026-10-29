import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  AchievementCatalog,
  PrepareAchievementCard,
  CardApproval,
  CardExport,
  CardImage,
} from "@cubers/core";
import {
  achievementCardSvg,
  renderAchievementCard,
} from "../apps/api/src/achievement-card-image";
test("card contracts reject forged claims and unchecked or unbound disclosures", () => {
  const prep = {
    achievementId: "first-checkpoint",
    locale: "en",
    includeName: false,
    disclosureConfirmed: true,
  };
  assert.equal(PrepareAchievementCard.safeParse(prep).success, true);
  for (const value of [
    { ...prep, score: 1000 },
    { ...prep, achievementId: "world-champion" },
    { ...prep, name: "Injected" },
    { ...prep, disclosureConfirmed: false },
  ])
    assert.equal(PrepareAchievementCard.safeParse(value).success, false);
  const approval = {
    revision: 1,
    imageDigest: "a".repeat(64),
    approve: true,
    imageChecked: true,
    reason: "",
  };
  assert.equal(CardApproval.safeParse(approval).success, true);
  assert.equal(
    CardApproval.safeParse({ ...approval, imageChecked: false }).success,
    false,
  );
  assert.equal(
    CardApproval.safeParse({ ...approval, approve: false }).success,
    false,
  );
  assert.equal(
    CardExport.safeParse({
      revision: 1,
      imageDigest: "a".repeat(64),
      disclosureConfirmed: true,
    }).success,
    true,
  );
  assert.equal(
    CardExport.safeParse({
      revision: 1,
      imageDigest: "wrong",
      disclosureConfirmed: true,
    }).success,
    false,
  );
});
test("card SVG uses escaped bounded labels and never accepts external SVG syntax", () => {
  const image = achievementCardSvg("first-checkpoint", "en", '<script>"&');
  assert.equal(image.includes("<script>"), false);
  assert.equal(image.includes("&lt;script&gt;"), true);
  assert.equal(image.includes("&quot;&amp;"), true);
  assert.equal(image.includes("href="), false);
  for (const label of ["name\nother", "name\u202Eother", "a".repeat(41)])
    assert.throws(() => achievementCardSvg("first-checkpoint", "en", label));
});
test("all bilingual cards render fixed PNGs without identifying metadata; identical content keeps its review digest", async () => {
  for (const item of AchievementCatalog)
    for (const locale of ["en", "zh"]) {
      const result = await renderAchievementCard(item.id, locale, null);
      const metadata = await sharp(result.image).metadata();
      assert.equal(metadata.width, 1200);
      assert.equal(metadata.height, 1500);
      assert.equal(metadata.format, "png");
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.xmp, undefined);
      assert.ok(result.image.length < 500000);
    }
  const first = await renderAchievementCard("first-checkpoint", "zh", null),
    again = await renderAchievementCard("first-checkpoint", "zh", null);
  assert.equal(first.imageDigest, again.imageDigest);
  const preview = await renderAchievementCard(
    "first-checkpoint",
    "zh",
    null,
    true,
  );
  assert.equal(preview.cleanDigest, first.imageDigest);
  assert.notEqual(preview.imageDigest, first.imageDigest);
  const packet = CardImage.parse({
    cardId: "10000000-0000-4000-8000-000000000001",
    imageDigest: preview.imageDigest,
    approvalDigest: first.imageDigest,
    watermarked: true,
    base64: preview.image.toString("base64"),
    mime: "image/png",
    filename: "cubers-milestone.png",
    width: 1200,
    height: 1500,
  });
  assert.equal(
    Buffer.from(packet.base64, "base64").subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
  );
});
test("card rendering rejects saturation without leaving the renderer busy after failure", async () => {
  const jobs = [
    renderAchievementCard("first-checkpoint", "en", null),
    renderAchievementCard("first-checkpoint", "zh", null),
    renderAchievementCard("first-checkpoint", "en", null),
  ];
  const settled = await Promise.allSettled(jobs);
  assert.equal(settled.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal(settled.filter((r) => r.status === "rejected").length, 1);
  await assert.rejects(renderAchievementCard("forged", "en", null));
  assert.ok(
    (await renderAchievementCard("first-checkpoint", "en", null)).image.length >
      0,
  );
});
