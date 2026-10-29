# Dependency security review

Current status update (2026-10-24): the publishers withdrew the saved [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) on October 23 and the saved [sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) on October 22. These are status corrections, not package fixes. The three active saved families are **node-forge, dicer and fast-xml-parser**. The original audit, its counts and the earlier five-family comparison remain preserved as historical evidence. Public advisory metadata was downloaded separately; no fresh npm audit or private inventory upload occurred. Current withdrawal snapshots and the offline comparison are in `.data/runtime-security/npm-advisory-status.json`. The historical review below records its original date and scope.

Recorded 2026-10-22. Three known advisory families are addressed while preserving Expo 55.0.31, React Native 0.83.10 and the router's existing API. Five known families remain unresolved. This is a comparison against a saved report, not a fresh audit or a security certification.

## Changes

| Dependency path                                   | Previous → current | Saved advisory                                                                            |
| ------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| Expo Router → query-string → decode-uri-component | 0.2.2 → 0.5.0      | [Malformed decoding denial of service](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) |
| Xcode project tooling → uuid                      | 7.0.3 → 11.1.1     | [Output buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq)                 |
| Development Swagger → js-yaml                     | 5.3.0 → 5.4.1      | [Empty merge source resource limits](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm)   |

These are the only installed package version changes relative to the saved lockfile baseline. Targeted overrides avoid changing the SDK or replacing query-string with an incompatible API. Swagger remains development-only and absent from the pruned API runtime.

The official decoder 0.5.0 uses ESM, while SDK 55's router uses CommonJS query-string 7.1.3. The root postinstall script, `scripts/prepare-dependencies.cjs`, applies a two-line default-export compatibility bridge to query-string. It verifies the exact original/prepared SHA-256, pinned parent/decoder versions, an in-checkout regular source file, and absence of symlinks or hardlinks. Unknown sources fail installation for review. Repeated execution leaves the prepared file unchanged. API/admin-only installs safely skip the absent router. Docker build stages copy the helper before installation. No decoder implementation is vendored or relabelled.

After installation, verify with `node --import tsx --test tests/dependencies.test.ts`. An installation using `--ignore-scripts` must explicitly run `node scripts/prepare-dependencies.cjs` before building mobile bundles. Normal clean installation applies it automatically. Keep the bridge and overrides together until the router supports a patched decoder upstream.

## Saved report and remaining work

One approved workspace audit completed before the user's response: **37 affected entries, 24 high and 13 moderate**, covering eight direct advisory families and inherited dependency chains. A separate mobile audit request was rejected by automatic approval review because uploading private workspace names and versions was not authorized. The user chose **saved audit only**. No further audit upload was performed. `.npmrc` sets `audit=false`; Docker installs/pruning additionally use `--no-audit`. Future fresh audit uploads require authorization. Public package metadata and primary advisory pages were consulted without submitting the private dependency tree.

Offline comparison of actual installed versions with that report resolves the three families above. It does not calculate a fresh aggregate finding count or discover new advisories. The five families still matching the saved ranges at that review date were (see the withdrawal update above):

| Family                                                          | Current version | Remaining scope                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)     | 3.0.3           | Expo/Metro build tooling; advisory lists no patched release                                                                                                                                                                          |
| [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | 1.4.0           | Development certificate tooling; advisory lists no patched release                                                                                                                                                                   |
| [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | 1.0.3           | Tooling argument formatting; advisory lists no patched release                                                                                                                                                                       |
| [dicer](https://github.com/advisories/GHSA-wm7h-9275-46v2)      | 0.3.0           | S3rver development storage through old busboy; advisory lists no patched release                                                                                                                                                     |
| fast-xml-parser                                                 | 3.21.1          | S3rver development storage; [prototype pollution](https://github.com/advisories/GHSA-x3cc-x39p-42qx) and [XML output injection](https://github.com/advisories/GHSA-gh4j-gqv2-49f6); patched 5.7.0 changes the API expected by S3rver |

Keep the emulated storage and development tooling private. Review a maintained storage emulator or compatible upstream replacement before release. Do not force incompatible major versions or treat development-only reachability as resolution. The current iOS/Android JavaScript source maps contain neither node-forge, braces nor sprintf-js; this evidence concerns those two exports, not every artifact or tool invocation.

The new pruned API image contains 256 package entries and matches none of the eight saved direct advisory families' vulnerable ranges. Compared with the preceding image, it adds no packages and omits only `msgpackr-extract`, its Linux ARM64 binary and `node-gyp-build-optional-packages`. These optional acceleration entries disappeared during clean installation/pruning; the exact installer cause is not established. Upstream msgpackr explicitly catches a missing extractor and supports JavaScript decoding. The actual new image passes a 1,000-item Unicode round trip with native acceleration disabled, and regional worker checks pass. No new production load benchmark was run; performance acceptance remains open. This inventory comparison is not a fresh production audit.

## Validation and evidence

Evidence is retained privately under `.data/dependency-review/`:

- **335 source checks**, including five dependency groups; **307 backend checks**, workspace types and builds pass. Malformed decoding runs in a bounded child; real Xcode UUID generation and YAML resource budgets are exercised.
- A clean mobile/core/root install applies the bridge automatically. Node 24.22.0 also parses Unicode and malformed UTF-8 through the actual bridged package. The existing native Xcode project parses and generates 100 valid nonconflicting identifiers without being written.
- Web, iOS and Android JavaScript exports pass. Both native source maps include the patched decoder and bridge. These are exports, not a new native compilation, device run or UI inspection.
- Docker **147782bf** passes **59 INTL / 55 CN** groups with all **46 migrations**. Eight build metadata hashes match; packaged hashes match **51 API / 49 migration-image / 41 recovery files** and **three admin assets**. Independent resource inspection finds no owned test containers, networks or volumes.
- Both preview processes were refreshed after checking idle attempts and saved data. Login, simulated tutoring and public bilingual privacy checks pass. All thirteen saved table snapshots remain unchanged; hardware, live provider and ranking gates stay off. No real AI key or provider call was used.

The Linux dependency layer was installed cleanly against the current lockfile. Cached OS/runtime bases were not refreshed. No persistence changes or new migration were introduced, and no new encrypted restore drill is claimed; the earlier migration-46 drill remains recorded in [APPLE-PERIODIC-RECEIPTS.md](APPLE-PERIODIC-RECEIPTS.md).

Initial diagnostics are retained: ordinary `npm install` did not update the newly overridden versions, so an explicit no-audit update changed only the three listed packages. An inventory equality assertion exposed the optional-package removals; the corrected check records the delta and validates the supported fallback. A Node fixture originally mounted dependencies under a directory not named `node_modules`; correcting module lookup makes it pass without product changes. Sandbox-denied local Docker checks were rerun with approved local access. Optional fsevents and Linux embedded-Postgres lifecycle-script warnings remain recorded; no new script was automatically approved.

Real native/hardware acceptance, independent security testing, unresolved advisories, production services, regulatory review and the rest of the original release scope remain open. See [STATUS.md](STATUS.md) and [RELEASE.md](RELEASE.md).
