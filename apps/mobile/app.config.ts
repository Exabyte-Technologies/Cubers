import type { ExpoConfig } from "expo/config";
const appAttestEnvironment = process.env.CUBERS_APP_ATTEST_ENV;
const developmentTools = process.env.EXPO_PUBLIC_DEV_TOOLS === "true";
if (
  process.env.EXPO_PUBLIC_DEV_TOOLS &&
  !["true", "false"].includes(process.env.EXPO_PUBLIC_DEV_TOOLS)
)
  throw Error("EXPO_PUBLIC_DEV_TOOLS must be true or false");
if (
  developmentTools &&
  (/^production(?:-|$)/.test(process.env.EAS_BUILD_PROFILE || "") ||
    appAttestEnvironment === "production")
)
  throw Error(
    "Development tools cannot be included in a production profile or production App Attest build",
  );
if (
  appAttestEnvironment &&
  !["development", "production"].includes(appAttestEnvironment)
)
  throw Error("Invalid App Attest build environment");
const config: ExpoConfig = {
  name: "Cubers",
  slug: "cubers",
  scheme: developmentTools ? "cubers-dev" : "cubers",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/store-icon.png",
  locales: {
    en: developmentTools
      ? {
          ios: {
            ...require("./locales/en.json").ios,
            CFBundleDisplayName: "Cubers Dev",
            NSLocalNetworkUsageDescription:
              "Connect to the development servers you configure in Cubers Dev.",
          },
        }
      : "./locales/en.json",
    "zh-Hans": developmentTools
      ? {
          ios: {
            ...require("./locales/zh-Hans.json").ios,
            CFBundleDisplayName: "Cubers 开发版",
            NSLocalNetworkUsageDescription:
              "连接您在 Cubers 开发版中设置的开发服务器。",
          },
        }
      : "./locales/zh-Hans.json",
  },
  ios: {
    ...(appAttestEnvironment
      ? {
          entitlements: {
            "com.apple.developer.devicecheck.appattest-environment":
              appAttestEnvironment,
          },
        }
      : {}),
    supportsTablet: true,
    bundleIdentifier: developmentTools
      ? "app.cubers.mobile.dev"
      : "app.cubers.mobile",
    infoPlist: {
      ...(developmentTools
        ? {
            CFBundleDisplayName: "Cubers Dev",
            NSLocalNetworkUsageDescription:
              "Connect to the development servers you configure in Cubers Dev.",
            NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
          }
        : {}),
      CFBundleLocalizations: ["en", "zh-Hans"],
      NSCameraUsageDescription:
        "Scan puzzle colors and record ranked physical attempts with your consent.",
      NSBluetoothAlwaysUsageDescription:
        "Connect a supported smart cube to read puzzle moves.",
    },
  },
  android: {
    package: developmentTools ? "app.cubers.mobile.dev" : "app.cubers.mobile",
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-foreground.png",
      backgroundColor: "#f5f2e9",
    },
    permissions: [
      "android.permission.CAMERA",
      "android.permission.BLUETOOTH_CONNECT",
    ],
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon.png" },
  plugins: [
    ["expo-sharing", { ios: { enabled: false }, android: { enabled: false } }],
    "./plugins/with-local-reminders.js",
    [
      "expo-notifications",
      {
        defaultChannel: "cubers-practice",
        color: "#285c47",
        enableBackgroundRemoteNotifications: false,
      },
    ],
    "expo-router",
    ["expo-secure-store", { faceIDPermission: false }],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Choose photos or videos you want to share in a reviewed Cubers post.",
        cameraPermission:
          "Scan puzzle colors and record ranked physical attempts with your consent.",
        microphonePermission: false,
      },
    ],
    [
      "expo-video",
      { supportsBackgroundPlayback: false, supportsPictureInPicture: false },
    ],
    "./plugins/with-minimum-ios.js",
    "./plugins/with-ios-scenes.js",
    "./plugins/with-android-release.js",
    ...(developmentTools ? ["./plugins/with-development-tools.js"] : []),
    [
      "react-native-vision-camera",
      {
        cameraPermissionText:
          "Allow Cubers to scan your puzzle and record ranked attempts.",
        enableMicrophonePermission: false,
        enableLocation: false,
        enableFrameProcessors: false,
      },
    ],
    [
      "react-native-ble-plx",
      {
        isBackgroundEnabled: false,
        neverForLocation: true,
        modes: [],
        bluetoothAlwaysPermission: "Connect to your supported smart cube.",
      },
    ],
  ],
  experiments: { typedRoutes: false },
};
export default config;
