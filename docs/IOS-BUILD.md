# iOS builds and packaged permissions

Current development packages: [standalone and Metro-debug IPAs with automatic scanning](DEVELOPMENT-BUILDS.md) include editable server addresses and development-only settings. Both are unsigned and require Apple provisioning/signing before installation; the Metro variant also requires a reachable Metro host. Earlier unsigned review archives below remain preserved.

Latest unsigned iPhone Release archive and review IPA: the [saved sign-in and navigation refresh](SESSION-NAVIGATION.md) includes retryable credential restoration and cold-link Back fallbacks. The IPA wraps the same byte-verified 88-file app as `Payload/Cubers.app`. Scene lifecycle, permissions, bundled fonts and current Hermes code pass static inspection. The fault/restoration and navigation interactions used an isolated Debug simulator client; the unsigned Release artifacts themselves have not been installed.

Previous iPhone Release archive: the [2026-10-26 native review refresh](NATIVE-REVIEW.md) contains the scene-lifecycle launch fix and responsive native puzzle rendering. The unsigned 88-file archive includes current app code and both fonts. Isolated iOS 27 Debug simulator checks pass for the listed lesson, session, link and appearance scenarios. The Release archive itself has not been installed; real devices, configured services and distribution signing remain open. Earlier archives without scene support are superseded for iOS 27, despite their successful compilation.

The previous [Pyraminx-control refresh](PYRAMINX-CONTROLS.md) is retained as historical compilation/static evidence.

The earlier [bilingual-message iPhone archive](BILINGUAL-SERVICE-MESSAGES.md) is dated 2026-10-26, with current embedded service/recovery messages and 86 verified archive files. It is unsigned, uses reserved service addresses and has not been installed or run. Earlier artifacts below remain preserved.

The [virtual-control refresh](VIRTUAL-CUBE-CONTROLS.md) adds a newer unsigned iPhone Release archive with current face picking and drag handling. Earlier simulator/Debug/Release artifacts below remain preserved; no actual device or team signing is established.

The 2026-10-24 refresh compiles three targets with Xcode **27.0 (27A266a)** and code signing disabled: Debug simulator (ARM64 and x86_64), Debug iPhone (ARM64), and Release iPhone (ARM64). None was installed or launched. This establishes compilation and packaging, not device behavior, distribution signing or store acceptance.

## Preserved artifacts

| Archive                                                               |      Bytes | SHA-256                                                            |
| --------------------------------------------------------------------- | ---------: | ------------------------------------------------------------------ |
| `artifacts/ios/Cubers-0.1.0-simulator-20261024.app.zip`               | 46,866,018 | `3ac230e7a83f93eef891ae5baa57bf1dafb2c90dc73fdcd24106f2ac9d995081` |
| `artifacts/ios/Cubers-0.1.0-iphone-release-unsigned-20261024.app.zip` | 14,373,413 | `e9cd04752db35f7c8176c0a6c5a3d1a7b243c3457794320ca1ec4750358eccb5` |

Both contain `Cubers.app`, bundle identifier `app.cubers.mobile`, version `0.1.0`, build `1`, minimum iOS `16.0`. Adjacent JSON files record static inspection. Archive verification compares all **69 simulator / 86 release files** with their build products, including symlinks. The previous simulator app is preserved privately under `.data/ios-refresh/prior-Cubers.app`.

The simulator archive is a development client requiring Metro and reachable development services. The iPhone Release archive includes a **6,437,712-byte Hermes bundle**, SHA-256 `58ab319e77d9603488423fadb3e883d885ec72d48306fdd902499a9623fe26ac`, and omits the developer-only local-network prompt/Bonjour declarations. It has no Apple team signing or provisioning, cannot be installed directly on an iPhone, and is not an IPA or a commissioned production release. Final regional service addresses and approved entitlements still require a correctly configured signed rebuild. No production endpoints or credentials were invented for this compilation check.

The simulator executable has a linker-generated ad-hoc signature without a team; the device builds have no signature. `CODE_SIGNING_ALLOWED=NO` was explicit for every compilation. No Apple account, signing key or provisioning update was used.

## Bilingual native permission text

Source permission files are `apps/mobile/locales/en.json` and `zh-Hans.json`, registered through Expo config. They supply English and Simplified Chinese camera, Bluetooth and photo-library explanations and the Cubers display name. Both built platforms contain matching `InfoPlist.strings` files and declare the two supported languages. Prompt selection, rendering and accessibility still require native acceptance.

