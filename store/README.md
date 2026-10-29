# Cubers store submission package

The source copy is in `listings.json`, with English and Simplified Chinese text, Apple/Google locale mappings, and deliberately unset release decisions. Publisher details come from the shared owner-supplied operator record. Mainland details use 北京聚缘琴科技有限公司 and the Chinese postal address; international English details use the supplied English name/address.

Build a new local candidate from the repository root:

```sh
npm run build:core
node scripts/build-store-package.mjs artifacts/store/NEW_DIRECTORY
```

The output directory must be a new direct child of `artifacts/store`. The tool refuses to overwrite previous candidates, checks text limits and cited source paths, and verifies image dimensions, format, transparency, size and Android foreground geometry. It writes a manifest with hashes and unresolved release decisions. It does not contact a store, create an account or approve a release.

For the initial source-asset update, add `--sync-native-icons`. This creates `apps/mobile/assets/store-icon.png` and `adaptive-foreground.png`, refusing to overwrite different existing files. Expo config uses those files; run native prebuild/build and test masks on actual devices before submitting. The old icons and APK remain preserved. The store icon is a square opaque export of the original vector mark; the Android foreground has transparency and fits the central 66/108 zone. Geometric checks do not establish native mask acceptance.

Generated 1024×500 English/Chinese feature graphics are original puzzle artwork, not screenshots or evidence that a device workflow passed. They extend the existing palette with labeled 2×2, 3×3, 4×4 and Pyraminx artwork. The Google icon is 512×512 RGBA; the Apple icon is 1024×1024 opaque RGB. Editable SVG feature sources accompany the PNGs. No store badges, rankings, testimonials, price claims or third-party characters are added.

Before upload, inspect the final signed candidate and every advertised feature. The text does not advertise unaccepted Bluetooth models, live cloud AI, hardware certification or guaranteed anti-cheating. This copy does not change the full implementation scope; add descriptions of those capabilities only after their separate activation and acceptance. Verify rights to the name and assets independently.

The corporate homepages are not invented Cubers support/privacy/deletion endpoints. Resolve those URL fields to actual stable public human-readable pages and test them while signed out. Select actual launch territories, Android channels, category, audience and age ratings after reviewing the final behavior and regional classification. Category selection must not substitute for a mainland competition/game classification review. No filing number, developer-account identity, age rating or reviewer credential is fabricated.

`privacy-inventory.json` is a source-backed operator worksheet. The generated dependency inventory covers direct mobile dependencies, not the complete native/transitive SDK or final archive. Reconcile actual processors, optional services, logging, third-party SDK behavior, native privacy manifests and permissions against the signed binary. Do not submit these worksheets as approved privacy answers. `REVIEWER-NOTES.md` supplies review steps and a screenshot shot list; actual private access, signed builds and genuine native captures are still required.

Sources checked 2026-10-24:

- [Google listing text](https://support.google.com/googleplay/android-developer/answer/9859152): name 30 characters, short description 80, full description 4000.
- [Apple product page](https://developer.apple.com/app-store/product-page/) and [version metadata](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/): subtitle 30 characters, promotional text 170, description 4000 and keywords 100 bytes. The exporter also checks keyword length conservatively.
- [Google artwork](https://support.google.com/googleplay/android-developer/answer/9866151): 512×512 icon and 1024×500 feature graphic, with separate alpha/format rules.
- [Android adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive): separate foreground/background layers with a central safe zone; actual launcher masks still need device acceptance.
- [Apple privacy](https://developer.apple.com/app-store/app-privacy-details/) and [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469): final declarations depend on actual collection and third-party processing. Recheck requirements at submission.
