# Standalone development builds

These builds contain their JavaScript and fonts and start without Metro. Their normal screens use the same Cubers UI, with one additional floating gear button. Open that button to change development settings. The existing Metro development client remains a separate option.

## Using the development settings

The gear is available before sign-in and over the normal app. Closing it returns to the app. Its three categories are:

- **Servers:** international API, mainland API and community-discovery origins; a shortcut copies the international origin into all three fields. Connection checks use public endpoints without account credentials. Save reloads the app and clears development sign-in for both communities before any new server can receive an account request. It does not delete server records. If reload fails after saving, the panel stays locked until reload succeeds or the app is restarted.
- **Network:** HTTP request timeout from 500 to 60,000 milliseconds, additional latency from 0 to 10,000 milliseconds, and simulated HTTP offline mode. Reset restores 15 seconds, no extra latency and normal networking. Save is explicit. These controls affect API and community-detection HTTP; game sockets, media uploads, camera and Bluetooth retain their actual connections. Public connection checks bypass simulation so an offline test can be diagnosed.
- **Diagnostics:** current platform, language, community, session/storage readiness, configured origins and the last 100 HTTP method/category/status/duration summaries. Summaries remain in memory and omit bodies, headers, tokens, account IDs, query strings and raw errors. Clear removes them; Share opens the platform sharing interface for an explicit user action. English/Chinese controls change the ordinary app's language preference too.

Settings persist only on this installation. A damaged or unreadable settings file presents Retry and Reset development settings/sign-in instead of silently using another server. Android/iOS credentials use development-specific secure-storage keys; the web preview uses separate development session-storage keys. Production credential keys are unchanged.

Enter an **origin**, such as `https://api.example.com` or `http://192.168.1.20:3000`, without a path, `/v1`, username, password, query or fragment. An API key belongs on the backend, never in these fields. Keep the backend on its mock AI provider for the current testing scope.

| Where the app runs                         | Example host API origin                |
| ------------------------------------------ | -------------------------------------- |
| Browser or iOS simulator on the server Mac | `http://localhost:3000`                |
| Official Android emulator                  | `http://10.0.2.2:3000`                 |
| Physical phone on the same private network | `http://<server-computer-LAN-IP>:3000` |
| Remote reviewed development backend        | Its reachable HTTPS origin             |

The packaged defaults are `http://localhost:3000`; Android users must change them before connecting to the host computer. Community selection remains server-controlled. A development INTL backend can be placed in all three fields for an INTL-only test; this does not create a mainland backend. Changing the API origin does not rewrite backend-generated verification links, signed object-storage URLs or CORS settings. Configure `APP_ORIGIN`, `ADMIN_ORIGIN` and a device-reachable `S3_ENDPOINT` on the backend when testing those flows. The development storage container binds to loopback by default; use a deliberately configured private development network or an HTTPS development storage service for physical-phone uploads.

See [STARTUP-GUIDE.md](STARTUP-GUIDE.md) for the complete npm, Docker, PostgreSQL, Redis, storage, mail, PDF-renderer and mock-provider setup.

## Isolation from production

`EXPO_PUBLIC_DEV_TOOLS=true` is a public compile-time switch. It cannot be enabled from a server response or device setting in a production build. Absent or `false` keeps the production UI, credential keys and network policy. Both production EAS profiles explicitly set it to `false`; production profiles and production App Attest refuse `true`.

| Setting                                      | Production                         | Standalone development                        |
| -------------------------------------------- | ---------------------------------- | --------------------------------------------- |
| Android/iOS app ID                           | `app.cubers.mobile`                | `app.cubers.mobile.dev`                       |
| App link scheme                              | `cubers`                           | `cubers-dev`                                  |
| Installed label                              | Cubers                             | Cubers Dev / Cubers 开发版                    |
| Floating development settings                | Absent                             | Present                                       |
| Runtime server overrides and HTTP simulation | Inactive                           | Available behind gear                         |
| Native HTTP allowance                        | Existing production policy         | Allows entered development HTTP origins       |
| Android target                               | Guarded Release                    | Development, embedded code, debug certificate |
| iOS local package                            | Separately signed release workflow | Embedded code, unsigned until provisioned     |

The app IDs and schemes are separate to allow side-by-side installation. A production invitation using `cubers:` opens production; use `cubers-dev:` with the equivalent route when explicitly testing a development deep link. Real hardware, ranking, regional release and AI activation gates remain unchanged.

## Rebuilding

Use Node 22.14 or newer and the native prerequisites in [ANDROID-BUILD.md](ANDROID-BUILD.md) and [IOS-BUILD.md](IOS-BUILD.md). Run `npm ci --no-audit`, `npm run db:generate`, and `npm run build:core` from the repository root first. No fresh npm audit upload is authorized for this workspace.

Use a fresh checkout or clean generated native project when switching build identities. Expo reuses generated native directories, and Android's generated autolinking cache can otherwise keep the old package name. Keep private credentials outside generated directories. On this host, production native sources were snapshotted before the development generation and restored after verification; development artifacts remain separate.

