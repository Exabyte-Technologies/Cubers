# Container runtime and OS advisory review

Cubers uses Node **24.22.1** in the API, migrations, recovery tools and isolated document renderer. The production API/admin/document Dockerfiles select that patch release and update installed Debian packages during a fresh build. Recovery tools also update their Debian base. The admin and new proxy Dockerfiles apply available Alpine updates. Node calls this a [security release](https://nodejs.org/en/blog/release/v24.22.1); distribution packages alone do not inventory its bundled libraries.

The production HTTPS service now builds `infra/Dockerfile.proxy`, defaulting to `cubers-proxy:local`. Build it along with the application images. `CUBERS_PROXY_IMAGE`, `CUBERS_POSTGRES_IMAGE` and `CUBERS_REDIS_IMAGE` allow operators to select the exact reviewed regional release images. Resolve every deployment image to an immutable digest, retain its provenance, and repeat review before commissioning. The supplied tags are build defaults, not approved production artifacts.

## Offline comparison

`scripts/image-os-review.ts` compares explicitly selected existing local images with public distribution advisory snapshots downloaded beforehand. It never uploads images, package names, private workspace names or inventories, and does not run npm audit. The user's saved-report-only npm restriction remains in effect.

Create a private JSON object mapping any of `api`, `admin`, `documents`, `migrations`, `recovery`, `proxy`, `postgres`, `redis` to the intended local image reference. Prefer exact image IDs. Supply a directory containing:

- `debian-security.json`: the [Debian security tracker JSON](https://security-tracker.debian.org/tracker/data/json).
- `alpine-vX.Y-main.json` and `alpine-vX.Y-community.json` for each installed Alpine release, from [Alpine secdb](https://secdb.alpinelinux.org/). For example, Alpine 3.23 requires the v3.23 feeds. A feed for another release is rejected.

Record download time, HTTPS source and response headers separately. The tool hashes the supplied data; those hashes identify the snapshot and do not establish publisher signatures or freshness. Do not upload the resulting private inventory to another service without authorization.

```sh
node --import tsx scripts/image-os-review.ts \
  /private-operator/images.json /private-operator/advisories \
  /private-operator/os-review-new.json
```

The output must be new and is created owner-readable/writable only. Exit **0** means no matched affected records in the supplied feeds, **1** means fixable/unfixed/undetermined records were found, and **2** means the review failed. None is production approval. Preserve nonzero reports for review.

Each image resolves to its exact local ID before inspection. Disposable containers have no network, a read-only root, no capabilities, no privilege escalation and bounded process/memory/CPU use. Debian inventory keeps source and binary versions, including epochs. Alpine inventory retains binary origins and virtual dependencies. Versions are compared using that image's `dpkg` or `apk`; they are never treated as generic semantic versions. Validated tabular input is attached to the native comparator through Docker stdin. Cleanup targets only each newly generated inspection container.

The optional executable-version probe can be unavailable under this isolation: Caddy's file capability is one example. Such a report explicitly records `runtimeVersionVerified: false`; it does not relax isolation or invent a version. Package inventory and comparison still proceed.

## What the reports establish

The 2026-10-24 comparison of eight preceding images found **65 fixable image/source/advisory matches**. Updated Debian packages, refreshed PostgreSQL/Redis images and patched admin/proxy layers reduce this to **zero** against the same snapshot. These totals count matches across images, not unique CVEs. **798 unfixed and nine undetermined matches remain** in the Debian records; this is not an exploitability assessment or a clean security certificate. Alpine secdb lists fixes and cannot establish the complete set of unfixed vulnerabilities. Unlisted packages and missing release records remain explicit coverage gaps.

The local verification preserves the exact application dependency manifests and uses their existing Linux dependencies. Node's executable comes from the recorded official image; Debian and Alpine package updates come from their configured distribution repositories. This is an actual runtime/package refresh, but does not establish a fresh install of every production Dockerfile, another architecture, signature/provenance acceptance or deployed-service security. Private records are under `.data/image-security/`.

Six source groups cover inventory parsing, unsafe inputs, exact-release binding and advisory classification. Two explicit real-container regressions use synthetic future and older fixes to prove both native comparators detect an affected version and exclude an already fixed one. Run these against a Debian bookworm Node image and an Alpine 3.23 image, using exact local IDs:

```sh
CUBERS_OS_TEST_DEBIAN_IMAGE=sha256:REPLACE_WITH_LOCAL_ID \
CUBERS_OS_TEST_ALPINE_IMAGE=sha256:REPLACE_WITH_LOCAL_ID \
node --import tsx --test tests/docker/image-os-review.test.ts
```

Early diagnostic outputs lacked attached comparator stdin and undercounted fixable records. They are retained and explicitly listed as invalid in `.data/image-security/invalid-reports.json`; the validated before report is `review.before.validated.json`. Only validated reports and the native regressions support the counts above.

## Runtime verification

Final local Docker run **5dfb47fb** passes **63 INTL / 59 CN** groups on **46 unchanged migrations**. Exact-image encrypted database restore **f081adaa** passes **29 groups per region**, and media-vault drill **ad7bad66** passes **21 per region**; all restore targets remain sealed. Current application/admin hashes and four official-Node executable hashes match the final images. Disposable resources and both drills' anonymous mounts are removed. The full source/backend suites pass **372 / 314**, final focused/native comparison checks pass, and workspace types/builds pass. Preview login, simulated tutoring and synthetic PDF rendering pass with all thirteen saved-history hashes unchanged. Six `cubers-*:local` tags now identify the verified builds; older image IDs remain available.

## Remaining release work

Review unfixed/undetermined findings, non-CVE Alpine records, unlisted/missing-release coverage, bundled runtimes and libraries, npm dependencies, image origin/signatures, build reproducibility and actual deployed reachability. In particular, the [PostgreSQL](https://github.com/docker-library/postgres/blob/master/17/alpine3.23/Dockerfile) and [Redis](https://github.com/redis/docker-library-redis/blob/master/Dockerfile.template) image recipes compile their server executables outside the Alpine package inventory; Caddy also bundles its Go runtime. Recovery uses PGDG PostgreSQL packages whose release records are not fully covered by the Debian feed. These need their own upstream advisory and provenance review. The three active saved npm advisory families still require work; the separately recorded braces and sprintf-js advisories were withdrawn upstream after the original saved comparison. No fresh npm audit, real AI call, production deployment, real-device acceptance or legal approval is established. Keep public release, hardware, ranking and regional approval gates off until their separate acceptance requirements pass.
