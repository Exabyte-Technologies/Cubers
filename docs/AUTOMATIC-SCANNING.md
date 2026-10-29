# Automatic cube scanning

Cubers' native 2×2, 3×3 and 4×4 scanner captures faces automatically. The [2026-10-28 reliability correction](SCANNER-RELIABILITY.md) adds fitted perspective alignment and a true 3D turn cue. The browser keeps its existing manual color entry. This changes the scanner presentation and local image processing; API contracts, database schemas, lesson prerequisites, competition validation and activation gates are unchanged.

## Learner flow

1. Start with **any face** facing the back camera and one edge upright. Fill the square guide so each sticker occupies one grid cell. The preview and guide are square; the grid follows the puzzle size.
2. Cubers fits a bounded perspective grid around the guide and checks sticker patches, all four perimeter sides and the complete internal grid. Modest framing/tilt variations and weaker stickerless seams are supported; uncertain hue classification alone does not prevent alignment. A plain colored background, partial face, wrong scale or off-center face does not qualify in the synthetic regression fixtures.
3. The outline turns green when alignment qualifies. Colors and alignment must remain stable for **at least 500 ms**, with a fresh check before capture. Losing alignment or changing the observed pattern restarts the hold. Camera processing speed can make a capture take longer than half a second.
4. After capture, a locally blurred still covers the preview while a cube with independently projected, depth-ordered 3D faces shows the next whole-cube turn for approximately **1.5 seconds**. The captured face colors appear on the diagram's visible reference face; its other surfaces are instructional cues, not inferred unseen stickers. Reduced motion uses a still diagram and the same written instructions.
5. Follow the turn and briefly move the cube out of alignment before bringing the next face into the guide. At least two unaligned observations spanning 100 ms are required after each capture. Movement during the turn animation counts, but a cooldown alone never unlocks the next capture.
6. A rotationally matching face already captured is rejected. A centerless 2×2/4×4 can have genuinely identical-looking faces; only after the required movement does the explicit **different face with the same pattern** confirmation allow another stable hold. It never skips alignment or the final physical-validity check.
7. After all six faces, review/correct the stickers. Cubers validates color quotas, rigid center orientation and cubie legality before enabling continuation. The model contains the actual accepted colors. A 3×3 lesson uses its required white-down, green-front grip; other scanning flows retain white-up, green-front or the captured centerless frame as appropriate. No lesson or result is submitted until the existing confirmation flow calls its handler.

The face tour is **front, right, back, left, upper, lower**, measured relative to the learner's initial grip. It is not a prescribed starting color. The whole-cube turns are `y`, `y`, `y`, `y x'`, `x2`, then `x'` to return to the original grip. The half turn explicitly uses the left-to-right axis, with the side faces remaining on the same left/right. Tests verify the captured matrix for every face and all 24 initial grips on each supported cube size.

For competition recording, the existing camera remains mounted and continues recording. Its preview becomes square while scanning, and receives the same grid/turn feedback. Snapshot sampling does not stop/restart the recording. The triangular Pyraminx scanner retains its separate vertex-based workflow.

## White center logos

The 3×3 center is sampled from a ring around its middle, reducing the effect of printed logos. That one center can remain provisional when ink is uncertain; the other sticker patches still require confidence and uniformity.

If the completed scan has exactly one duplicated center color and is missing white, Cubers tries white at each of the two duplicate positions. It accepts a correction only if **exactly one** candidate passes the entire cube's quota, center-frame and piece-validity checks. It changes at most one center and no other sticker. Ambiguous scans, other missing colors and impossible states require correction or rescanning. The corrected center is visible in both review and the accepted model.

## Camera lifecycle and privacy

Sampling uses bounded local snapshots, normalized to 400-pixel width before JPEG decoding. A read lease allows only one native capture/decode at a time, including across pause, background, restart and unmount. Invalidated results cannot update the scan or complete a hold. Images are never sent to a provider or API. Temporary files are deleted after reading; only the last captured still is retained through the turn animation, then removed. Backgrounding/unmounting also removes that still. The submission remains the existing checked cube state, without RGB samples, photos or confidence metadata.

The native camera still requires the user's permission. A denied permission exposes app-settings recovery and manual entry. Pausing stops sampling and the ordinary preview camera; the existing continuous competition recording retains its own independent lifecycle/authority rules. Restart clears the six-face local capture. Manual entry remains available.

## Development test

In a development build, open the floating gear → Diagnostics → choose 2×2/3×3/4×4 → **Test automatic cube scanning**. The focused camera test requires no account and creates no progress, result or server request. Close it to return to development settings. The production app does not expose this test panel.

The separate **Open React Native developer menu** control is available in native Metro debug builds. The standalone optimized build contains the custom settings and scanner but cannot provide React Native's debug runtime. The dev-only native plugin suppresses Expo's additional floating button and automatic menu onboarding, leaving Cubers' own gear as the ordinary app's development entry point.

## Verification and limits

The scanner tests cover square preview geometry, filled and rejected grid images, median/ring logo sampling including a fully obscured center, 500 ms stability/reset behavior, 1.5-second exclusion, motion rearming, repeated/rotated-face rejection, explicit centerless ambiguity handling, stale/background read exclusion, all 24 starting grips per size, unique white-center repair and refusal to guess other invalid states. JPEG/noise/dimming fixtures exercise the same decoder family used by the native scanner.

The Android 36 ARM64 emulator's real permission flow, live square 3×3 grid and native automatic snapshot loop were exercised against its emulated camera test pattern. It did not falsely accept that pattern as a cube. After pausing, 376 completed snapshots were recorded and **zero temporary JPEGs** remained. This establishes local pipeline/UI behavior for that emulator; it is not a physical-cube recognition benchmark. A separate cold-launch check of the standalone optimized APK exposed VisionCamera 4.7.3 publishing its device list before CameraX initialization finished. The locked post-install preparation now publishes the initialized list too; it refuses unknown or linked source and remains idempotent. Both Android packages were rebuilt, and the standalone camera then opened with a live square 2×2 grid and 30 successful snapshots. This native Android correction does not change camera permissions or server contracts. Fresh physical-phone acceptance is still required for lighting, glare, plastic/sticker schemes, logo sizes, motion timing, orientation, camera interruptions and continuous-recording performance. Existing camera/Bluetooth/ranking and public-release gates remain off.

![Native square 3×3 scanner](../artifacts/screenshots/cubers-automatic-scan-3x3-android-20261027.png)

![Standalone Android square 2×2 scanner after cold launch](../artifacts/screenshots/cubers-automatic-scan-2x2-standalone-android-20261027.png)

The development-only **Review scan turn animation** control exercises the same overlay without a camera or account. The latest verification adds 180 independently rendered camera views, wrong-size grid refusals, complete image-to-state tours and 366 intermediate 3D poses; see the reliability report for scope and physical-test limits.
