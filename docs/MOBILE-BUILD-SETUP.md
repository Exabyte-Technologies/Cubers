# Mobile builds from fresh source

The mobile package now defines `eas-build-post-install` as `npm run build --workspace @cubers/core`. It compiles the shared library before native app bundling, including when no local generated files were uploaded. `packages/core/package.json` points to `dist/index.js`; that generated directory is deliberately excluded from source uploads and Docker contexts.

The ordinary root install script still prepares the reviewed Expo router decoder bridge. The mobile hook is separate and does not change dependencies, provision credentials, contact an AI provider, or start services. A compiler error exits unsuccessfully and stops the managed build rather than silently using stale output.

## Build sequence

Keep the complete monorepo source and root lockfile available to the builder. The app directory alone is insufficient: the shared workspace, root TypeScript configuration and install helper are required. Generated native projects, caches, local data, deployment environment files and prior artifacts remain excluded.

For a local or custom CI preparation step, run from the repository root:

```sh
npm ci --no-audit
npm run eas-build-post-install --workspace @cubers/mobile
```

With managed EAS builds, run the CLI from `apps/mobile`. Expo runs this hook after dependency installation and native prebuild; on iOS it also follows CocoaPods installation. It still precedes app-code bundling. Custom EAS build workflows do not invoke lifecycle hooks automatically and must explicitly include the preparation command. See Expo's [lifecycle hook reference](https://docs.expo.dev/build-reference/npm-hooks/) and [monorepo setup](https://docs.expo.dev/build-reference/build-with-monorepos/).

All four supplied EAS profiles explicitly set `NPM_CONFIG_AUDIT=false`, in addition to the existing root npm setting. This preserves the owner's saved-audit-only choice during installs. No new audit or dependency inventory upload is authorized. The production profiles retain their original INTL/CN community settings.

Configure actual regional/discovery HTTPS addresses before a distribution build. They are public build settings; provider keys stay on the regional backend. Both backends remain undeployed as confirmed by the owner. No real addresses, project ID, signing credentials, developer account, launch territory or store destination has been invented. The existing production signing and release gates remain in place.

## Verification

The permanent fresh-source regression copies current shared sources without `dist`, uses the installed locked compiler/runtime dependencies, and runs the actual hook from the mobile directory. A fixture-only marker proves that newly compiled code is loaded from that fixture. Changing it replaces stale output; a deliberate TypeScript error makes the hook fail. Fixture sources and output are private temporary files and are removed afterward. Profile and actual Metro configuration regressions also pass.

A separate local Linux/ARM64 check starts with an empty application directory, performs a real lockfile install with audit disabled, copies source without generated shared code, and runs the mobile hook. The resulting shared runtime resolves successfully. The same clean build exports **web, iOS and Android** JavaScript with reserved example addresses. No additional lifecycle-script approval is granted; the existing Linux embedded-Postgres script warning remains recorded.

These checks establish local source/dependency preparation and JavaScript packaging. They do not run a remote EAS job, upload an archive, sign a build, install an app, inspect app UI, or establish native/device, provider, operational or legal acceptance. Actual remote archive contents and macOS/Linux native toolchains still need commissioning with the operator's accounts. Earlier native binaries remain preserved.

Private evidence is under ignored `.data/cloud-build/`. The refreshed local store candidate records the build-hook and native build configuration sources; it is not submitted or approved. See [Android builds](ANDROID-BUILD.md), [iOS builds](IOS-BUILD.md), [store materials](STORE-PACKAGE.md) and the complete remaining [release requirements](RELEASE.md).