The unused default Face ID declaration is removed through `expo-secure-store`'s supported `faceIDPermission: false` option. Current app secure-storage calls do not request biometric authentication. The package also has no microphone usage declaration; recording remains configured without audio. This change does not replace server authorization, child recording consent or the other release gates.

The new square, opaque source icon is regenerated into the iOS asset catalogue. The packaged `Assets.car` and primary AppIcon metadata are checked; native icon masks and appearance remain unaccepted on devices.

## Rebuilding

Run prebuild from the mobile directory, then CocoaPods from its generated `ios` directory. The host's private CocoaPods installation is `.data/cocoapods`, version **1.17.0**; a new machine needs its own supported toolchain. Do not copy credentials or private environment files. The current install uses `--deployment --no-repo-update`, and the installed manifest matches the unchanged Podfile lock. No npm package, lockfile version or native dependency version was changed in this phase.

```sh
# In apps/mobile:
npx expo prebuild --platform ios --no-install
cd ios
pod install --deployment --no-repo-update
```

Then, from the repository root, using the installed Xcode path rather than changing the global developer selection:

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export RCT_NO_LAUNCH_PACKAGER=1
export EXPO_NO_TELEMETRY=1
export NPM_CONFIG_AUDIT=false
xcodebuild -workspace apps/mobile/ios/Cubers.xcworkspace -scheme Cubers \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath .data/ios-build \
  -disableAutomaticPackageResolution CODE_SIGNING_ALLOWED=NO build
```

For a compilation-only iPhone build, use `-sdk iphoneos -destination 'generic/platform=iOS'`. `-configuration Release` also runs the native embedding/Hermes pipeline. These commands do not sign, install, start a simulator or launch the app. Real signed builds require operator-managed accounts, final regional configuration and the acceptance work in [RELEASE.md](RELEASE.md).

Repeated prebuild outputs are stable when compared at the same generation stage. CocoaPods subsequently adjusts the Xcode project, so comparing a post-CocoaPods project with a pre-CocoaPods project is not an idempotence check. The initial mismatched-stage comparison is retained. The first pod invocation also used the wrong working directory; its corrected invocation runs inside `apps/mobile/ios`. A following sandbox network restriction is resolved with access to the existing public CocoaPods cache and pinned metadata. No fresh audit or dependency-tree upload was performed.

## Inspection and privacy inventory

[`scripts/inspect-ios-app.py`](../scripts/inspect-ios-app.py) checks built metadata, SDK platform/architectures, minimum OS, both permission locales, missing unused declarations, compiled assets and markers for ExpoAppIntegrity, VisionCamera and MultiplatformBleAdapter. It uses platform tools to inspect files and never runs the app. Supply a new output directory:

```sh
python3 scripts/inspect-ios-app.py \
  .data/ios-build/Build/Products/Debug-iphonesimulator/Cubers.app \
  .data/NEW_SIMULATOR_INSPECTION --platform simulator
python3 scripts/inspect-ios-app.py \
  .data/ios-build/Build/Products/Release-iphoneos/Cubers.app \
  .data/NEW_RELEASE_INSPECTION --platform device --require-embedded-javascript
```

The embedded-code requirement is also checked negatively against the actual Debug simulator product: it refuses that product because it has no JavaScript bundle. Both positive target inspections pass. Source/mobile types and native plist validation pass. Private logs and the summary are in `.data/ios-refresh/`.

Each built app contains **12 privacy manifests**, retained with hashes and raw declarations in its inspection report. They declare four accessed-API categories across the app/SDK files: disk space, file timestamps, system boot time and user defaults. This is a packaged declaration inventory, not an assessment that every reason, SDK behavior or data disclosure is correct. Reconcile the final signed archive with actual service processing, user choices, native SDK behavior and the [store worksheet](../store/privacy-inventory.json). No tracking exemption, provider retention promise or privacy approval is inferred from the build.

No browser/app UI inspection, real camera/Bluetooth/background/accessibility test, attestation-provider call, real AI request, production activation, backend/database change or store submission was performed. The full goal remains active; physical/model acceptance, native/runtime checks, signed distribution, production services and independent operator/legal review remain required.
