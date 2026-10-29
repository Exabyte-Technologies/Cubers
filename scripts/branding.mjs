import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
const symbol =
  '<g transform="translate(100 60) scale(8)"><path d="M26 59L77 25" stroke="#285c47" stroke-width="7"/><circle cx="77" cy="25" r="10" fill="#f2b16c"/><path d="M48 17L80 35L48 54L16 35Z" fill="#f3d66c"/><path d="M16 35L48 54V91L16 72Z" fill="#71ad8b"/><path d="M48 54L80 35V72L48 91Z" fill="#8c83bf"/><path d="M32 44V81M64 44V81M16 54L48 72L80 54" stroke="#f7f5ef" stroke-width="2" fill="none"/></g>';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="220" fill="#f5f2e9"/>${symbol}</svg>`;
await mkdir("apps/admin/public", { recursive: true });
await writeFile("public/logo.svg", svg);
await writeFile("apps/admin/public/logo.svg", svg);
await writeFile("apps/mobile/assets/logo.svg", svg);
for (const [file, size] of [
  ["icon.png", 1024],
  ["adaptive-icon.png", 1024],
  ["favicon.png", 64],
])
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`apps/mobile/assets/${file}`);
console.log("Original vector logo and 1024px mobile icons generated.");
