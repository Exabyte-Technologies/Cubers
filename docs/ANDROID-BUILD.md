# Android native builds

Current development packages: [standalone and Metro-debug APKs with automatic scanning](DEVELOPMENT-BUILDS.md) include editable server addresses and development-only settings. The standalone variant embeds its code; the Metro variant enables the actual React Native menu. Both use a separate development identity.

The [2026-10-27 Android development runtime check](ANDROID-RUNTIME-20261027.md) adds a current debug-signed APK and a bounded Android 36 emulator smoke check of sign-in, learning navigation, puzzle rendering, mock AI and categorized profile settings. It requires local Metro and the isolated review API. Physical-device and Release acceptance remain open.

Latest unsigned Android review APK: the [saved sign-in and navigation refresh](SESSION-NAVIGATION.md) embeds current code, both fonts and reserved service addresses. Offline compilation and static integrity, permission and ARM64 library-layout checks pass. This unsigned review package itself has not been run; the later runtime check uses the separate development APK.

Previous Android review APK: the [2026-10-26 native review refresh](NATIVE-REVIEW.md) contains current Hum/stage lessons and the lighter native puzzle renderer. The unsigned, non-debuggable APK embeds current app code and both fonts; permissions and 24 ARM64 library layouts pass static inspection. Android runtime, physical hardware, signing and configured services remain open. The iOS simulator findings in that review do not establish Android behavior. Earlier packages are preserved.

The previous [Pyraminx-control refresh](PYRAMINX-CONTROLS.md) is retained as historical compilation/static evidence.

The earlier [bilingual-message review package](BILINGUAL-SERVICE-MESSAGES.md) is dated 2026-10-26 and embeds current service/recovery messages. It is unsigned and non-debuggable, retains reserved service addresses, and passes static inspection. Earlier artifacts below remain preserved.

The [virtual-control refresh](VIRTUAL-CUBE-CONTROLS.md) adds a newer unsigned review APK with current face picking and drag handling. Earlier packages below remain preserved. The review target still cannot be installed without operator signing.

Unsigned review artifact (2026-10-25): `artifacts/android/Cubers-0.1.0-arm64-unsigned-review-20261025.apk`, **49,582,372 bytes**, SHA-256 `7942b83e2eb721697daf8ed3c0f1167f0a1a46bd63302bf9cf12c04a5f78713c`. It packages **4,176,492 bytes of Hermes app code**, disables debugging and contains no APK/JAR signature. It is not installable as supplied. Reserved API/discovery addresses remain embedded because neither backend is deployed. It is not a production release or device-accepted build.

Previous development artifact (2026-10-24): `artifacts/android/Cubers-0.1.0-arm64-debug-20261024.apk`, **81,720,822 bytes**, SHA-256 `524552556ace8d12f5ee1fb96e69c8ccb190316bc3c3e3550c3de30859af1b3a`. It includes the regenerated store/adaptive icons and is built against the current native workspace. It still requires Metro for JavaScript and a reachable development API. It is signed with the Android debug certificate, not accepted for production or tested on a device. The earlier APK is preserved.

The project uses generated Expo native sources. Run `npx expo prebuild --platform android --no-install` in `apps/mobile` after changing native modules or config plugins. Do not maintain fixes only inside the ignored `android/` directory.

## Local toolchain

This host uses JDK 17 at `/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`. The Android SDK is installed privately under the checkout at `.data/android-sdk`; the Gradle cache is `.data/gradle`. These directories are ignored and are not part of the app or server containers. Google SDK licence acceptance was explicitly authorized by the user on 2026-10-21. A fresh machine must obtain its own authorized acceptance.

The current React Native version requests Android platform 36, build tools 36.0.0, NDK 27.1.12297006 and CMake 3.22.1. The native build also installs build tools 35.0.0 for a dependency. The generated wrapper uses Gradle 9.0.0. Verify these versions again when upgrading Expo or React Native. The official macOS ARM command-line tools archive `commandlinetools-mac_arm64-15859902_latest.zip` was checked against Google's published SHA-256 `835b62a26162b229b441d1f6d4680383815a270809eb33522c0d480fa5002c4e` before extraction. See [Google downloads](https://developer.android.com/studio) and [SDK terms](https://developer.android.com/studio/terms).

