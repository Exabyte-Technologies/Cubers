import sharp from "sharp";
import type { AiSourceClaim } from "./media-ai-claims";
export function declaredAiClaim(
  source: AiSourceClaim | null,
  declared: boolean,
): AiSourceClaim | null {
  return (
    source ??
    (declared
      ? {
          Label: "2",
          ContentProducer: "",
          ProduceID: "",
          ReservedCode1: "",
          ContentPropagator: "",
          PropagateID: "",
          ReservedCode2: "",
        }
      : null)
  );
}
const words = {
  "1": ["AI 生成", "AI-generated"],
  "2": ["可能 AI 生成", "Possibly AI-generated"],
  "3": ["疑似 AI 生成", "Suspected AI-generated"],
} as const;
export function aiLabelGeometry(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 25000000 ||
    height > 25000000
  )
    throw Error("Invalid label geometry");
  const ratio = Math.min(1, 2048 / width, 1600 / height);
  const contentWidth = Math.max(2, Math.floor((width * ratio) / 2) * 2),
    contentHeight = Math.max(2, Math.floor((height * ratio) / 2) * 2);
  const canvasWidth = Math.max(320, contentWidth),
    textHeight = Math.ceil(Math.min(canvasWidth, contentHeight + 200) * 0.06),
    bannerHeight = Math.ceil((textHeight * 2 + 28) / 2) * 2;
  return {
    width: canvasWidth,
    height: contentHeight + bannerHeight,
    contentWidth,
    contentHeight,
    textHeight,
    bannerHeight,
  };
}
export async function aiLabelBanner(
  width: number,
  height: number,
  label: AiSourceClaim["Label"],
) {
  const geometry = aiLabelGeometry(width, height),
    lines = [];
  for (const [i, text] of words[label].entries()) {
    const rendered = await sharp({
      text: {
        text: `<span foreground="#ffffff">${text}</span>`,
        font: "Noto Sans CJK SC " + Math.ceil(geometry.textHeight * 1.5),
        rgba: true,
      },
    })
      .png()
      .toBuffer();
    const { data, info } = await sharp(rendered)
      .resize({ height: geometry.textHeight })
      .png()
      .toBuffer({ resolveWithObject: true });
    if (info.width > geometry.width - 24)
      throw Error("AI label cannot fit safely");
    lines.push({
      input: data,
      left: 12,
      top: 12 + i * (geometry.textHeight + 4),
    });
  }
  const png = await sharp({
    create: {
      width: geometry.width,
      height: geometry.bannerHeight,
      channels: 4,
      background: "#111827",
    },
  })
    .composite(lines)
    .png()
    .toBuffer();
  if (
    geometry.textHeight <
    Math.ceil(Math.min(geometry.width, geometry.height) * 0.05)
  )
    throw Error("AI label is too small");
  return { ...geometry, png };
}
export async function labelPostImage(
  bytes: Buffer,
  label: AiSourceClaim["Label"],
) {
  const meta = await sharp(bytes).metadata();
  const banner = await aiLabelBanner(meta.width!, meta.height!, label);
  const content = await sharp(bytes)
    .resize(banner.contentWidth, banner.contentHeight, { fit: "fill" })
    .toBuffer();
  return sharp({
    create: {
      width: banner.width,
      height: banner.height,
      channels: 4,
      background: "#111827",
    },
  }).composite([
    {
      input: content,
      left: Math.floor((banner.width - banner.contentWidth) / 2),
      top: 0,
    },
    { input: banner.png, left: 0, top: banner.contentHeight },
  ]);
}
