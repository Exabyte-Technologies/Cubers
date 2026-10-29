import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  aiLabelBanner,
  aiLabelGeometry,
  declaredAiClaim,
  labelPostImage,
} from "../apps/api/src/media-ai-label";
test("visible AI banners fit bounded even canvases, show white text on dark contrast and meet the five-percent text-height floor", async () => {
  for (const [width, height] of [
    [1, 1],
    [20, 2048],
    [2050, 20],
    [2048, 2048],
    [3840, 2160],
    [720, 1280],
  ]) {
    for (const label of ["1", "2", "3"] as const) {
      const banner = await aiLabelBanner(width, height, label);
      assert.ok(banner.width <= 2048 && banner.height <= 2048);
      assert.equal(banner.width % 2, 0);
      assert.equal(banner.height % 2, 0);
      assert.ok(
        banner.textHeight >=
          Math.ceil(Math.min(banner.width, banner.height) * 0.05),
      );
      const { data, info } = await sharp(banner.png)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (const line of [0, 1]) {
        let white = 0;
        for (
          let y = 12 + line * (banner.textHeight + 4);
          y < 12 + line * (banner.textHeight + 4) + banner.textHeight;
          y++
        )
          for (let x = 0; x < info.width; x++) {
            const p = (y * info.width + x) * 3;
            if (data[p] > 220 && data[p + 1] > 220 && data[p + 2] > 220)
              white++;
          }
        assert.ok(white > banner.textHeight * 2);
      }
    }
  }
  for (const [w, h] of [
    [0, 1],
    [1, -1],
    [NaN, 100],
    [1.5, 4],
    [Infinity, 1],
  ])
    assert.throws(() => aiLabelGeometry(w, h));
});
test("declared files get a possible-generation claim without inventing a producer or replacing an existing source claim", () => {
  assert.equal(declaredAiClaim(null, false), null);
  const declaration = declaredAiClaim(null, true)!;
  assert.equal(declaration.Label, "2");
  assert.equal(declaration.ContentProducer, "");
  assert.equal(declaration.ProduceID, "");
  for (const Label of ["1", "2", "3"] as const) {
    const source = {
      ...declaration,
      Label,
      ContentProducer: "Original source",
      ProduceID: "original",
    };
    assert.equal(declaredAiClaim(source, true), source);
  }
});
test("image label is embedded in an extended footer without covering the original picture", async () => {
  const input = await sharp({
    create: { width: 100, height: 80, channels: 3, background: "#164fa0" },
  })
    .png()
    .toBuffer();
  const output = await (await labelPostImage(input, "2")).png().toBuffer();
  const { data, info } = await sharp(output)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 320);
  assert.ok(info.height > 80);
  const p = (10 * info.width + 160) * 3;
  assert.deepEqual([...data.subarray(p, p + 3)], [22, 79, 160]);
});
