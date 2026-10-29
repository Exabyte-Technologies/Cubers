// Explicit Docker acceptance check; no registry refresh or real advisory upload.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewImages } from "../../scripts/image-os-review";

for (const [distribution, role, variable] of [
  ["debian", "api", "CUBERS_OS_TEST_DEBIAN_IMAGE"],
  ["alpine", "proxy", "CUBERS_OS_TEST_ALPINE_IMAGE"],
] as const)
  test(`${distribution} real native comparison detects future fixes and excludes older fixes`, async () => {
    const image = process.env[variable];
    assert.match(
      image || "",
      /^sha256:[a-f0-9]{64}$/,
      "Supply an exact existing local image ID",
    );
    const directory = await mkdtemp(join(tmpdir(), "cubers-os-contract-"));
    try {
      if (distribution === "debian") {
        await writeFile(
          join(directory, "debian-security.json"),
          JSON.stringify({
            glibc: {
              "CVE-2099-90001": {
                releases: {
                  bookworm: {
                    status: "resolved",
                    fixed_version: "999:1.0",
                    urgency: "test",
                  },
                },
              },
              "CVE-2099-90002": {
                releases: {
                  bookworm: {
                    status: "resolved",
                    fixed_version: "0",
                    urgency: "test",
                  },
                },
              },
            },
          }),
          { mode: 0o600 },
        );
      } else {
        for (const repo of ["main", "community"])
          await writeFile(
            join(directory, `alpine-v3.23-${repo}.json`),
            JSON.stringify({
              distroversion: "v3.23",
              packages:
                repo === "main"
                  ? [
                      {
                        pkg: {
                          name: "busybox",
                          secfixes: {
                            "9999-r0": ["CVE-2099-90001"],
                            "0.0.1-r0": ["CVE-2099-90002"],
                          },
                        },
                      },
                    ]
                  : [],
            }),
            { mode: 0o600 },
          );
      }
      const report = await reviewImages({ [role]: image! }, directory);
      assert.equal(report.images[0].os.id, distribution);
      assert.ok(report.images[0].packages.length > 0);
      assert.equal(report.images[0].comparison.candidatePairs, 2);
      assert.deepEqual(
        report.images[0].findings.map((f: { issue: string }) => f.issue),
        ["CVE-2099-90001"],
      );
      assert.equal(report.summary.fixable, 1);
      assert.equal(report.productionApproved, false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