From `apps/mobile`, set these values for **both** prebuild and native compilation:

```sh
export EXPO_NO_DOTENV=1
export EXPO_NO_TELEMETRY=1
export EXPO_PUBLIC_DEV_TOOLS=true
export EXPO_PUBLIC_API_URL_INTL=http://localhost:3000
export EXPO_PUBLIC_API_URL_CN=http://localhost:3000
export EXPO_PUBLIC_COMMUNITY_DISCOVERY_URL=http://localhost:3000
export NPM_CONFIG_AUDIT=false
npx expo prebuild --no-install
```

Set `EXPO_PUBLIC_REGION=CN` only for a deliberately configured CN development installation. A real phone can enter its own addresses later through the gear.

For Android, configure `JAVA_HOME`, `ANDROID_HOME` and `GRADLE_USER_HOME` as described in the Android guide, then:

```sh
cd android
NODE_ENV=production ./gradlew :app:assembleDevelopment \
  --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a
```

The output is `apps/mobile/android/app/build/outputs/apk/development/app-development.apk`. The target requires the explicit development flag, `.dev` ID, debug signing and non-debuggable embedded-code mode. The production Release target still rejects the Android debug key and rejects the development flag. ARM64 is the currently built architecture; produce and verify other required architectures separately.

For iOS, install the pinned pods from the generated `ios` directory, then build from the repository root while retaining the same public environment values:

```sh
# From apps/mobile/ios, using your installed CocoaPods:
pod install --deployment --no-repo-update
```

```sh
# From the repository root:
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export RCT_NO_LAUNCH_PACKAGER=1
NODE_ENV=production xcodebuild \
  -workspace apps/mobile/ios/Cubers.xcworkspace -scheme Cubers \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath .data/ios-build -jobs 2 \
  -disableAutomaticPackageResolution CODE_SIGNING_ALLOWED=NO build
```

Release is used here to embed JavaScript and avoid the Expo development launcher; the explicit feature flag and separate identity make this the development app. This command produces an **unsigned** app. Wrapping it in `Payload/Cubers.app` creates an unsigned IPA for review, not an installable iPhone application. Installable development distribution requires an appropriate Apple Developer team, provisioning profile and registered device(s). This Mac has an Apple development identity but no local provisioning profile. No profile, account registration, signing authorization or store submission was created by these commands.

For managed internal signing, the checked-in EAS profile is `development-standalone`:

```sh
# After operator-managed EAS project, Apple team and device provisioning setup:
eas build --profile development-standalone --platform android
eas build --profile development-standalone --platform ios
```

These remote commands are instructions; no remote build or upload was started. An EAS iOS build still requires the operator's signing setup. Production uses the separate existing production profiles and its original acceptance gates.

## Verification record

The development runtime and build-configuration source tests cover strict origin/parameter validation, unchanged disabled transport and credential keys, diagnostic redaction, local offline failure, latency/deadline behavior, cancellation of stale requests even when the transport ignores abort, caller cancellation, bounded logs, separate app identity and refusal of development tools in production profiles. Public-build cache tests include the new flag. The complete source suite passes **472 tests** and workspace type checks pass.

Browser interaction checks verified the floating gear, opening/closing categories, connection checks, manual address persistence after reload, invalid-parameter refusal, persisted offline simulation, working public health checks while simulated offline, reset, diagnostic clearing, Chinese controls and sign-out after changing servers from a real synthetic session. An exported production web bundle has no development button; its local HTTP-origin detection refusal is expected under the unchanged production HTTPS policy. The earlier development-only review observed React Native Web empty-text warnings on public support. The 2026-10-28 packages include a narrow empty-string rendering correction and document retry action; the [2026-10-28 acceptance checks](OFFLINE-NATIVE-ACCEPTANCE.md) verify signed-out English/Chinese support/deletion information, failure/retry recovery and a local verification-email round trip without that warning. Full password-recovery and account-deletion acceptance remain separate.

Current package inspection and runtime results are recorded alongside the artifact links below. Physical-device, camera/Bluetooth, Apple provisioning, store and public-release acceptance remain separate requirements.

## Current artifacts

The [2026-10-28 scanner correction](SCANNER-RELIABILITY.md) replaces the flat turn cue with rigid projected 3D faces and improves camera alignment. The following packages contain it and the public-document retry correction. Android source maps match **126 mobile files**; iOS matches **125**, with platform-specific modules accounting for the difference. Bundled fonts and static package checks pass.

| Package                                                                                                                  | Purpose                                                                                                        | SHA-256                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Standalone Android scanner-fix APK](../artifacts/android/Cubers-0.1.0-development-arm64-20261028-scanner-fix.apk)       | ARM64, embedded code; starts without Metro                                                                     | `28c17d503e56746d281738fb45bd618e5908dc5cb0aec3bea0b2e89e4c72c9af` |
| [Metro debug Android APK](../artifacts/android/Cubers-0.1.0-development-metro-debug-arm64-20261028-scanner-fix.apk)      | ARM64; loads current code from Metro                                                                           | `f37383d6982569b136754b18a4a54636d92dd69aab68dc78a49bfec8d79971a1` |
| [Unsigned iPhone scanner-fix IPA](../artifacts/ios/Cubers-0.1.0-development-unsigned-20261028-scanner-fix-rebundled.ipa) | Fresh compiled app code with the unchanged development native runtime; **requires Apple provisioning/signing** | `8edf98979ce9b5a6ba824cfec327576f5712cc4ec35a936cc75dce8866e660c8` |

