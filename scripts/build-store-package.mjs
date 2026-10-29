// Local, offline store-artifact preparation. Never submits or approves a release.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { privacySources } from "./store-privacy-sources.mjs";
import { publicOperator } from "../packages/core/dist/public-operator.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [target, flag, ...extra] = process.argv.slice(2);
assert.ok(
  target && !extra.length && (!flag || flag === "--sync-native-icons"),
  "Use build-store-package.mjs artifacts/store/NEW_DIRECTORY [--sync-native-icons]",
);
const base = join(root, "artifacts/store"),
  out = resolve(root, target);
assert.equal(dirname(out), base, "Use a new direct child of artifacts/store");
await mkdir(base, { recursive: true });
assert.equal(
  await realpath(base),
  base,
  "Artifact directory must not be a symlink",
);
await mkdir(out); // Refuse to overwrite a previous candidate.
const source = JSON.parse(
  await readFile(join(root, "store/listings.json"), "utf8"),
);
assert.equal(source.approvedForSubmission, false);
assert.equal(source.packageId, "app.cubers.mobile");
const glyphs = (s) => Array.from(s).length;
const bounded = (s, n) => {
  assert.equal(typeof s, "string");
  assert.ok(glyphs(s) > 0 && glyphs(s) <= n);
  assert.ok(!/[<>]/.test(s));
};
bounded(source.appName, 30);
const fields = {};
for (const [locale, text] of Object.entries(source.localizations)) {
  bounded(text.subtitle, 30);
  bounded(text.promotionalText, 170);
  bounded(text.shortDescription, 80);
  bounded(text.description, 4000);
  assert.ok(Buffer.byteLength(text.keywords, "utf8") <= 100);
  assert.ok(text.keywords.split(",").every((k) => glyphs(k) > 2));
  const folder = join(out, locale);
  await mkdir(folder);
  for (const key of [
    "subtitle",
    "promotionalText",
    "keywords",
    "shortDescription",
    "description",
  ])
    await writeFile(join(folder, key + ".txt"), text[key] + "\n");
  fields[locale] = Object.fromEntries(
    [
      "subtitle",
      "promotionalText",
      "keywords",
      "shortDescription",
      "description",
    ].map((k) => [
      k,
      { characters: glyphs(text[k]), utf8Bytes: Buffer.byteLength(text[k]) },
    ]),
  );
}
const privacy = JSON.parse(
  await readFile(join(root, "store/privacy-inventory.json"), "utf8"),
);
assert.equal(privacy.operatorApproved, false);
const referencedSources = privacySources(privacy.flows);
for (const source of referencedSources) await readFile(join(root, source));
const mobile = JSON.parse(
  await readFile(join(root, "apps/mobile/package.json"), "utf8"),
);
const lock = JSON.parse(
  await readFile(join(root, "package-lock.json"), "utf8"),
);
const dependencies = Object.entries(mobile.dependencies).map(
  ([name, requested]) => {
    const location = [
      `apps/mobile/node_modules/${name}`,
      `node_modules/${name}`,
    ].find((key) => lock.packages[key]);
    assert.ok(location, `Missing locked direct dependency: ${name}`);
    const entry = lock.packages[location];
    const record = entry.link ? lock.packages[entry.resolved] : entry;
    assert.ok(record?.version, `Missing locked version: ${name}`);
    return {
      name,
      requested,
      version: record.version,
      workspace: !!entry.link,
    };
  },
);
await writeFile(
  join(out, "mobile-direct-dependencies.json"),
  JSON.stringify(
    {
      scope:
        "Direct mobile runtime dependencies resolved from the saved lockfile; not a full native/transitive SDK inventory or a security audit",
      dependencies,
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  join(out, "privacy-inventory.json"),
  JSON.stringify(privacy, null, 2) + "\n",
);
await writeFile(
  join(out, "listings.json"),
  JSON.stringify(source, null, 2) + "\n",
);
await writeFile(
  join(out, "publisher.json"),
  JSON.stringify(
    {
      CN: publicOperator("CN"),
      INTL: publicOperator("INTL"),
      businessRegistryVerified: false,
      supportInboxCommissioned: false,
    },
    null,
    2,
  ) + "\n",
);
for (const name of ["README.md", "REVIEWER-NOTES.md"])
  await writeFile(join(out, name), await readFile(join(root, "store", name)));
const warm = "#f5f2e9",
  green = "#285c47";
const logo = await readFile(join(root, "apps/mobile/assets/logo.svg"), "utf8");
const rawSymbol = logo.replace(/<rect width="1024" height="1024"[^>]*\/>/, "");
assert.notEqual(
  rawSymbol,
  logo,
  "Review an altered source logo before exporting",
);
const symbol = rawSymbol
  .replace(/^.*?<svg[^>]*>/s, "")
  .replace(/<\/svg>\s*$/, "");
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g transform="translate(51.2 51.2) scale(0.9)">${symbol}</g></svg>`;
await sharp(Buffer.from(logo))
  .flatten({ background: warm })
  .removeAlpha()
  .toColourspace("srgb")
  .png()
  .toFile(join(out, "app-store-icon-1024.png"));
await sharp(Buffer.from(logo))
  .resize(512, 512)
  .flatten({ background: warm })
  .ensureAlpha()
  .toColourspace("srgb")
  .png()
  .toFile(join(out, "google-play-icon-512.png"));
await sharp(Buffer.from(foreground))
  .png()
  .toFile(join(out, "adaptive-foreground-1024.png"));
await writeFile(join(out, "adaptive-foreground.svg"), foreground);
const colors = ["#f3d66c", "#71ad8b", "#8c83bf", "#f2b16c", "#e99d9a"];
function face(x, y, n) {
  const gap = 4,
    size = (104 - (n - 1) * gap) / n;
  let result = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      result += `<rect x="${x + c * (size + gap)}" y="${y + r * (size + gap)}" width="${size}" height="${size}" rx="3" fill="${colors[(r + c) % colors.length]}"/>`;
  return result;
}
function pyraminx(x, y) {
  const h = 20 * Math.sqrt(3);
  let result = "",
    index = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c <= r; c++) {
      const px = x + 60 - r * 20 + c * 40,
        py = y + r * h;
      result += `<path d="M${px} ${py}L${px - 20} ${py + h}L${px + 20} ${py + h}Z" fill="${colors[index++ % 4]}" stroke="${warm}" stroke-width="3"/>`;
    }
    for (let c = 0; c < r; c++) {
      const px = x + 60 - r * 20 + c * 40,
        py = y + r * h;
      result += `<path d="M${px} ${py}L${px + 40} ${py}L${px + 20} ${py + h}Z" fill="${colors[index++ % 4]}" stroke="${warm}" stroke-width="3"/>`;
    }
  }
  return result;
}
for (const [locale, tagline, pyramidName] of [
  ["en-US", "Learn, practice and connect", "Pyraminx"],
  ["zh-Hans", "学魔方，练技巧，交朋友", "金字塔"],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><rect width="1024" height="500" fill="${warm}"/><path d="M204 124H272M152 176V268M324 176V268M204 320H272" fill="none" stroke="#c4d6c9" stroke-width="6"/>${face(100, 72, 2)}${face(272, 72, 3)}${face(100, 268, 4)}${pyraminx(264, 268)}<g fill="${green}" text-anchor="middle" font-family="Arial, PingFang SC, sans-serif" font-size="18"><text x="152" y="208">2×2</text><text x="324" y="208">3×3</text><text x="152" y="404">4×4</text><text x="324" y="404">${pyramidName}</text></g><text x="456" y="226" fill="${green}" font-family="Arial, PingFang SC, sans-serif" font-size="76" font-weight="700">Cubers</text><g>${colors.map((c, i) => `<rect x="${460 + i * 34}" y="252" width="24" height="7" rx="3" fill="${c}"/>`).join("")}</g><text x="460" y="312" fill="${green}" font-family="Arial, PingFang SC, sans-serif" font-size="27">${tagline}</text></svg>`;
  await writeFile(join(out, `feature-${locale}.svg`), svg);
  await sharp(Buffer.from(svg))
    .flatten({ background: warm })
    .removeAlpha()
    .png()
    .toFile(join(out, `feature-${locale}.png`));
}
const expect = [
  ["app-store-icon-1024.png", 1024, 1024, false],
  ["google-play-icon-512.png", 512, 512, true],
  ["adaptive-foreground-1024.png", 1024, 1024, true],
  ["feature-en-US.png", 1024, 500, false],
  ["feature-zh-Hans.png", 1024, 500, false],
];
const assets = [];
for (const [file, width, height, alpha] of expect) {
  const path = join(out, file),
    metadata = await sharp(path).metadata(),
    data = await readFile(path);
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  assert.equal(metadata.hasAlpha, alpha);
  assert.equal(metadata.format, "png");
  assert.ok(data.length < 1024 * 1024);
  assets.push({
    file,
    width,
    height,
    alpha,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
}
const { data, info } = await sharp(join(out, "adaptive-foreground-1024.png"))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let bounds = { left: 1024, top: 1024, right: 0, bottom: 0 };
for (let y = 0; y < 1024; y++)
  for (let x = 0; x < 1024; x++)
    if (data[(y * 1024 + x) * info.channels + 3]) {
      bounds.left = Math.min(bounds.left, x);
      bounds.top = Math.min(bounds.top, y);
      bounds.right = Math.max(bounds.right, x);
      bounds.bottom = Math.max(bounds.bottom, y);
    }
const margin = (1024 - (1024 * 66) / 108) / 2;
assert.ok(
  bounds.left >= margin &&
    bounds.top >= margin &&
    bounds.right <= 1024 - margin &&
    bounds.bottom <= 1024 - margin,
  "Foreground must fit the central 66/108 safe zone",
);
if (flag) {
  for (const [from, to] of [
    ["app-store-icon-1024.png", "store-icon.png"],
    ["adaptive-foreground-1024.png", "adaptive-foreground.png"],
  ]) {
    const data = await readFile(join(out, from)),
      path = join(root, "apps/mobile/assets", to);
    try {
      const old = await readFile(path);
      assert.ok(
        old.equals(data),
        "Review existing generated native assets before replacing them",
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await writeFile(path, data, { flag: "wx" });
    }
  }
}
const manifest = {
  schema: 1,
  builtAt: new Date().toISOString(),
  package: source.packageId,
  appVersion: mobile.version,
  productionApproved: false,
  submitted: false,
  fields,
  assets,
  adaptiveSafeZone: {
    bounds,
    ratio: "66/108",
    geometricallyVerified: true,
    deviceMaskAcceptance: false,
  },
  nativeAssetsSynced: !!flag,
  sourceLogoSha256: createHash("sha256").update(logo).digest("hex"),
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        "store/listings.json",
        "store/privacy-inventory.json",
        "store/README.md",
        "store/REVIEWER-NOTES.md",
        "scripts/build-store-package.mjs",
        "scripts/store-privacy-sources.mjs",
        "packages/core/src/public-operator.ts",
        "apps/mobile/package.json",
        "apps/mobile/app.config.ts",
        "apps/mobile/eas.json",
        "apps/mobile/plugins/with-android-release.js",
        "apps/mobile/plugins/with-ios-scenes.js",
        "apps/mobile/plugins/ios/CubersSceneDelegate.swift",
        "scripts/inspect-ios-app.py",
        "apps/mobile/metro.config.js",
        "apps/mobile/config/public-build-cache.js",
        "apps/mobile/locales/en.json",
        "apps/mobile/locales/zh-Hans.json",
        "package-lock.json",
        ...referencedSources,
      ].map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(join(root, file)))
          .digest("hex"),
      ]),
    ),
  ),
  remainingDecisions: source.releaseDecisions,
  remainingRequirements: [
    "Actual signed native screenshots and reviewer access",
    "Native icon/mask/accessibility acceptance",
    "Final public privacy/support/deletion URLs",
    "SDK/data-safety/age/category/territory/legal/filing/rights review",
    "Real regional services and release-gate acceptance",
  ],
};
await writeFile(
  join(out, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    output: out,
    locales: Object.keys(fields),
    images: assets.length,
    productionApproved: false,
  }),
);
