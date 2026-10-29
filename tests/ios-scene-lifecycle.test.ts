import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const {
  sceneAppDelegate,
  sceneManifest,
} = require("../apps/mobile/plugins/with-ios-scenes.js");

test("iOS prebuild moves window startup into a single scene while retaining Expo/RN link and factory hooks", async () => {
  const original = await readFile(
    "tests/fixtures/ios/AppDelegate.swift",
    "utf8",
  );
  const result = sceneAppDelegate(original);
  assert.ok(!result.includes("UIWindow(frame: UIScreen.main.bounds)"));
  assert.equal((result.match(/factory\.startReactNative\(/g) || []).length, 1);
  assert.ok(result.includes("UIWindow(windowScene: scene)"));
  assert.ok(
    result.includes("configuration.delegateClass = CubersSceneDelegate.self"),
  );
  assert.ok(result.includes("launch[.url] = context.url"));
  assert.ok(result.includes("launch[.userActivityDictionary]"));
  assert.ok(result.includes("launch[.shortcutItem]"));
  for (const hook of [
    "super.application(app, open: url, options: options)",
    "RCTLinkingManager.application(app, open: url, options: options)",
    "RCTAppDependencyProvider()",
    "bridge.bundleURL ?? bundleURL()",
    'Bundle.main.url(forResource: "main", withExtension: "jsbundle")',
  ])
    assert.ok(result.includes(hook), hook);
  for (const event of [
    "sceneDidBecomeActive",
    "sceneWillResignActive",
    "sceneDidEnterBackground",
    "sceneWillEnterForeground",
    "performActionFor",
    "willContinueUserActivityWithType",
    "didFailToContinueUserActivityWithType",
  ])
    assert.ok(result.includes(event), event);
  assert.equal(sceneAppDelegate(result), result);
  assert.throws(
    () =>
      sceneAppDelegate(
        original.replace(
          "factory.startReactNative(",
          "customFactory.startReactNative(",
        ),
      ),
    /Review/,
  );
  assert.throws(
    () => sceneAppDelegate(result.replace("window = created", "window = nil")),
    /Review/,
  );
});

test("scene configuration is idempotent, preserves permissions and refuses replacing a different lifecycle", () => {
  const base = {
    NSCameraUsageDescription: "Scan only with consent",
    CFBundleURLTypes: [{ CFBundleURLSchemes: ["cubers"] }],
  };
  const result = sceneManifest(base);
  assert.equal(result.NSCameraUsageDescription, base.NSCameraUsageDescription);
  assert.deepEqual(result.CFBundleURLTypes, base.CFBundleURLTypes);
  assert.equal(
    result.UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes,
    false,
  );
  assert.equal(
    result.UIApplicationSceneManifest.UISceneConfigurations
      .UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName,
    "$(PRODUCT_MODULE_NAME).CubersSceneDelegate",
  );
  assert.deepEqual(sceneManifest(result), result);
  const reordered = structuredClone(result);
  reordered.UIApplicationSceneManifest = {
    UISceneConfigurations:
      result.UIApplicationSceneManifest.UISceneConfigurations,
    UIApplicationSupportsMultipleScenes: false,
  };
  assert.deepEqual(sceneManifest(reordered), result);
  const plist = require("@expo/plist").default;
  const parsed = plist.parse(plist.build(result));
  const regenerated = sceneManifest(parsed);
  assert.deepEqual(
    regenerated.UIApplicationSceneManifest,
    result.UIApplicationSceneManifest,
  );
  assert.equal(regenerated.CFBundleURLTypes, parsed.CFBundleURLTypes);
  assert.throws(
    () =>
      sceneManifest({
        ...base,
        UIApplicationSceneManifest: {
          UIApplicationSupportsMultipleScenes: true,
        },
      }),
    /Review/,
  );
  assert.equal(Object.hasOwn(base, "UIApplicationSceneManifest"), false);
});

test("built iOS inspection rejects the launch-crashing legacy package and a manifest without native implementation", () => {
  const output = execFileSync(
    "python3",
    [
      "-c",
      `import importlib.util,json
spec=importlib.util.spec_from_file_location("inspect_ios", "scripts/inspect-ios-app.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
manifest={"UIApplicationSceneManifest":{"UIApplicationSupportsMultipleScenes":False,"UISceneConfigurations":{"UIWindowSceneSessionRoleApplication":[{"UISceneClassName":"UIWindowScene","UISceneDelegateClassName":"Cubers.CubersSceneDelegate"}]}}}
print(json.dumps([m.scene_lifecycle_checks({},[b"LegacyAppDelegate"]),m.scene_lifecycle_checks(manifest,[b"LegacyAppDelegate"]),m.scene_lifecycle_checks(manifest,[b"CubersSceneDelegate"])]))`,
    ],
    { encoding: "utf8" },
  );
  assert.deepEqual(JSON.parse(output), [
    { singleSceneLifecycleDeclared: false, sceneDelegatePackaged: false },
    { singleSceneLifecycleDeclared: true, sceneDelegatePackaged: false },
    { singleSceneLifecycleDeclared: true, sceneDelegatePackaged: true },
  ]);
});