From the repository root, after installing the required SDK packages:

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME="$PWD/.data/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="$PWD/.data/gradle"
npm run build:core
cd apps/mobile/android
./gradlew :app:assembleDebug --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a
```

This produces a debug APK for ARM64 Android devices, requiring the local development server for JavaScript. It does not establish emulator compatibility, runtime acceptance or store readiness. Use the appropriate architecture for an emulator and test every supported distribution architecture before release. Configure device-reachable API/discovery addresses; a phone's `localhost` is the phone itself. Keep AI simulated until the user supplies and authorizes a real provider key.

## Current packaging verification

The 2026-10-25 review build succeeds in **4 minutes 43 seconds**, with 749 tasks (700 executed, 49 current). It uses the installed SDK and downloads missing public release dependencies through the existing Maven mirror; the two preceding offline attempts are retained. No package/lockfile change, key generation or licence change is needed. Ten native-layout regressions, workspace types and syntax checks pass. All four actual Gradle guard checks pass: production rejects the debug key, review rejects signing, review rejects debugging, and ordinary unsigned review is accepted. The original production-guard body is unchanged and plugin generation is idempotent.

The review APK inspector verifies the manifest, no microphone permission, camera/Bluetooth access, native crypto/integrity markers, the embedded Hermes header/hash, signature absence and ZIP/ELF layout for all **24 ARM64 libraries**. LLVM independently confirms their LOAD alignment and RELRO address/size fields. All **15 generated launcher WebPs** are found by exact hash among the packaged artwork. Optimized resource filenames differ from Debug; the inspector's name-only launcher list is not a complete optimized-resource inventory. Debug passes its own inspection mode and is refused as review; the new review APK is refused as Debug. These checks do not start an Android app or validate camera, Bluetooth, accessibility, page-size runtime behavior or service connectivity. The earlier APKs and package/Pods locks remain unchanged. Private evidence is under `.data/android-review/`.

The 2026-10-24 offline Gradle build succeeds in 1 minute 14 seconds: 445 tasks, 23 executed and 422 current. Prebuild leaves package manifests, lockfile and source plugins unchanged. The debug certificate fingerprint matches the preserved October 21 artifact. The current real `:app:preReleaseBuild` task still refuses the generated debug signing key with the intended Cubers error. No release APK was built and no signing guard was bypassed.

[`scripts/inspect-android-apk.py`](../scripts/inspect-android-apk.py) records the package, manifest, permissions, signature, ZIP alignment, packaged module markers and every native library's hash and ELF layout. All **26 ARM64 libraries** pass the LOAD and RELRO layout checks; all program-header values are independently compared with the NDK's `llvm-readelf`. All **15 packaged launcher WebP resources** match regenerated native resources. Target SDK 36, disabled backups, no microphone permission, camera/Bluetooth permissions and app-integrity/crypto class markers are verified. These are static checks, not device behavior or a full SDK/security inventory.

```sh
python3 tests/android-apk-layout.test.py
python3 scripts/inspect-android-apk.py \
  artifacts/android/Cubers-0.1.0-arm64-debug-20261024.apk \
  .data/NEW_ANDROID_INSPECTION --sdk .data/android-sdk
