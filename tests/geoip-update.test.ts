import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { verifyCountryDownload } from "../scripts/update-geoip";

test("country refresh rejects tampered archives, incorrect release and oversized decompression", () => {
  const bytes = readFileSync("apps/api/assets/geo/country.mmdb");
  const manifest = JSON.parse(
    readFileSync("apps/api/assets/geo/manifest.json", "utf8"),
  );
  const archive = gzipSync(bytes);
  const now = new Date(manifest.release + "-02T00:00:00Z");
  // Verify the bundled dataset without a network request. The timestamp is
  // checked independently by runtime tests; this fixture must stay current.
  assert.equal(
    verifyCountryDownload(archive, manifest.release, manifest.providerSha1, now)
      .sha256,
    manifest.sha256,
  );
  assert.throws(
    () => verifyCountryDownload(archive, manifest.release, "0".repeat(40)),
    /checksum/,
  );
  assert.throws(
    () => verifyCountryDownload(archive, "2026-09", manifest.providerSha1),
    /release/,
  );
  assert.throws(
    () => verifyCountryDownload(archive, "2026-13", manifest.providerSha1),
    /Supply/,
  );
  assert.throws(() =>
    verifyCountryDownload(
      gzipSync(Buffer.alloc(17 * 1024 * 1024)),
      manifest.release,
      manifest.providerSha1,
    ),
  );
  assert.throws(
    () =>
      verifyCountryDownload(
        archive,
        manifest.release,
        manifest.providerSha1,
        new Date(now.getTime() + 64 * 86400000),
      ),
    /stale/,
  );
});
