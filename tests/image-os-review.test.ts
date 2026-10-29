import test from "node:test";
import assert from "node:assert/strict";
import {
  alpineCandidates,
  alpineInventory,
  debianCandidates,
  debianInventory,
  osIdentity,
} from "../scripts/image-os-review";
const packages = [
  {
    source: "openssl",
    sourceVersion: "1:3.0.1-1+deb12u1",
    binary: "libssl3",
    binaryVersion: "1:3.0.1-1+deb12u1",
  },
];
test("OS identity recognizes release-specific Debian and Alpine data without evaluating release text", () => {
  assert.deepEqual(osIdentity("ID=debian\nVERSION_CODENAME=bookworm\n"), {
    id: "debian",
    release: "bookworm",
  });
  assert.deepEqual(osIdentity("ID=alpine\nVERSION_ID=3.24.2\n"), {
    id: "alpine",
    release: "3.24",
  });
  for (const text of [
    "ID=ubuntu\nVERSION_CODENAME=jammy",
    'ID=debian\nVERSION_CODENAME="$(touch x)"',
    "ID=alpine\nVERSION_ID=3.24/../../x",
  ])
    assert.throws(() => osIdentity(text));
});
test("Debian inventory distinguishes installed source/binary versions, epochs and removed packages", () => {
  const rows = debianInventory(
    "installed\topenssl\t1:3.0.1-1+deb12u1\tlibssl3\t1:3.0.1-1+deb12u1\nconfig-files\told\t0\told\t0\n",
  );
  assert.deepEqual(rows, packages);
  assert.throws(() =>
    debianInventory("installed\topenssl\t1.0;touch_x\tlibssl3\t1.0"),
  );
  assert.throws(() =>
    debianInventory("installed\topenssl\t1.0\tlibssl3\t1.0\textra"),
  );
});
test("Alpine inventory keeps binary origin and revision without assuming semantic-version ordering", () => {
  assert.deepEqual(
    alpineInventory(
      "P:libssl3\nV:3.5.1-r10\no:openssl\n\nP:busybox\nV:1.38.0-r2\n",
    ),
    [
      {
        source: "openssl",
        sourceVersion: "3.5.1-r10",
        binary: "libssl3",
        binaryVersion: "3.5.1-r10",
      },
      {
        source: "busybox",
        sourceVersion: "1.38.0-r2",
        binary: "busybox",
        binaryVersion: "1.38.0-r2",
      },
    ],
  );
  assert.throws(() => alpineInventory("P:libssl3\nV:3.5\no:../../x"));
  assert.equal(
    alpineInventory("P:.redis-rundeps\nV:20260917.213451\n")[0].source,
    ".redis-rundeps",
  );
});
test("Debian candidates deduplicate binaries and preserve unfixed, unknown and missing-release coverage", () => {
  const db = {
    openssl: {
      "CVE-2026-1000": {
        releases: {
          bookworm: {
            status: "resolved",
            fixed_version: "1:3.0.2-1",
            urgency: "high",
          },
        },
      },
      "CVE-2026-1001": {
        releases: { bookworm: { status: "open", urgency: "low" } },
      },
      "CVE-2026-1002": { releases: { bookworm: { status: "undetermined" } } },
      "CVE-2026-1003": {
        releases: { trixie: { status: "resolved", fixed_version: "4.0" } },
      },
    },
  };
  const result = debianCandidates(
    [...packages, { ...packages[0], binary: "openssl" }],
    db,
    "bookworm",
  );
  assert.equal(result.candidates.length, 3);
  assert.equal(result.missingRelease, 1);
  assert.deepEqual(
    result.candidates.map((r) => r.state),
    ["fixed-version", "unfixed", "undetermined"],
  );
  assert.deepEqual(
    debianCandidates([{ ...packages[0], source: "not-listed" }], db, "bookworm")
      .unlisted,
    ["not-listed"],
  );
});
test("unsafe advisory versions and identifiers cannot enter native version commands", () => {
  for (const fixed_version of ["1.0\n0\tx", "1.0$(id)", "--help"])
    assert.throws(() =>
      debianCandidates(
        packages,
        {
          openssl: {
            "CVE-2026-1000": {
              releases: { bookworm: { status: "resolved", fixed_version } },
            },
          },
        },
        "bookworm",
      ),
    );
  assert.throws(() =>
    debianCandidates(
      packages,
      {
        openssl: {
          "../../x": { releases: { bookworm: { fixed_version: "1.0" } } },
        },
      },
      "bookworm",
    ),
  );
});
test("Alpine secdb must match the exact release and preserves explicitly bounded fix coverage", () => {
  const db = {
    distroversion: "v3.24",
    packages: [
      {
        pkg: {
          name: "openssl",
          secfixes: { "3.5.1-r10": ["CVE-2026-1000 CVE-2026-1001"] },
        },
      },
    ],
  };
  const result = alpineCandidates(packages, [db], "3.24");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].fixed, "3.5.1-r10");
  assert.throws(() => alpineCandidates(packages, [db], "3.23"));
  assert.throws(() =>
    alpineCandidates(
      packages,
      [
        {
          ...db,
          packages: [
            { pkg: { name: "openssl", secfixes: { "3.5$(id)": [] } } },
          ],
        },
      ],
      "3.24",
    ),
  );
});