```

Use the JDK environment above for SDK tools. Inspection requires a new output directory. Ten layout regressions cover the Android examples, unsafe shared-page/prefix protection, truncated headers, 4 KB alignment and the two real padded library layouts. The initial inspector incorrectly required a RELRO memory range to fit entirely within its LOAD's unpadded size. Independent LLVM output and [Bionic's loader](https://android.googlesource.com/platform/bionic/+/refs/heads/main/linker/linker_phdr.cpp) show that RELRO can cover a LOAD plus padding. The corrected check verifies that rounded protection cannot capture writable bytes outside RELRO. Initial failed evidence is preserved in `.data/android-refresh/inspection/`; `.data/android-refresh/inspection-final/` supersedes it. No dependency or library binary was changed to conceal that false positive.

The two relevant libraries are `libandroidx.graphics.path.so` and `libdatastore_shared_counter.so`. Their RELRO sections cover their full writable LOAD plus padding; the next writable LOAD begins on a separate 16 KB page. The final conclusion is a static layout inference, not proof that a particular Android release will launch the app. Follow [Android's 16 KB guidance](https://developer.android.com/guide/practices/page-sizes) for real device/emulator testing, allocator/page-size assumptions and the final distribution archive. No app UI, emulator or physical device was inspected or run in this phase.

The first Gradle attempt could not open its local lock socket inside the sandbox; the resumed, still-offline build succeeds with that local process access. SDK metadata-version and Gradle deprecation warnings remain recorded. Evidence and the final summary are under `.data/android-refresh/`. No server/container rebuild, database mutation, fresh npm audit, live AI request, production commissioning or activation is claimed for this native-packaging phase.

## Connecting a development phone

For a USB-connected ARM64 Android phone with USB debugging explicitly enabled, the following is a development setup, not a public deployment. Keep the backend, media gateway and Metro running on the host. With the default loopback development URLs, forward the required host services to the phone and install the current APK:

```sh
.data/android-sdk/platform-tools/adb reverse tcp:8081 tcp:8081
.data/android-sdk/platform-tools/adb reverse tcp:3000 tcp:3000
.data/android-sdk/platform-tools/adb reverse tcp:9009 tcp:9009
.data/android-sdk/platform-tools/adb install -r artifacts/android/Cubers-0.1.0-arm64-debug-20261024.apk
```

Use the development client's server-address entry to connect to Metro at `http://localhost:8081`. This device sequence has not been exercised here. Adapt routing for any different API/media addresses and remove USB forwards when finished. A standalone production app needs its own signed build and real regional HTTPS endpoints. The debug artifact contains no embedded JavaScript bundle; current JavaScript and any source fixes are loaded from Metro rather than frozen into this APK.

## Release signing and privacy

`with-android-release.js` adds an execution-time check to `preReleaseBuild`. It rejects missing signing configuration, the generated `debug` configuration, `debug.keystore` and the standard Android debug alias. Standard assemble/bundle release builds must supply operator-owned release credentials through EAS or private signing configuration. The check runs after build configuration, allowing EAS to inject its credentials. It does not validate certificate ownership, Play registration or credential custody. Never commit keystores/passwords or substitute a test key for an operator's release key. See [Expo signing instructions](https://docs.expo.dev/app-signing/local-credentials/).

The plugin also generates a separate **`review` build type** for unsigned packaging inspection. It copies the release settings, uses release dependency fallbacks, clears signing and disables debugging. Its own execution-time guard rejects a signing configuration or debugging being re-enabled. Production `release` keeps its original signing guard; no environment flag skips it. Review builds do not create credentials and are not installable or accepted for distribution.

With the toolchain environment above and actual reviewed public addresses supplied, build from `apps/mobile/android`:

```sh
EXPO_NO_DOTENV=1 NODE_ENV=production ./gradlew :app:assembleReview \
  --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a
```

Set `EXPO_PUBLIC_REGION`, both `EXPO_PUBLIC_API_URL_INTL` / `EXPO_PUBLIC_API_URL_CN`, and `EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL` explicitly in the build environment. These public values are compiled into the embedded app code; rebuild after changing them. The owner has confirmed that the regional backends are not deployed, so local review builds use reserved `.invalid` examples and cannot establish real service routing. Dotenv loading is disabled for this review command to keep private deployment files out of the build configuration. Keep real AI disabled until separately authorized.

The output is `app/build/outputs/apk/review/app-review-unsigned.apk`. The APK inspector's `--mode unsigned-review` requires non-debuggable packaging, embedded Hermes app code and an absent signature, alongside the existing native layout, manifest and module checks. It checks both APK signing-block and JAR certificate/signature markers; a failed signature-verifier command alone is insufficient evidence that a file is unsigned. Default `--mode debug` retains the original development-APK requirements.

