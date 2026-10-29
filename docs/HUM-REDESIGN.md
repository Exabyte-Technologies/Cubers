# Cubers Hum UI redesign

Updated: 2026-10-26. Hallmark v2.0.0 Hum now supplies the shared mobile and administration interface. The scope covers all 38 mobile route/layout files and all 15 existing admin destinations. The original Cubers mark, four-tab structure, account controls, permissions, bilingual legal text and puzzle sticker colors remain. No API contract, database schema, hardware activation or production approval changes were made.

## Delivered

Cream grained paper, locally bundled Chillax Medium/Semibold, rounded sheets and controls, yellow primary actions, blue focus/link states, coral error accents and mint progress surfaces. Dark mode and Chinese system-font fallback are included. Learn leads with the actual next lesson and a connected curriculum; Discover presents real authored reading and community content; Play retains existing game choices; Profile retains private progress and account controls. Admin uses the same system with its existing moderation, publishing and operational destinations.

Phone tabs now round the actual platform button and have enough room for icon and label. Their framework links, press/long-press behavior and accessibility properties remain. Protected screen content waits for existing session restoration while the root navigator stays mounted. Public sign-in, legal, verification, reset, invitation and deletion pages remain accessible. Yellow timer text has the paired dark ink token in both modes.

Web theme tokens/base styles load explicitly through the web module. This fixes Metro's handling of CSS imports and gives keyboard users an immediate visible blue focus ring. Existing native focus handling remains. The admin favicon references the existing Cubers mark.

## Verification

- Final source suite: **408 passed, zero failed**, using bounded concurrency. One earlier unconstrained run failed a subprocess fixture deadline under concurrent native builds; neither test nor production verifier was weakened.
- Workspace type checks and admin production build pass. The existing admin bundle-size advisory remains (approximately 645 kB before compression).
- **10 isolated UI interaction scenarios pass**: restored direct lesson URL, move/undo/hint, mock tutor, phone tab geometry/navigation/keyboard focus, absent/invalid sessions, five public routes, and admin navigation/search alignment. The tutor response reports `simulated`; no real provider key was used. No 404 resource responses remain in these checks.
- **15 screen configurations**, represented by ordered overlapping scroll captures at 1440px desktop and 375px phone widths, cover sign-in, four main tabs, the interactive lesson, English/Chinese, light/dark, and populated admin library/overview. This is representative visual coverage, not a claim that every native hardware screen was exercised.
- Mobile Hallmark render sweep: **zero FAIL, zero REFLEX, zero WARN** across 74 source files and the original preview URL. Two copy notes preserve existing date-range punctuation. The sampled sign-in comparison retains **3/3 links, 2/2 fields, 16/16 handlers and 1/1 headings**. The original sampled baseline had 98 FAIL and 68 REFLEX; those counts did not cover every original screen.
- Supporting-screen preservation record retains 26/26 fields, 690 wiring attributes and 187 API/router calls across 32 files. Main-tab and admin source review also preserve their original calls/actions. No route or component file was deleted.
- The independent Hallmark finish review closed the title/metadata hierarchy and ledger-corner findings. Its final search-alignment finding was then corrected with a scoped label-margin reset; a browser bounds check confirms a zero-pixel input/button bottom difference. The original review and scoring are retained without attributing this last root verification to the reviewer.
- Admin static lint's four contrast warnings combine light/dark token declarations. Per-theme computed measurements resolve them: blue-well ink contrast 15.22:1 light / 11.74:1 dark; disabled-token ink 10.44:1 / 9.18:1 before opacity. Disabled controls retain subdued styling and are exempt from active text contrast requirements.

## Review outputs

- Local app: <http://localhost:8081/>
- [Before/after sign-in comparison](../.hallmark/compare.html)
- [Complete screen captures](../.hallmark/review-captures/)
- [Independent finish review and scoring](../.hallmark/finish-review.md)
- [Complete snapshot source diff, including changed copy](../.hallmark/redesign-source.diff)
- [Shared design lock](../design.md)
- [Unmodified Fontshare licence](third-party/Chillax-FFL.txt)
- Android: [Cubers Hum unsigned review APK](../artifacts/android/Cubers-0.1.0-arm64-unsigned-review-20261026-hum.apk)
- iOS: [Cubers Hum unsigned iPhone app archive](../artifacts/ios/Cubers-0.1.0-iphone-release-unsigned-20261026-hum.app.zip)
- Web/native exports: `apps/mobile/dist-hum-20261026`.

Packages include both unmodified Chillax files and embedded JavaScript. Android is unsigned and non-debuggable; the iPhone app is unsigned ARM64. Both use reserved `.invalid` service addresses for review, and static inspections pass. All five embedded/export source maps match 101 current mobile source files each. Exact final hashes and source checks are recorded privately in `.data/hum-design/verification.json`; these packages do not establish physical-device acceptance or installability through production stores.

## Saved-history comparison

The original snapshot was taken at 02:23 UTC, before this resumed implementation began. Eleven of thirteen table checksums still match. LessonSession changed from 3 to 7 rows and Progress from 1 to 2; the additional records date to 02:26 UTC, before this implementation turn. The older lesson-session subset also has a different hash, so this milestone does **not** claim all saved-history bytes match that older snapshot. No records were reset or reverted to force a passing comparison. The existing history and additions are retained; synthetic interface testing uses a separate review database.

## Remaining release boundary

Mock AI remains enabled for development, custom provider URL support is retained, and no real AI key was provisioned. Signing, physical iOS/Android camera/Bluetooth/accessibility acceptance, real-device model certification, regional production hosting, operational readiness, store approval and regulatory clearance remain separate launch requirements. Existing production gates remain off.