The iPhone package uses the unchanged unsigned native runtime compiled on **2026-10-27**, with fresh **2026-10-28** Hermes app code. Its bytecode version matches the native engine (96). All **87 other original files** are byte-identical; only `main.jsbundle` changes, with no added/missing files, and all **88 IPA payload files** match the inspected app. This is an app-code compilation/repackaging, not a fresh Xcode native compilation or an iPhone runtime test. The full Xcode invocation did not start after automatic permission review timed out; the restricted attempt could not open the workspace. The installed native dependencies still match the unchanged lockfile. No native implementation changed in this correction. The preserved Metro-debug iPhone client below can also load current code from Metro.

Android standalone runtime checks cover the actual turn overlay's changing 3D poses and the live scanner rejecting the emulator's non-cube camera pattern. Physical-phone recognition still requires a fresh test. All **57 generated production native source files** are restored byte for byte after packaging; production activation and signing gates remain unchanged.

## Previous native-build snapshots (2026-10-27)

These preserved snapshots include the earlier automatic scanner and development settings; they predate the 2026-10-28 scanner correction. Both native embedded-code packages match **122 mobile sources**, include the two bundled Chillax fonts, and pass static inspection. Android debug signing is for development only; no production activation occurred.

| Package                                                                                                                | Purpose                                                                                     | SHA-256                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Standalone Android APK](../artifacts/android/Cubers-0.1.0-development-arm64-20261027-automatic-scan.apk)              | ARM64, embedded code; starts without Metro                                                  | `0e158544bd42283ef0dd5f65ccec911069f7dcc3b9c993c90eac12a59441706f` |
| [Metro debug Android APK](../artifacts/android/Cubers-0.1.0-development-metro-debug-arm64-20261027-automatic-scan.apk) | ARM64; connects to Metro and enables the real React Native developer menu                   | `5ffca727473c22950277ff591d565441298c946e1fe4a8b1fdd343a95ceb3854` |
| [Unsigned development IPA](../artifacts/ios/Cubers-0.1.0-development-unsigned-20261027-automatic-scan.ipa)             | ARM64, iOS 16+, embedded code; **requires provisioning/signing before iPhone installation** | `99c9d98c22cd0f6de411ffe60e7db4292bd30996a7f2c2080a2707445cb333f1` |
| [Unsigned Metro debug IPA](../artifacts/ios/Cubers-0.1.0-development-metro-debug-unsigned-20261027-automatic-scan.ipa) | ARM64, iOS 16+; requires Metro **and Apple provisioning/signing before installation**       | `380df67d0a8a7c9f9b6dcceaf77c64a2d60cbf490595d34e039125e6ef57ae32` |

All 88 standalone IPA payload files and all 53 Metro-debug IPA payload files match their compiled iPhone apps. The Metro-debug IPA contains no embedded JavaScript and requires a reachable Metro host. Earlier files without the `automatic-scan` suffix are earlier development snapshots. All 57 snapshotted production native source files were restored byte for byte after the builds, and generated Android autolinking caches were cleared. The EAS `development-debug` profile also provides a managed native Metro client build workflow for either platform; no remote EAS build was started.

Open gear → Diagnostics → **Open React Native developer menu** in a native Metro debug runtime. The button is disabled in standalone optimized builds and on the web. The Android emulator verified that it opens React Native's actual menu. The final standalone APK also passed cold launch with one Cubers gear, persisted origins, and its live 2×2 camera grid after correcting the camera library's late device-discovery notification. The development-only native setup disables Expo's separate floating menu button/onboarding, preserving Cubers' own gear as the ordinary screen's development entry point. The local camera test under Diagnostics opens in a focused screen, requires no account and saves/sends no progress; see [AUTOMATIC-SCANNING.md](AUTOMATIC-SCANNING.md).

For this Mac's current LAN setup, use **http://172.20.10.4:3000 in all three fields**. The app/Metro host is port 8081, admin is 4173, and signed development storage is 9009. This single local backend is INTL; no separate mainland backend runs. `npm run dev:lan` detects the current private IPv4 address and prints it. The machine-specific guide is saved outside this project at `/Users/jingwen.hu/Downloads/Cubers-Local-Development.md`. The address can change when switching networks.

![Chinese development settings](../artifacts/screenshots/cubers-development-settings-web-zh-20261027.png)

![Real React Native menu opened from Cubers settings](../artifacts/screenshots/cubers-react-native-menu-android-20261027.png)

![Exported production screen without development settings](../artifacts/screenshots/cubers-production-no-development-button-20261027.png)