Incremental bundle configuration now tracks the four public community/API settings, relevant build flags, mobile assets/JSON/configuration, compiled shared-core files and workspace dependency manifests. Compile `@cubers/core` from the repository root before local native builds; the bundle consumes its `dist` runtime. The Metro configuration also separates transform caches by the public settings using its supported [cache version](https://metrobundler.dev/docs/configuration/#cacheversion). No provider key or session value is part of this public configuration key.

A reproduced regression first left Gradle's bundle task up to date after only addresses changed. Adding Gradle inputs alone reran the task but retained old transforms under Expo's CI caching behavior. With both fixes, changing to different reserved addresses produces a different Hermes bundle containing all three new addresses; restoring the original settings restores the exact original bundle hash. An unchanged repeat is up to date. Two permanent checks load the actual installed Expo/Metro configuration to cover every public address/community variable, empty versus absent values and exclusion of private provider/session values. No development-server restart or real service call is required by these tests.

This follows Android's [build-type configuration and release fallbacks](https://developer.android.com/build/build-variants) and React Native's [bundling of non-debuggable variants](https://reactnative.dev/docs/0.82/react-native-gradle-plugin). It is a packaging path, not a substitute for a correctly configured, operator-signed release target or actual device acceptance.

The Expo Android config disables device backup for private app data. Existing platform secure storage and server export/deletion remain separate controls. Check the final merged manifest, including third-party permissions, for each release.

## Earlier verification record

The **ARM64 Android debug APK compiles successfully** on 2026-10-21: 445 Gradle tasks, 439 executed and six already current. The initial build took 31 minutes 35 seconds including dependency downloads. It is preserved at `artifacts/android/Cubers-0.1.0-arm64-debug.apk` (79,668,782 bytes; SHA-256 `e4815f12ae13b3499001833e8e04fef840e72e97cf356b1c65f4f9b39dd1f4c0`). It is a Metro-dependent development client, not a standalone or production-signed release.

Artifact inspection verifies the `app.cubers.mobile` package, target SDK 36, a valid debug signature, disabled backups, no microphone permission, packaged app-integrity and crypto module classes, ARM64-only native code, ZIP alignment and 16 KiB load-segment alignment in all **26 native libraries**. This is static packaging evidence; no Android device or emulator was run. Camera, Bluetooth, actual Play Integrity, background handling, connectivity, accessibility and 16 KiB runtime acceptance still require signed-device testing in both languages. All provider, hardware and ranking activation remains off.

Repeated prebuild generation, mobile type checking and six isolated Gradle signing checks pass. The actual `:app:preReleaseBuild` task also fails with the intended Cubers error when the generated debug signing configuration is present, confirming the guard is attached to the real app. That negative check first did not execute because automatic approval review hit a usage limit; it completed after the user resumed. EAS credential injection and operator-owned production signing have not been commissioned.

Evidence is in `.data/android-build/assemble-debug.log`, `apk-inspection.json`, `signing-checks.json` and `native-release-guard.log`. The first APK inspector expected a numeric false value from AAPT; this SDK prints `false` text. The initial failed check is retained, the parser now accepts both forms, and both the decoded compiled manifest and final inspection confirm backups are disabled. The app binary did not change for this correction.

The initial SDK-manager NDK extraction failed. The recovered archive matches the official repository's exact 836,151,734-byte size and SHA-1 `c70c9791b0d258858678f6df31c4319140e2926e`; its independently recorded SHA-256 is `cf9b9eef50841f409f586e7ae12901007c7f545722612065bd63afbab1844152`. Extraction validates archive paths and the 23 internal symlinks. The initial isolated Gradle check also failed because its fixture shadowed a variable; correcting the fixture yields six passing signing checks. These are preserved separately from the actual app build.

Standard Maven Central hosts returned HTTP 403 on this network. The local build uses `.data/android-build/maven-mirror.init.gradle` with the [Google-hosted Central mirror](https://storage-download.googleapis.com/maven-central/index.html); this does not change committed repositories or app networking. The React Native build plugin compiles successfully through that mirror. A warning about SDK XML metadata versions is retained in the app build log.

The historical 2026-10-21 mobile-workspace production-dependency audit reported **36 affected package entries (21 high, 15 moderate)** across five advisory families. The report includes Expo/React Native build tooling as well as dependency paths requiring runtime review; it does not establish that all 36 entries ship in the APK. No automatic SDK downgrade/major upgrade was applied. See `.data/android-build/mobile-audit.json`; existing security release gates remain open.

The 2026-10-22 [dependency review](DEPENDENCY-SECURITY.md) supersedes that audit as the saved-advisory comparison: three families were addressed and five remained at that milestone. Upstream subsequently withdrew the saved braces and sprintf-js advisories, leaving three active saved families; no additional audit upload was authorized. Android/iOS JavaScript exports include the patched decoder and pass, with unchanged Expo/RN versions. The October 21 APK predates these updates. The October 24 development APK and its limits are recorded above; neither artifact establishes device or release acceptance.
