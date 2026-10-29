# Android development runtime check — 2026-10-27

An isolated Android 36 ARM64 emulator installed and ran the current debug development client. JavaScript came from local Metro on port 8091, and all API/discovery addresses pointed to the isolated review API at `http://10.0.2.2:3104`. The API health response reported `status: ok`, `region: INTL` and `aiMode: mock`. Testing used an existing synthetic account in the separate review database.

## Development APK

[`Cubers-0.1.0-arm64-debug-local-emulator-20261027.apk`](../artifacts/android/Cubers-0.1.0-arm64-debug-local-emulator-20261027.apk) is **81,720,826 bytes**, SHA-256 `b2bae6c3a884f9d16773450367913d7df405afc457825caa4f5d7ec760cf8c75`. The offline Android Debug build passed, and static inspection verified the debug signature, permissions and all 26 ARM64 library layouts. This package requires Metro and the local review API on port 3104. Its `10.0.2.2` addresses refer to the emulator's host; a physical phone needs a development build with its own reachable addresses.

The unsigned review APK and unsigned iPhone IPA remain listed in [SESSION-NAVIGATION.md](SESSION-NAVIGATION.md). Their reserved service addresses and signing requirements still apply.

## Exercised on screen

- Opened the installed Cubers icon, connected the Expo development launcher manually to `exp://10.0.2.2:8091`, and loaded the current app.
- Signed in with the synthetic account and loaded Discover, Learn and Profile through the bottom navigation.
- Opened the unit selector and the pathway selector, including Beginner/Advanced 3×3, 2×2, 4×4 and Pyraminx entries.
- Opened the first cube lesson, rendered its colored 3D puzzle, changed its view, advanced the explanation from step 1 to step 2, and returned using Learning paths.
- Submitted a notation question to the local mock AI and saw the explicit “Simulated AI · development only” label and simulated explanation.
- Loaded the profile's stored progress, daily activity grid and empty solve-statistics state; opened the gear button, switched settings categories, and returned to the profile.
- Quit and restarted the isolated emulator without clearing its app data, then reopened Cubers and reconnected to the saved Metro address.

Automatic Metro discovery found no server. The emulator host address worked; a `localhost` attempt with a port forward did not. The emulator initially had hardware keyboard input disabled, so its workspace-only AVD setting was enabled before the form checks. These are development-environment observations. No app-source fix was needed for this smoke check.

After the review, all 13 saved preview-history table checksums still matched the preserved baseline, with migration 47 and no active attempts. The current package/source evidence was rechecked. Private verification records are in `.data/session-storage/startup-android-final.json`.

## Captures and limits

The captures include the emulator frame and Expo development tools overlay:

- [Learning path](../artifacts/screenshots/cubers-android36-learn-path-20261027.png)
- [Pathway selector](../artifacts/screenshots/cubers-android36-pathways-20261027.png)
- [Mock AI response](../artifacts/screenshots/cubers-android36-mock-ai-20261027.png)
- [Profile activity](../artifacts/screenshots/cubers-android36-profile-activity-20261027.png)
- [Categorized settings](../artifacts/screenshots/cubers-android36-settings-20261027.png)

This is a bounded development smoke check on one emulator in English/light mode. It does not establish Android Release behavior, physical camera/Bluetooth operation, real AI quality, screen-reader acceptance, all device sizes or complete runtime coverage. The last source/type results remain those recorded in [SESSION-NAVIGATION.md](SESSION-NAVIGATION.md); documentation and local review tooling changed in this phase. Physical-device acceptance, production endpoints, signing, store review and regulatory commissioning remain open.
