# Cubers

The [scanner reliability correction](docs/SCANNER-RELIABILITY.md) adds actual 3D turn cues and fitted camera alignment, with refreshed [development packages](docs/DEVELOPMENT-BUILDS.md#current-artifacts). Generated-image and Android emulator checks pass; physical-phone retesting remains required.

To set up the entire system, start with the [development and production startup guide](docs/STARTUP-GUIDE.md). It covers npm, PostgreSQL, Redis, S3, SMTP, mock AI, migrations, the API/worker, admin, mobile/web, regional Docker deployment and release gates.

[Automatic native scanning](docs/AUTOMATIC-SCANNING.md) adds any-face starts, square 2×2/3×3/4×4 guides, a stable half-second hold, whole-cube turn cues, repeat-face prevention and validated white-logo correction. [Development packages and settings](docs/DEVELOPMENT-BUILDS.md) include standalone and Metro debug APKs and unsigned IPAs, editable server origins, network simulation and the real React Native menu in debug runtimes. Physical-phone acceptance and Apple signing remain open.

[Pyraminx virtual controls](docs/PYRAMINX-CONTROLS.md) now select individual tips and main layers from the displayed triangles, with cancellation-safe gestures and verified turn animations. Source and authenticated learning checks pass, with refreshed unsigned native packages; device/visual/accessibility acceptance remains open.

[Bilingual service and recovery messages](docs/BILINGUAL-SERVICE-MESSAGES.md) now cover common failures and account notices across mobile and admin, with bilingual verification/reset emails and refreshed unsigned native packages. Live AI, device acceptance and production publication remain open.

[Virtual cube touch controls](docs/VIRTUAL-CUBE-CONTROLS.md) now select the face under a tap and keep drag rotation consistent. Source checks and refreshed unsigned native packages pass; physical touch and accessibility acceptance remain open.

[Packaged Linux load checks](docs/CONTAINER-LOAD-TEST.md) pass 100 concurrent synthetic players in each community under the API deployment limits, including shutdown/interruption and complete test-resource cleanup. Production capacity and operational acceptance remain open.

[Apple receipt certificate status](docs/APPLE-CERTIFICATE-STATUS.md) now verifies signed vendor status before enrollment, receipt replacement and protected game actions. Expired, unavailable, revoked and unknown results deny trust. Source/backend checks pass with simulated AI; signed-device and operator acceptance remain open.

The [fresh-source mobile build setup](docs/MOBILE-BUILD-SETUP.md) now compiles the shared library automatically on managed EAS builders and keeps npm audit uploads disabled in every profile. A clean local Linux install exports all three platforms; remote signing and device acceptance remain open.

The [web companion container](docs/WEB-COMPANION.md) serves the existing app at a separate public host, including legal, support and account-link routes. Neither regional backend is deployed yet; example addresses remain placeholders pending commissioning.

The [iOS native refresh](docs/IOS-BUILD.md) adds Chinese/English system permission text and passes simulator, iPhone Debug and unsigned Release compilation. Release packages its app code; signing, configured production services and device acceptance remain open.

The [current ARM64 Android development packages](docs/DEVELOPMENT-BUILDS.md) include standalone embedded-code and Metro debug variants. Both pass static packaging checks; physical-device acceptance and production signing remain open.

A separate [unsigned Android review APK](artifacts/android/Cubers-0.1.0-arm64-unsigned-review-20261025.md) embeds the app code with debugging disabled. It passes static packaging checks and preserves the production signing guard. It needs operator signing and configured services before device/distribution acceptance.

The [store package](docs/STORE-PACKAGE.md) includes bilingual listing copy, original feature graphics, square store icons, an Android foreground and source-backed privacy/reviewer worksheets. Mainland publisher details use the Chinese legal name and address. Actual signed builds, screenshots and submission decisions remain open.

The [owner-supplied operator and contact details](docs/OPERATOR.md) are connected to both regional legal/support experiences, with the Chinese company name and address on the mainland pages. The [bundled-runtime review](docs/RUNTIME-SECURITY.md) also rebuilds the proxy with patched Go/HTTP/2 dependencies and retains remaining warnings and coverage gaps.

Connecting people through puzzles. An English / 简体中文 React Native app, regional NestJS backend, and browser moderation panel.

[Container security review](docs/IMAGE-SECURITY.md) updates Node and available OS fixes, connects an updated proxy image and records offline advisory comparisons. Regional runtime and encrypted recovery checks pass; unresolved advisories and release acceptance remain open.

[Dependency security review](docs/DEPENDENCY-SECURITY.md) addresses three known advisory families while preserving the mobile SDK and router API. Clean installation, builds, platform exports and regional server checks pass; three active saved families and release acceptance remain open; two other saved advisories have since been withdrawn upstream. Automatic audit uploads are disabled under the user’s saved-report-only choice.

[Post attachment labels](docs/MEDIA-AI-LABELS.md) preserve per-file author declarations separately from source claims and add bilingual visible/embedded labels to supported photos and videos. The processed download retains these labels; post edits cannot clear a retained file declaration. Legacy formats, native acceptance and operator legal review remain open.

[Apple receipt updates](docs/APPLE-RECEIPT-REFRESH.md) connect an explicit account-owner request, encrypted receipt replacement and an operator-configured risk gate. Bilingual controls, synthetic signatures and authority-race checks are connected; [optional periodic updates](docs/APPLE-PERIODIC-RECEIPTS.md) now add per-key opt-in, bounded worker leases and current-permission checks. Current signed [receipt-chain certificate status](docs/APPLE-CERTIFICATE-STATUS.md) is now required; operator trust rollover and real signed-device acceptance remain open. Provider activation and production rankings remain off.

[Discover readings and small activities](docs/DISCOVERY.md) introduce all four puzzles through original English and Chinese teaching, with links to currently published regional lessons. Reading does not create progress or community activity.

[Bilingual course authoring](docs/COURSE-EDITING.md) lets administrators create original drills, revise teaching and publish a reviewed revision. Earlier practice remains historical; current progress and tutoring check the saved lesson version.

[Casual mixed-input rooms](docs/MIXED-ROOMS.md) let players choose virtual, scanned or supported smart input before the host starts. Shared WCA scrambles and immutable attempt categories keep histories accurate; mixed results stay outside rankings. Actual smart hardware remains gated.

[Server scramble generation](docs/WCA-SCRAMBLES.md) uses pinned cubing.js workers with minimum-distance filtering for all four puzzles. No Java service is needed; new attempts and competition rounds retain generator provenance.

[Shorter last-layer guides](docs/LESSON-ALTERNATIVES.md) add 66 optional OLL/PLL/CLL sequences with the same starting states, bilingual teaching and saved-guide history. The original exercises remain available.

[Lesson interruption handling](docs/LESSON-LIFECYCLE.md) stops demonstrations on leaving the screen, keeps each visible turn consistent with its move history and discards late view callbacks. Tutoring checks current account, guardian, session and adult-chat permission before generation and delivery; development AI remains simulated.

[Learning permission checks](docs/LEARNING-AUTHORITY.md) also cover drills, scans, guided practice, placement and new downloads. Expired or revoked requests roll back their learning changes, including when they waited on a locked course or saved check.

[Private smart-cube drills](docs/SMART-LESSONS.md) connect native turn tracking to versioned server verification, private history and learning progress. Guided 3×3 first solves also use actual-state planning and thirteen verified checkpoints. All real model/platform gates stay off until physical acceptance; [Smart 3×3 room games](docs/SMART-PLAY.md) now connect native telemetry to verification and provisional evidence review; production attestation and real-device acceptance remain unfinished.

Learn includes optional private placement checks for all four puzzles and a practice queue based on due reviews, placement topics and unfinished published lessons. See [assessment behavior and limits](docs/ASSESSMENTS.md).

The [complete guided 2×2, 3×3, 4×4 and Pyraminx courses](docs/FIRST-SOLVE.md) start from a virtual scramble or your physical scan, teach each stage and save six, thirteen, thirty-two or twelve validated checkpoints. [Downloaded lessons and optional local practice reminders](docs/OFFLINE-LEARNING.md) support account-bound offline teaching and virtual drills without unverified progress. Native [smart-cube adapters](docs/SMART-CUBES.md) and a development hardware-test screen are implemented; all three target models remain disabled pending physical acceptance. Ordinary 3×3 smart drills are connected behind the unchanged gates; [scheduled 3×3 smart competitions](docs/SMART-COMPETITIONS.md) are connected behind the same disabled gates; casual mixed-input rooms, production attestation, physical camera/device testing and broader release work remain unfinished.

[Shareable achievement cards](docs/ACHIEVEMENT-CARDS.md) use earned milestones, anonymous defaults, exact-image review where required and private PNG handoff through native sharing or explicit web downloads.

[Scheduled competitions](docs/COMPETITIONS.md) connect reviewed bilingual schedules, private real attempts, round scoring and optional anonymous leaderboards. Younger children need exact guardian and independent staff approval before a result is shared.

[Sponsor campaign management](docs/SPONSORS.md) connects reviewed bilingual versions, protected archive references and adult-only first-party cards. Regional approval and delivery remain off by default.

[Cooperative Relay](docs/COOPERATIVE-RELAY.md) connects fixed team turns, verified four-puzzle solves, durable handoffs and private progress, with explicit interruption and host ending.

[Last-layer coaching](docs/LAST-LAYER-COACHING.md) explains OLL/PLL/CLL sticker patterns, orientation counts, side pairs and piece destinations in lessons, checked scans and downloaded case drills.

[Downloaded first-solve guidance](docs/OFFLINE-FIRST-SOLVE.md) follows the current checked cube state through the remaining four-puzzle checkpoints, with local scans and no automatic upload of progress.

[Cubers announcements](docs/ANNOUNCEMENTS.md) connects reviewed bilingual service and learning updates, version-bound lesson links, scheduled publication, recent history and the native reader.

[Device test evidence](docs/DEVICE-TEST-EVIDENCE.md) records scoped hardware configurations, protected evidence references and independent version-bound review. All smart-cube models remain disabled until actual acceptance and integration requirements pass.

[Image and video source labels](docs/VIDEO-AI-PROVENANCE.md) preserve recognized JPEG/PNG and static MP4/MOV claims, enforce post labels and keep source identities intact through decoding. Source/integration, regional container and encrypted recovery checks pass; the preview uses migration 34 with simulated AI. Full labeling and native acceptance remain release requirements.

[Category rankings](docs/CATEGORY-RANKINGS.md) show anonymous verified adult attempts with separate puzzle, input and mode filters. Scheduled competition sharing remains a separate reviewed flow.

[Anonymous replay sharing](docs/REPLAY-SHARING.md) adds expiring, withdrawable links with current recipient access, child guardian approval and independent moderator review. Shared snapshots omit identity, footage, original attempt identifiers and connection credentials.

[Private virtual solve replays](docs/REPLAYS.md) reconstruct approved saved sequences for all four puzzles with read-only steps and optional playback. [Private smart-cube replays](docs/SMART-REPLAYS.md) also reconstruct approved saved 3×3 streams, with model/continuity labels and explicit counterless limits. Reading an archive does not activate hardware.

[Private practice sessions and daily totals](docs/SESSION-STATISTICS.md) use approved records, separate puzzle/input categories and device-zone or UTC dates.

Regional club and room invitations keep a validated destination through sign-in and require explicit joining. [Invitation behavior](docs/COMMUNITY.md#invitation-continuation) includes community mismatch and legacy-link handling.

[Account notification preferences and a private inbox](docs/NOTIFICATIONS.md) provide optional connection/club updates and required account/review status with regional, ownership and retention controls.

[Deletion recovery](docs/RECOVERY.md) adds an independently encrypted request journal, authenticated inventory and pre-start replay. [Encrypted database snapshots](docs/DATABASE-SNAPSHOTS.md) pass real regional dump/restore drills and keep restores sealed; [independent media privacy decisions](docs/MEDIA-RECOVERY.md) also replay before startup. The [encrypted media vault](docs/MEDIA-VAULT.md) captures a consistent database/media bundle, verifies private files and explicitly removes expired keys/ciphertext. [Isolated media restoration](docs/MEDIA-RESTORE.md) now resumes interrupted transfers into a separate private bucket with all files quarantined. [Recurring cleanup and private health reporting](docs/MEDIA-MAINTENANCE.md) are connected, including cleanup after backup-key destruction. [Optional signed alert delivery](docs/OPERATIONAL-DELIVERY.md) uses an independent durable queue and stays disabled until configured. [Standalone snapshot expiry](docs/SNAPSHOT-EXPIRY.md) has a separate network-disabled cleanup worker. [Expired vault metadata retirement](docs/VAULT-METADATA-EXPIRY.md) preserves small signed negative records after removing per-file custody. Actual regional receiver/provider acceptance, independent terminal-custody controls and service commissioning remain unfinished. [31-day source history retirement](docs/JOURNAL-RETENTION.md) now requires completed erasure and rejects restores below the applied-history floor.

**In development. The full launch plan is not complete and this is not approved for public release.** See [implementation status](docs/STATUS.md), [curriculum and case-library validation](docs/CURRICULUM.md), [community behavior and validation](docs/COMMUNITY.md), [profile customization and privacy](docs/PROFILES.md), and the original [plan](docs/PLAN.md).

## Local development

Guardian consent documents now use [private page-image review](docs/CONSENT-DOCUMENTS.md), preserving signed originals and requiring recent staff preview receipts before approval. For a host development API, run the documented isolated Docker bridge and set its private `CONSENT_REVIEW_SOCKET`; it never mounts the Docker socket in the parser.

Use Node 22.14 or newer, npm, PostgreSQL, Redis, an S3-compatible store, SMTP, and FFmpeg/FFprobe. Native camera and Bluetooth modules require an Expo development build, not Expo Go.

```sh
npm ci
cp .env.example .env.local
npm run db:generate
```

Start services with `docker compose -f infra/compose.dev.yml up --build -d`. This uses a local development storage emulator; set both S3 credentials in `.env.local` to `S3RVER`. It initializes separate `cubers-intl` and `cubers-cn` buckets. It uses a new `media-emulator` volume and does not migrate or remove old MinIO development volumes. Alternatively, the local-only `node scripts/local-services.mjs` runs PostgreSQL and Redis; `node --openssl-legacy-provider scripts/local-gateways.mjs` runs a filesystem S3 emulator, email capture, and simulated AI. Email stays under the ignored `.data/mail` directory. These tools bind to loopback and never create production users. Do not run both service sets on the same ports.

Apply migrations and seed authored lessons:

```sh
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma
node --env-file=.env.local --import tsx apps/api/prisma/seed.ts
```

In separate terminals:

```sh
npm run dev:api
npm run dev:admin
npm run dev:mobile
```

The browser app runs on `http://localhost:8081`, the admin panel on `http://localhost:4173`, and API documentation on `http://localhost:3000/api-docs` in development. Use `npm run web -w @cubers/mobile` for the browser preview. On a physical phone, configure the mobile package's regional `EXPO_PUBLIC_API_URL_INTL` / `EXPO_PUBLIC_API_URL_CN` to a reachable development service; phone-local `localhost` points to the phone.

Sign-in and registration detect the community automatically from the connection and display it below the submit button. Accounts remain separate. Production builds also require `EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL` and reviewed regional discovery infrastructure. Offline country-data refresh, travel-safe recovery/deletion, licensing and configuration are documented in [REGIONS.md](docs/REGIONS.md).

`scripts/dev-reviewer.ts` creates a **local-only** MFA reviewer fixture when explicitly run against a loopback database. It writes credentials to ignored `.data/reviewer.json`; never use it in production. Normal users register through verified email. Production staff enrollment and MFA recovery use the separate [operator workflow](docs/STAFF-ACCESS.md), with existing verified adult accounts, protected local files, fresh factor proof and audit records. No real staff account is automatically provisioned.

## AI without a real key

Development defaults to `AI_MODE=mock`, URL `http://127.0.0.1:4010/v1`, model `cubers-simulator`. The local gateways include that simulator. No real AI key is needed. Replies are labelled as simulated; under-18 accounts get authored guidance without provider calls.

When using Docker for the development database/storage/mail services, run `npm run ai:mock` separately for the loopback AI simulator. The production container configuration keeps AI disabled by default.

The admin Configuration screen lets an administrator change the API base URL and model. Enabling an international connection verifies the model through `/models` and checks its `/moderations` service. Each adult explanation screens minimized context and candidate output; failed or flagged screening returns authored teaching. Changing a URL never carries validation over from the previous connection. Server-side deployment settings restrict permitted hosts by region, prohibit private network addresses for live providers, and require HTTPS. Live mode stays disabled without a key. Add a key later through server secrets (`OPENAI_API_KEY`, `QWEN_API_KEY`, or a provider-specific `AI_API_KEY`); never use an `EXPO_PUBLIC_` variable for a key.

[Regional AI moderation](docs/AI-MODERATION.md) is connected and tested with synthetic providers. `AI_MODERATION_MODEL` configures international screening. Mainland live requests require the operator to commission Alibaba input/output guardrails and explicitly set `AI_CN_GUARDRAILS_APPROVED=true`; a flag alone does not verify provider enforcement. Live providers, actual moderation quality, mainland operating approvals and production traffic have **not** been tested or activated.

## Checks

```sh
npm run typecheck
npm test
npm run test:integration
npm run test:load
npm run test:docker
npm run export:web -w @cubers/mobile
```

Integration and load tests need the local services above. They use separate `cubers_test`, `cubers_cn_test`, and `cubers_load_test` databases, synthetic accounts, and empty real AI credentials. The 100-player load harness runs one minute of paced WebSocket moves and writes `artifacts/load-test.json`. Set `CUBERS_LOAD_PUZZLE=pyraminx` to check Pyraminx and write its separate report. It does not certify a production deployment or physical-device behavior.

The Docker check builds the server/admin images and tests independent disposable regional stacks through locally verified HTTPS. It creates its own databases, local mail capture and S3 emulator, keeps AI disabled, and removes its own containers/volumes afterward. See [Docker deployment and verification](docs/DEPLOYMENT.md) for setup, test limits and private report locations.

## Release

Production configurations deliberately fail closed. Refer to [deployment](docs/DEPLOYMENT.md), [Android builds and signing checks](docs/ANDROID-BUILD.md), and [release requirements](docs/RELEASE.md). Store publication, operational legal review, filings, developer accounts, real-device testing, and hardware certification are separate required steps.
