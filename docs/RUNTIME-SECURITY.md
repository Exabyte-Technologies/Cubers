# Bundled server runtime review

The OS package inventory does not inventory every server executable. This follow-up reviews the exact local proxy, PostgreSQL and Redis versions separately, using public data downloaded for offline comparison. It performs no npm audit or private dependency-inventory upload. Public release remains disabled.

## Proxy correction

The preceding Caddy 2.11.7 image embeds **Go 1.26.8**, which predates the [Go 1.26.9 and 1.26.10 security fixes](https://go.dev/doc/devel/release). `infra/Dockerfile.proxy` now builds the same upstream Caddy release with **Go 1.26.10** and the independently patched **golang.org/x/net v0.60.0** HTTP/2 implementation. The binary identifies the downstream rebuild as `v2.11.7+cubers.go1.26.10`; it retains all **135** registered Caddy modules. Upstream source is selected by its exact module release and Go verifies public module checksums. Publisher signatures and production provenance still need independent acceptance.

The official [govulncheck](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck) v1.9.0 analyzes a copy of the Linux binary without executing it on the host. The complete [Go database archive](https://go.dev/doc/security/vuln/database) was downloaded first and supplied using a `file://` database. Its recorded modification time is **2026-10-21**, and its archive SHA-256 is retained with the private evidence. No program inventory is sent to the vulnerability database.

Against that same snapshot, the earlier binary reports **14 symbol-level advisory matches**. A compiler-only rebuild still reports five x/net matches. The final compiler-and-x/net rebuild reports **zero symbol-level matches** and **one module-level warning** for the deprecated OpenPGP portion of x/crypto; the final binary scan does not identify calls to that vulnerable code. This is not proof that reflection, unsafe code, unlisted vulnerabilities or every reachable path is safe. JSON output can exit successfully even when findings exist; the retained text-mode results and parsed finding levels must also be reviewed.

The first downstream build did not embed Caddy's reported version. Caddy's [documented CustomVersion linker setting](https://github.com/caddyserver/caddy/blob/v2.11.7/caddy.go) now records the correct source/rebuild identity. The earlier binary, build logs and failed identity assertion remain retained. The final module and binary hashes are recorded separately.

## Database and cache scope

The reviewed PostgreSQL server and recovery tools use **17.11**. The downloaded [vendor security table](https://www.postgresql.org/support/security/) contains 70 rows: 50 list a PostgreSQL 17 fix no later than 17.11, and 20 concern other major versions. No newer 17-series fix or missing fix version occurs in this snapshot. Extensions, packaging, actual access policy and operational commissioning remain outside that comparison.

The reviewed Redis server uses **7.4.11**. Its public advisory API often contains broad `All` ranges or `TBD` patch metadata even after fixes ship. These cannot be read as confirmed active findings. The [versioned Redis release notes](https://github.com/redis/redis/blob/7.4.11/00-RELEASENOTES), for example, explicitly fix CVE-2026-25243, CVE-2026-23631 and CVE-2026-23479 in 7.4.9. The local reconciliation covers 33 Redis-named records from 47 public advisories: 13 have explicit fixes in the 7.4 release notes, three have explicit same-series fixes, four fall outside their stated ranges, and **13 require further manual reconciliation**. Most unresolved records refer to earlier release branches; this review does not assume fix inheritance or classify them as confirmed vulnerabilities. Bundled libraries, extensions and actual server configuration still require independent review. The preliminary range-only report is preserved and explicitly superseded by `redis-review.json`.

## Saved npm status correction

The publishers withdrew the saved [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) on October 23 and [sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) on October 22. No package was relabelled or patched for this correction. **node-forge, dicer and fast-xml-parser** remain active saved families. The original audit and original counts remain frozen. See [DEPENDENCY-SECURITY.md](DEPENDENCY-SECURITY.md).

## Verification and limits

Final Docker run **44ee4f11** passes **64 INTL / 60 CN** groups on all **46 unchanged migrations**, including real certificate-verified HTTP/2 multiplexing of health, public operator contacts and unauthenticated-account refusal. Both regional stacks use the exact final proxy binary. The final eight-image OS comparison remains **zero fixable / 798 unfixed / nine undetermined** image/source/advisory matches against the separately retained distribution snapshot; these are not unique CVE counts. Packaged hashes match 63 API, 61 migration-image, 54 recovery files and three admin assets. Independent inspection confirms no owned test, inventory or binary-copy resources remain.

The full source/backend suites pass **372 / 314**, with the final public legal contract checked separately; workspace types/builds and web/iOS/Android JavaScript exports pass. Preview login and mock tutoring pass with all thirteen saved-history hashes unchanged. No new encrypted restore drill was required for the public-contact/proxy-only changes; the previous exact-image database and media restore results remain historical evidence, not certification of the new images. No real AI, native/device acceptance, production commissioning or legal approval is established.

Private source snapshots, scanner logs, binary/module hashes, remaining findings and final image selections are in `.data/runtime-security/`; operator integration evidence is in `.data/operator-identity/`. Independent security review, remaining advisories/coverage gaps, real services, native/hardware testing, final hosting, signing, store and regulatory acceptance remain open.
