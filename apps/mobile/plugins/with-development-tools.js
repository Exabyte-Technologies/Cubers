const {
  withAndroidManifest,
  withStringsXml,
  withMainApplication,
  withAppDelegate,
} = require("@expo/config-plugins");
module.exports = function withDevelopmentTools(config) {
  if (process.env.EXPO_PUBLIC_DEV_TOOLS !== "true") return config;
  config = withStringsXml(config, (mod) => {
    const entry = mod.modResults.resources.string.find(
      (row) => row.$.name === "app_name",
    );
    if (!entry) throw Error("Development app name resource is missing");
    entry._ = "Cubers Dev";
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    const marker = "// Cubers explicit developer-menu entry";
    if (!mod.modResults.contents.includes(marker)) {
      if (
        mod.modResults.language !== "kt" ||
        !mod.modResults.contents.includes("super.onCreate()")
      )
        throw Error(
          "Review development menu setup for the generated Android application",
        );
      mod.modResults.contents = mod.modResults.contents.replace(
        "super.onCreate()",
        `super.onCreate()
    ${marker}
    getSharedPreferences("expo.modules.devmenu.sharedpreferences", android.content.Context.MODE_PRIVATE).edit()
      .putBoolean("showFab", false).putBoolean("showsAtLaunch", false)
      .putBoolean("isOnboardingFinished", true).apply()`,
      );
    }
    return mod;
  });
  config = withAppDelegate(config, (mod) => {
    const marker = "// Cubers explicit developer-menu entry";
    if (!mod.modResults.contents.includes(marker)) {
      if (
        mod.modResults.language !== "swift" ||
        !mod.modResults.contents.includes(
          "let delegate = ReactNativeDelegate()",
        )
      )
        throw Error(
          "Review development menu setup for the generated iOS delegate",
        );
      mod.modResults.contents = mod.modResults.contents.replace(
        "let delegate = ReactNativeDelegate()",
        `${marker}
    UserDefaults.standard.set(false, forKey: "EXDevMenuShowFloatingActionButton")
    UserDefaults.standard.set(false, forKey: "EXDevMenuShowsAtLaunch")
    UserDefaults.standard.set(true, forKey: "EXDevMenuIsOnboardingFinished")
    let delegate = ReactNativeDelegate()`,
      );
    }
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (!app) throw Error("Development application manifest is missing");
    app.$["android:usesCleartextTraffic"] = "true";
    const metadata = (app["meta-data"] ??= []);
    const flag = metadata.find(
      (item) => item.$["android:name"] === "EXDevMenuShowFloatingActionButton",
    );
    if (flag) flag.$["android:value"] = "false";
    else
      metadata.push({
        $: {
          "android:name": "EXDevMenuShowFloatingActionButton",
          "android:value": "false",
        },
      });
    return mod;
  });
};
