import sharp from "sharp";
import { createHash } from "node:crypto";
import { ServiceUnavailableException } from "@nestjs/common";
import { AchievementId, Locale, achievementCardText } from "@cubers/core";
const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
function lines(value: string, columns: number): string[] {
  const result: string[] = [];
  let line = "",
    size = 0;
  const width = (text: string) =>
    Array.from(text).reduce(
      (sum, char) =>
        sum +
        (/[WM@#%&]/.test(char)
          ? 1
          : /^[il.!,:;'| ]$/.test(char)
            ? 0.3
            : /^[\x20-\x7e]$/.test(char)
              ? 0.6
              : 1),
      0,
    );
  for (const token of value.match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*|./gu) ||
    []) {
    for (const part of width(token) > columns ? Array.from(token) : [token]) {
      if (size + width(part) > columns && line.trim()) {
        result.push(line.trim());
        line = "";
        size = 0;
      }
      if (!line && !part.trim()) continue;
      line += part;
      size += width(part);
    }
  }
  if (line.trim()) result.push(line.trim());
  return result;
}
export function achievementCardSvg(
  achievement: string,
  locale: string,
  namedLabel: string | null,
) {
  const id = AchievementId.parse(achievement),
    language = Locale.parse(locale);
  if (
    namedLabel !== null &&
    (namedLabel.length > 40 || /[\p{Cc}\p{Cf}]/u.test(namedLabel))
  )
    throw Error("Unsupported card label");
  const item = achievementCardText(id, language);
  const text = (
    value: string,
    y: number,
    font: number,
    columns: number,
    weight = 400,
  ) =>
    lines(value, columns)
      .map(
        (line, i) =>
          `<text x="110" y="${y + i * (font + 14)}" font-size="${font}" font-weight="${weight}">${escape(line)}</text>`,
      )
      .join("");
  const { title, description } = item;
  const colors = [
    "#42ad83",
    "#f6ce50",
    "#ec5347",
    "#4e83d6",
    "#f39446",
    "#42ad83",
    "#f6ce50",
    "#4e83d6",
    "#ec5347",
  ];
  const squares = colors
    .map(
      (color, i) =>
        `<rect x="${395 + (i % 3) * 140}" y="${300 + Math.floor(i / 3) * 140}" width="120" height="120" rx="24" fill="${color}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500"><rect width="1200" height="1500" fill="#fbf7ec"/><rect x="48" y="48" width="1104" height="1404" rx="56" fill="#fffefa" stroke="#dce5d8" stroke-width="3"/><g fill="#17372c" font-family="Noto Sans CJK SC, PingFang SC, sans-serif"><text x="110" y="158" font-size="62" font-weight="700">Cubers</text><text x="110" y="212" font-size="28">${language === "zh" ? "通过魔方，连接彼此" : "Connecting people through puzzles"}</text><path d="M335 362H292V642H335M865 362H908V642H865" fill="none" stroke="#17372c" stroke-width="8" stroke-linecap="round"/><circle cx="292" cy="362" r="16" fill="#17372c"/><circle cx="908" cy="642" r="16" fill="#17372c"/>${squares}<rect x="110" y="790" width="${language === "zh" ? 270 : 380}" height="58" rx="29" fill="#e3f2de"/><text x="140" y="829" font-size="28" font-weight="700">${language === "zh" ? "已获得的里程碑" : "Milestone reached"}</text>${text(title, 936, 64, 14, 700)}${text(description, 1118, 34, 27)}${namedLabel ? text(namedLabel, 1278, 38, 23, 600) : `<text x="110" y="1290" font-size="30">${language === "zh" ? "一点点练习，每一步都有收获。" : "Small steps. A little more confidence."}</text>`}<text x="110" y="1400" font-size="22" fill="#506456">${language === "zh" ? "个人学习里程碑 · 非官方赛事证书" : "Personal milestone · Not an official competition certificate"}</text></g></svg>`;
}
let rendering = 0;
export async function renderAchievementCard(
  achievement: string,
  locale: string,
  namedLabel: string | null,
  watermark = false,
) {
  if (rendering >= 2)
    throw new ServiceUnavailableException(
      "Card rendering is busy; retry shortly",
    );
  rendering++;
  try {
    let image = await sharp(
      Buffer.from(achievementCardSvg(achievement, locale, namedLabel)),
      { limitInputPixels: 1800000 },
    )
      .timeout({ seconds: 5 })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const cleanDigest = createHash("sha256").update(image).digest("hex");
    if (watermark) {
      const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"><g transform="rotate(-25 600 750)" fill="#254e3c" opacity="0.24" font-family="Noto Sans CJK SC, PingFang SC, sans-serif" font-size="112" font-weight="700" text-anchor="middle">${[350, 600, 850, 1100].map((y) => `<text x="600" y="${y}">PREVIEW · 预览</text>`).join("")}</g></svg>`;
      image = await sharp(image)
        .composite([{ input: Buffer.from(overlay) }])
        .timeout({ seconds: 5 })
        .png({ compressionLevel: 9 })
        .toBuffer();
    }
    if (image.length > 500000) throw Error("Card image exceeds export limit");
    return {
      image,
      imageDigest: createHash("sha256").update(image).digest("hex"),
      cleanDigest,
    };
  } finally {
    rendering--;
  }
}
