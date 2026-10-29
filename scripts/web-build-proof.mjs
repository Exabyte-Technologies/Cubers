// Local build evidence, never an upload or a release approval.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
const files = [
  "package.json",
  "package-lock.json",
  "tsconfig.base.json",
  ".dockerignore",
  "apps/api/package.json",
  "apps/admin/package.json",
  "scripts/prepare-dependencies.cjs",
  "scripts/web-build-proof.mjs",
  "infra/Dockerfile.web",
  "infra/nginx.web.conf",
];
const ignored = new Set([
  "node_modules",
  "dist",
  "ios",
  "android",
  ".expo",
  ".git",
  ".data",
  ".codex",
  ".agents",
  ".aws",
  ".npmrc",
  ".DS_Store",
]);
for (const root of ["apps/mobile", "packages/core"]) {
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (
        ignored.has(entry.name) ||
        entry.name.startsWith("dist-") ||
        entry.name.startsWith(".env")
      )
        continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("Review a linked web build source before packaging");
    }
  }
  await walk(root);
}
files.sort();
const hashes = Object.fromEntries(
  await Promise.all(
    files.map(async (file) => [
      file,
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
    ]),
  ),
);
const proof = {
  schema: 1,
  sources: hashes,
  publicBuild: Object.fromEntries(
    [
      "EXPO_PUBLIC_REGION",
      "EXPO_PUBLIC_API_URL_INTL",
      "EXPO_PUBLIC_API_URL_CN",
      "EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL",
    ].map((name) => [name, process.env[name] || ""]),
  ),
  productionApproved: false,
};
await writeFile(process.argv[2], JSON.stringify(proof, null, 2) + "\n", {
  mode: 0o600,
  flag: "wx",
});
