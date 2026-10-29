# Saved sign-in and cold-link navigation review, 2026-10-26

This refresh fixes two failures observed on the isolated iOS 27 simulator. It uses the existing local review API, a synthetic adult account and mock AI. Production addresses remain reserved `.invalid` placeholders.

## Behavior

- If the operating system refuses to read saved credentials, restoration now finishes with a bilingual retry notice instead of leaving the app on a spinner. Reads have an eight-second deadline. A failed or late read never becomes a signed-out result, falls through to another community's token, or deletes saved credentials. Retry reads the same keys again.
- Protected links show the restoration notice until the saved session can be read. Legal pages, verification, password recovery, invitations and account-deletion information remain accessible. Fresh community discovery lets the public recovery form work while credential storage is unavailable; login and registration wait for successful restoration.
- A screen opened directly from a link or bookmark may have no Back history. The 26 affected Back actions across 23 routes now replace that missing history with the route's appropriate parent. When history exists, they still use the normal Back action and preserve any existing leave or cleanup handler.

## Observed checks

An intentionally unsigned simulator development build reproduced the operating system's Keychain entitlement refusal. The app showed the English recovery notice and Retry action, left sign-in disabled, allowed a synthetic password-recovery request and opened the public privacy policy. A protected cold link showed the Chinese recovery notice without exposing lesson content. The simulator also emitted an expected `expo-notifications` Keychain warning under this deliberately broken entitlement; it was retained in the local log. No saved key was cleared.

After reinstalling the preserved working development copy without removing app data, the same saved sign-in restored. The cold `cubers://first-solve?puzzle=3x3&lessonId=3-corners` link reached the intended lesson and its completed four-checkpoint record. Its Learning paths button reached Learn with no navigator warning. Profile showed the real one-day activity and lesson statistics; Settings → Profile & privacy → profile editor → Back returned to the same settings category without changing the profile. The screenshots are [English storage error](../.hallmark/session-storage/native-read-error-en-light.png), [Chinese protected-link error](../.hallmark/session-storage/native-protected-error-zh.png) and [restored profile](../.hallmark/session-storage/native-restored-profile.png). The development client still requires choosing its local Metro server on a cold launch.

| Check | Result |
| --- | --- |
| Source regressions and workspace types | 440 pass; types pass |
| Mobile Hallmark source lint | 0 failures, 0 warnings, 2 existing copy notes |
| Five native/export source maps | 115 current mobile sources per variant; 55 compiled core JavaScript files per variant; web export also includes two core JSON files |
| iPhone Release / Android review compilation | Both unsigned builds succeed; static package inspections pass |
| Package contents | Both Hermes bundles include current recovery text, reserved addresses and both Chillax fonts; all 88 iPhone files match the build product |
| Local static web image | 221 source hashes and 27 served files match; six routes, health and security headers pass with the container network disabled |
| Local store candidate | 49 source hashes and five original artwork assets; unapproved and unsubmitted |
| Saved preview database | All 13 history-table checksums match the start snapshot; migration 47; zero active attempts |

The latest authenticated backend suite remains 301 passing checks. The latest regional container runs remain 67 INTL / 63 CN groups, and the latest encrypted recovery drills remain 30 per region. Those earlier checks were not rerun for these mobile-only changes. A previous broad rendered Hallmark checker has a documented false positive for an off-screen sign-in footer; a clean independent full-app rendered sweep is not claimed. See [NATIVE-REVIEW.md](NATIVE-REVIEW.md) for that geometry evidence and the earlier before/after gallery.

## Current review outputs

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Unsigned Android APK](../artifacts/android/Cubers-0.1.0-arm64-unsigned-review-20261026-session-navigation.apk) | 49,354,976 | `509a93e076f34148057b93ea424c56773a28229235a460cd0bfc6e4da657d867` |
| [Unsigned iPhone app archive](../artifacts/ios/Cubers-0.1.0-iphone-release-unsigned-20261026-session-navigation.app.zip) | 13,478,869 | `c1cc77ff4ef055e90f34b61ea7d8b9b02e824e8aee99b220f2eb60cb543aee56` |
| [Unsigned iPhone IPA for review](../artifacts/ios/Cubers-0.1.0-iphone-release-unsigned-review-20261026-session-navigation.ipa) | 13,480,277 | `d1b90bf6f8151b1210b3b573bd087399b0ce5ce51f544addac047431008e07b2` |

The three-platform export is `apps/mobile/dist-session-navigation-20261026`. The new local web image is `cubers-web:public-b4e9f72b`, digest `sha256:3ed9bb04889f0f7438413b9f6d7115000b65e1fdaf2634c2eabcbed9eea5d450`. The unapproved store candidate is `artifacts/store/2026-10-26-session-navigation`. Logs, exact source maps, package inspections and preservation evidence are under `.data/session-storage/`.

The IPA is the same 88-file Release app inside a standard `Payload/Cubers.app` archive; its contents were byte-compared with the build product. It is unsigned, so it is a review artifact rather than a normally installable or store-submittable iPhone app. The simulator used a Debug development client, not these unsigned distribution review packages. A physical device, Android runtime, standalone signed Release cold links, actual camera and smart-cube hardware, deployed regional services, real AI provider, operator-managed credentials, store review and regulatory clearance remain open. This is a software review milestone, not approval to publish.
