// Operator-reviewed monthly refresh. Downloads public country data only.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Reader, type CountryResponse } from "maxmind";

const limit = 16 * 1024 * 1024;
export function verifyCountryDownload(
  archive: Uint8Array,
  release: string,
  expectedSha1: string,
  now = new Date(),
) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(release) ||
    !/^[a-f0-9]{40}$/.test(expectedSha1)
  )
    throw new Error("Supply YYYY-MM and the official MMDB SHA1 checksum");
  if (archive.byteLength > limit)
    throw new Error("Download exceeds size limit");
  const bytes = gunzipSync(archive, { maxOutputLength: limit });
  if (createHash("sha1").update(bytes).digest("hex") !== expectedSha1)
    throw new Error("Official MMDB checksum does not match");
  const reader = new Reader<CountryResponse>(bytes);
  if (
    reader.metadata.databaseType !== "DBIP-Country-Lite" ||
    reader.metadata.buildEpoch.toISOString().slice(0, 7) !== release
  )
    throw new Error("Country database type or release does not match");
  const age = now.getTime() - reader.metadata.buildEpoch.getTime();
  if (age < -86400000 || age > 62 * 86400000)
    throw new Error("Country database is stale or future-dated");
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function main() {
  const [release, expectedSha1, ...extra] = process.argv.slice(2);
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(release || "") ||
    !/^[a-f0-9]{40}$/.test(expectedSha1 || "") ||
    extra.length
  )
    throw new Error(
      "Usage: npm run geo:update -- YYYY-MM OFFICIAL_MMDB_SHA1. Review https://db-ip.com/db/download/ip-to-country-lite first.",
    );
  const source = `https://download.db-ip.com/free/dbip-country-lite-${release}.mmdb.gz`;
  const response = await fetch(source, {
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok || !response.body)
    throw new Error("Public country data download failed");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > limit) throw new Error("Download exceeds size limit");
    chunks.push(chunk);
  }
  const { bytes, sha256 } = verifyCountryDownload(
    Buffer.concat(chunks),
    release,
    expectedSha1,
  );
  const directory = resolve("apps/api/assets/geo");
  const staged = join(directory, `.refresh-${process.pid}`);
  await mkdir(staged, { recursive: true });
  try {
    await writeFile(join(staged, "country.mmdb"), bytes);
    await writeFile(
      join(staged, "manifest.json"),
      JSON.stringify(
        {
          provider: "DB-IP",
          edition: "IP to Country Lite",
          release,
          source,
          license: "CC BY 4.0",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          attribution: "IP Geolocation by DB-IP",
          attributionUrl: "https://db-ip.com",
          providerSha1: expectedSha1,
          sha256,
        },
        null,
        2,
      ) + "\n",
    );
    // Source-tree updates only. Running servers hold their already verified
    // in-memory database. Build/deploy a new immutable image after review.
    await rename(join(staged, "country.mmdb"), join(directory, "country.mmdb"));
    await rename(
      join(staged, "manifest.json"),
      join(directory, "manifest.json"),
    );
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
  console.log(
    `Verified country data ${release}; review the manifest, rebuild and rerun regional checks before deployment.`,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  void main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
