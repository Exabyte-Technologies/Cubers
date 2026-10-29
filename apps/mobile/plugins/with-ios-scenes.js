const { withAppDelegate, withInfoPlist } = require("@expo/config-plugins");
const fs = require("node:fs");
const { isDeepStrictEqual } = require("node:util");
const path = require("node:path");

const marker = "// Cubers scene lifecycle begin";
const scene = fs
  .readFileSync(path.join(__dirname, "ios/CubersSceneDelegate.swift"), "utf8")
  .trim();
const property =
  "  fileprivate var cubersLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?";
// Keep cold URLs in the initial launch options while notifying Expo's module
// subscribers. The generated warm-link override already calls RCTLinkingManager.
const initialCallbacks = `  // Cubers cold scene events
  fileprivate func cubersNotifyInitialURL(_ context: UIOpenURLContext) -> Bool {
    return super.application(UIApplication.shared, open: context.url, options: CubersSceneDelegate.urlOptions(context))
  }

  fileprivate func cubersNotifyInitialActivity(_ activity: NSUserActivity) {
    _ = super.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
  }

`;
const legacy =
  /#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)\s*#endif/;
function sceneAppDelegate(contents) {
  if (contents.includes(marker)) {
    if (
      !contents.includes(scene) ||
      !contents.includes(property) ||
      !contents.includes(initialCallbacks) ||
      legacy.test(contents)
    )
      throw Error(
        "Review the modified Cubers scene lifecycle before regenerating iOS",
      );
    return contents;
  }
  if (
    !contents.includes("class AppDelegate: ExpoAppDelegate {") ||
    !legacy.test(contents) ||
    !contents.includes("  // Linking API")
  )
    throw Error(
      "Review the generated Expo app delegate before applying Cubers scene support",
    );
  return (
    contents
      .replace(
        "class AppDelegate: ExpoAppDelegate {",
        "class AppDelegate: ExpoAppDelegate {\n" + property,
      )
      .replace(legacy, "    cubersLaunchOptions = launchOptions")
      .replace("  // Linking API", initialCallbacks + "  // Linking API")
      .trimEnd() +
    "\n\n" +
    scene +
    "\n"
  );
}
function sceneManifest(plist) {
  const manifest = {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: "Cubers",
          UISceneClassName: "UIWindowScene",
          UISceneDelegateClassName:
            "$(PRODUCT_MODULE_NAME).CubersSceneDelegate",
        },
      ],
    },
  };
  if (
    plist.UIApplicationSceneManifest &&
    // Expo's plist parser returns null-prototype dictionaries. Compare their
    // serializable values so a generated plist remains safe to regenerate.
    !isDeepStrictEqual(
      JSON.parse(JSON.stringify(plist.UIApplicationSceneManifest)),
      manifest,
    )
  )
    throw Error(
      "Review the existing scene manifest before replacing its lifecycle",
    );
  return { ...plist, UIApplicationSceneManifest: manifest };
}
function withIosScenes(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults = sceneManifest(mod.modResults);
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift")
      throw Error("Cubers scene support requires the Swift app delegate");
    mod.modResults.contents = sceneAppDelegate(mod.modResults.contents);
    return mod;
  });
}
module.exports = withIosScenes;
module.exports.sceneAppDelegate = sceneAppDelegate;
module.exports.sceneManifest = sceneManifest;
