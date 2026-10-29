# Hum accents and server-enforced regions

Completed on 2026-10-26. This refinement preserves the implemented pathway/profile layout and adds the user's coordinated-color and server-region requirements. The active requirements are recorded in [PLAN.md](PLAN.md), [REGIONS.md](REGIONS.md) and the root design lock.

## Interface behavior

Featured surfaces and selected controls repeat Hum task accents: mint for the learning unit/progress, sugar blue for community/profile, pear for default actions and the next lesson. Profile practice tiles repeat mint; discovery readings/activities use repeated blue/mint surfaces. Ordinary cards, secondary controls and idle choices retain paper treatment. No puzzle sticker, branding, course, permission or completion behavior changes.

Play changes only the selected game circle, its featured card and Create Room action:

| Game | Accent |
| --- | --- |
| Race | Coral |
| Pattern | Sugar blue |
| Relay | Mint |
| Sprint | Pear |
| Daily | Warm sand from Hum's kraft/sand palette |

The four waiting game circles stay paper. Join Room, room/list cards, competition/ranking selectors and their lower controls keep the same original paper/ink/pear scheme for every game. Selected main navigation retains its section identity. All new fills use declared tokens with paired text/edge colors in both themes.

See the [before/after and five-game comparison](../.hallmark/accent-region-compare.html) and [independent review](../.hallmark/accent-finish-review.md). The reviewer confirmed the original pathway/profile hierarchy and the added per-game/lower-control requirement. An initial mismatched yellow button edge was corrected; the added-scope review has no findings.

## Region behavior

Production uses the fixed FreeIPAPI HTTPS endpoint on the **server**. Ordinary API operations and realtime transports/messages/lease renewals enforce the observed IP country against the serving installation. Caller country/region fields, forwarded headers from untrusted peers, client storage and endpoint choices cannot authorize a different region. Restored normal sessions also receive enforcement. Lookup errors/unknown addresses/capacity exhaustion refuse normal access instead of guessing.

Development/test use the server's `REGION`, default **INTL**, without an external lookup. Public legal/discovery/health and narrowly limited verification/recovery/erasure remain accessible; deletion-only tokens still cannot read private data. Accounts never migrate automatically. The app immediately clears local session/offline access after a server mismatch and requests fresh discovery. A new explicit `/sign-in` alias fixes an observed ambiguous-root redirect loop after a tab loses authentication; the original sign-in route remains.

[REGIONS.md](REGIONS.md) documents the bounded country-only cache, transport validation, free-provider rate limits, trusted proxy configuration, privacy disclosure and deployment requirements. The provider receives the connection IP in production. Its accuracy does not establish physical residence or prevent VPN-based circumvention. Bilingual privacy text now describes this external processing rather than claiming an offline DB-IP lookup. No live-user lookup, new provider key or production activation was performed.

## Verification

- **423 source tests** pass, including seven new provider/enforcement tests and the five updated client-routing tests.
- **297 authenticated backend tests** pass. The obsolete offline-provider cases and separate travel fixture were replaced/consolidated into actual HTTP/Engine.IO/Play-gateway checks for both regions, with synthetic provider replies and real test account sessions. They cover address families, header spoofing, ordinary/restored-session refusal, provider failures, per-message revalidation and real restricted erasure.
- Workspace types, the focused test harness types, API/admin builds and formatting checks pass.
- **Nine UI interaction scenarios** pass, including lesson checkpoint verification and the mock AI provider (`source: simulated`).
- **Twelve public/restored/absent/invalid-session route scenarios** pass. Valid lesson destinations retain their authored step. Protected tab access returns to the explicit sign-in route; legal/recovery/invitation/deletion information remains public.
- The additional simulated server-mismatch browser case confirms immediate token removal, protected-content refusal and fresh server-controlled International development detection. Its initial failures exposed and led to the redirect fix; the final run passes.
- All **five game modes in both themes** have distinct selected/control/card fills, unchanged lower Join Room/list colors and unchanged four paper standby controls. Actual action/card label contrast is at least **6.07:1**.
- **33 configurations / 80 overlapping screenshots** cover phone/desktop, English/Chinese, light/dark, settings, discovery stories, five game modes and admin groups. No recorded page errors, resource warnings or document overflow. Reduced motion is enabled in captures; keyboard focus/category navigation are separately exercised.
- Mobile Hallmark: **0 FAIL / 0 REFLEX / 0 WARN**, with two preserved date-range copy notes. Original links/fields/handlers/headings are checked; old DB-IP attribution is explicitly recorded as a user-requested replacement. Admin: **0 FAIL**, four existing static mixed-theme/disabled warnings resolved by per-theme computed contrast (active blue wells 15.21:1 light / 11.74:1 dark; disabled token contrast is also recorded).
- The real FreeIPAPI transport returned US for `8.8.8.8` and CN for `114.114.114.114`. Only these public infrastructure addresses were queried, with no account data or user address.

Evidence is retained privately under `.data/server-regions/`; review screenshots/reports are under `.hallmark/`. Earlier setup/fixture failures are retained and superseded by the named accepted runs. The tests use separate synthetic databases and browser profiles. No fresh npm audit or real AI call was made.

## Review packages

Current web/iOS/Android exports are in `apps/mobile/dist-region-accents-verified-20261026`, using reserved review service origins. Unsigned packages retain bundled Chillax fonts:

- [Android ARM64 review APK](../artifacts/android/Cubers-0.1.0-arm64-unsigned-review-20261026-region-accents-verified.apk): SHA-256 `0871f51aa221f6987c33da6c6e9b3c5d707a3ef6b37278684967192add79aded`.
- [iPhone review app archive](../artifacts/ios/Cubers-0.1.0-iphone-release-unsigned-20261026-region-accents-verified.app.zip): SHA-256 `d305f731c89f983c4ebada3aafdeff225c4cb6eac0eb6ff985cb8e2b01b7723c`.

Both builds and static inspections pass. Android is unsigned/non-debuggable with 24 inspected native libraries; the unsigned iPhone archive matches all 88 built files. Source maps match **108 current mobile sources in each of five native/export variants**, with zero mismatches. Earlier review packages remain preserved. No physical-device acceptance, signing, store approval, fresh Docker validation or deployment is claimed.

## Saved history comparison

The main database snapshot retains migration 46 and has no active attempts. Nine of thirteen history-table hashes match the initial snapshot exactly. Four tables grew while this task was ongoing:

| Table | Initial rows | Final rows |
| --- | ---: | ---: |
| Room | 4 | 6 |
| RoomMember | 4 | 6 |
| LessonSession | 7 | 12 |
| Progress | 2 | 4 |

The full-table snapshot is therefore **not unchanged**. A separate comparison with an explicit UTC baseline cutoff hashes the full pre-existing JSON rows in their original ID order: all four baseline hashes match exactly (4 rooms, 4 memberships, 7 lesson sessions and 2 progress records). Combined with the other nine unchanged tables, this verifies that all baseline history records were retained unchanged; the differences are added activity. No history schema/migration, intended completion change or main-database deletion/reset was introduced. All automated practice/authentication writes used isolated fixtures. Native device, production services, provider/egress capacity, trusted ingress, operational/legal/regulatory and store requirements remain separate launch gates.
