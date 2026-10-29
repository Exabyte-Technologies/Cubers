# Native launch and lesson review, 2026-10-26

Historical native-launch milestone. The later [saved sign-in and navigation refresh](SESSION-NAVIGATION.md) contains the current unsigned packages and source checks; the package hashes below belong to this earlier milestone.

These earlier review packages include the stage lessons, Hum interface and two fixes found by running Cubers on an isolated iOS 27 simulator. Production activation remains disabled. This is simulator and local software evidence; physical devices and signed distribution builds remain separate requirements.

## Fixes found during execution

The earlier iPhone packages compiled but terminated at launch on iOS 27 with `UIScene life cycle is required for apps built with this SDK`. The persistent `with-ios-scenes.js` Expo plugin now creates the window through a scene, starts one React host and forwards cold/warm links, user activities, foreground/background events and shortcut actions through the existing Expo delegate. Repeated prebuild succeeds. Its regression rejects an unfamiliar delegate or a different scene manifest instead of silently replacing it. Package inspection now requires both the scene declaration and its compiled delegate. **Earlier iPhone archives without this fix are superseded and must not be used for iOS 27 review.** See [Apple's scene migration guidance](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle) and [Expo's migration notes](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md).

The native puzzle then exposed a separate rendering problem: the simulator stayed blank and became unresponsive while its software GL renderer processed shaded meshes. Native cubes and Pyraminx now use unlit materials with the same sticker colors, geometry and picking markers. Idle native scenes redraw when their state, view or foreground state changes, rather than continuously queuing GL work. Turns and reduced-motion behavior remain connected; the browser retains its shaded presentation. A regression compares every native/shaded mesh's color, geometry, transform and picking metadata across 2×2, 3×3, 4×4 and Pyraminx. The Chinese history label now describes guided practice without implying a full solve.

The store worksheet now discloses the actual production public-IP lookup sent to FreeIPAPI, the development/test exception and saved lesson-state/checkpoint flows. Raw camera frames remain distinct from uploaded validated color states. Its exporter hashes every primary and additional implementation reference and rejects private or traversing paths. This is an unapproved worksheet, not regulatory clearance.

## Observed UI results

Tests used a synthetic adult account in `cubers_hum_review`, local services and mock AI. No preview account or real user history was changed.

- The rebuilt app launches, signs in and restores its session after termination. The unsigned simulator copy initially lacked usable Keychain entitlements; Xcode's standard simulator-only ad hoc build resolves this. No developer certificate or distribution signing was used.
- A cold `cubers://first-solve?puzzle=3x3&lessonId=3-corners` link retains the lesson destination after loading the development bundle. The development client requires selecting its local server; this does not establish standalone, signed Release cold-link acceptance.
- The corners lesson renders the supplied state, responds to explained turns, verifies its four checkpoints and stops at the selected target. The database records `3-corners / COMPLETED / stage 4`, with no full-first-solve progress or completed full-solve guide.
- A warm Pyraminx lesson link opens the correct unit. Its model renders, a tip tap changes the position, undo restores guidance, dragging changes the view, and guided turns remain responsive after background/resume.
- Chinese dark mode and reduced motion work during the native Pyraminx lesson. English/light and Chinese/dark captures are retained in the [current screenshot gallery](../.hallmark/native-compare.html).
- A fresh browser session blocks the protected lesson. After synthetic sign-in, a direct lesson link survives restoration, the shaded cube renders and a guided turn reaches its checkpoint. The browser reports no warning/error console entries in this check.

## Verification

| Check | Result |
| --- | --- |
| Full source regression suite | 436 passing, zero failures |
| Workspace type checks | Pass |
| Latest authenticated backend suite | 301 passing |
| Current migration-47 regional containers | 67 INTL / 63 CN groups pass |
| Encrypted database recovery, media-erasure replay and scoped smart lesson fixture | 30 groups per region pass; disposable resources removed |
| Packaged API and migration images | 225 files each match current compiled code, schema, migrations and assets |
| Packaged recovery image | 168 compiled files match |
| Five native/export source maps | 112 mobile sources and 55 compiled core JavaScript files match in each variant; web also verifies its two core JSON datasets |
| Saved preview history | All 13 table checksums unchanged from this completion phase's baseline; migration 47; no active attempts |
| Final web image | 218 source hashes match; all 27 files served with matching hashes; six SPA routes, health and security headers pass in a disposable network-isolated container |
| Final store candidate | 47 source hashes and five artwork hashes; unapproved and unsubmitted |

The container and recovery suites ran before the subsequent mobile-only rendering/copy changes; no backend/schema change followed them. Private evidence is under `.data/completion-refresh/`, `.data/docker-smoke/78be4c39/` and `.data/recovery-drill/a5a5be80/`. Saved dependency audit information was reused; no new registry audit or live AI call occurred.

The current mobile static Hallmark check has no failures. The combined admin check repeats four previously measured light/dark-token false warnings, documented in [HUM-REDESIGN.md](HUM-REDESIGN.md). The fresh public sign-in render reports one gate-73 false positive: the footer lies below the scroll clip, not painted underneath another surface. Keyboard navigation moves the footer from `top 919 / bottom 968` outside a 720px clip to `top 631 / bottom 680`; hit testing then reaches its link. The failing checker log and geometry proof are retained. Protected lesson rendering and interactions were checked directly in the browser and simulator; a clean automated full-app rendered sweep or a new independent full-app design review is not claimed. The earlier [UI before/after comparison](../.hallmark/step-lessons-compare.html) remains available.

## Current review artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Unsigned Android APK](../artifacts/android/Cubers-0.1.0-arm64-unsigned-review-20261026-native-final.apk) | 49,350,344 | `3a372c22a48dc48dd1667530ee8ca827bd1c3aa141bb6f58b79a3fd4dd3971cd` |
| [Unsigned iPhone app archive](../artifacts/ios/Cubers-0.1.0-iphone-release-unsigned-20261026-native-final.app.zip) | 13,476,332 | `820f3c3855dc72440eeb9eba811b43783c7fbde0e1caa00a1daf40783de4c2db` |

Both packages include the current Hermes app code and both Chillax fonts. Android is non-debuggable, unsigned and passes permission and 16 KiB library-layout inspection. All 88 iPhone archive files match the build product; its scene delegate, bilingual permissions, native modules and 12 privacy manifests pass static inspection. The simulator UI checks used the Debug development client, not these unsigned packages. Neither package can be installed as a signed production release.

Three-platform exports are in `apps/mobile/dist-native-final-20261026`. The final web image is `cubers-web:public-d4bbb20b`, digest `sha256:71d7ee3fa2d3e00b6a2cf0cdd6db88c36a9e9d1f9d51130a0e9c4da9fb9f532f`. The current store candidate is `artifacts/store/2026-10-26-native-final`. Reserved `.invalid` service addresses remain in all distribution review builds because production backends are undeployed.

Physical camera/Bluetooth/poor-network testing, Android runtime acceptance, signed Release link/email flows, service deployment and provider commissioning, signing, stores, operator approval and regional legal clearance remain open in [STATUS.md](STATUS.md) and [RELEASE.md](RELEASE.md).
