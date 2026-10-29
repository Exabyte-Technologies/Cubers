// The SDK 55 router imports query-string 7 through CommonJS. Keep that API
// while using the official patched ESM decoder, without changing router APIs.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "..");
let router;
try {
  const mobile = createRequire(path.join(root, "apps/mobile/package.json"));
  router = mobile.resolve("expo-router/package.json");
} catch (error) {
  // API/core/admin-only installations do not include the mobile router.
  if (error.code === "MODULE_NOT_FOUND") process.exit(0);
  throw error;
}
const file = createRequire(router).resolve("query-string");
const canonicalRoot = fs.realpathSync(root);
const canonicalFile = fs.realpathSync(file);
if (
  !canonicalFile.startsWith(canonicalRoot + path.sep) ||
  canonicalFile !== path.resolve(file) ||
  fs.lstatSync(file).isSymbolicLink() ||
  !fs.statSync(file).isFile() ||
  fs.statSync(file).nlink !== 1
)
  throw Error("Refusing a linked or external router dependency");
const source = fs.readFileSync(file, "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const original =
  "caa3f2c8b45dfe1e91db22ae10743af68de8d96f26515132bb52485ec0f037fa";
const prepared =
  "6493cda9948bab721c6301e12f8b6afdedaed30947faeeab9375fe1ee26470a8";
const version = JSON.parse(
  fs.readFileSync(path.join(path.dirname(file), "package.json"), "utf8"),
).version;
if (version !== "7.1.3" || ![original, prepared].includes(sha(source)))
  throw Error(
    "Unknown query-string source; review the compatibility bridge before updating",
  );
const decoder = createRequire(file).resolve("decode-uri-component");
if (
  JSON.parse(
    fs.readFileSync(path.join(path.dirname(decoder), "package.json"), "utf8"),
  ).version !== "0.5.0"
)
  throw Error("The SDK router requires the reviewed patched decoder");
if (sha(source) === original) {
  const changed = source.replace(
    "const decodeComponent = require('decode-uri-component');",
    "const decodeModule = require('decode-uri-component');\nconst decodeComponent = decodeModule.default || decodeModule;",
  );
  if (sha(changed) !== prepared)
    throw Error("Unexpected router compatibility output");
  fs.writeFileSync(file, changed);
}
console.log("SDK router decoder compatibility verified.");

// VisionCamera 4.7.3 can publish an empty device list before CameraX finishes
// initializing. Publish the completed list as well so cold standalone launches
// receive it, without requiring another camera connection or a debug reload.
function prepareAndroidCamera() {
  let manifest;
  try {
    manifest = createRequire(
      path.join(root, "apps/mobile/package.json"),
    ).resolve("react-native-vision-camera/package.json");
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") return;
    throw error;
  }
  const target = path.join(
    path.dirname(manifest),
    "android/src/main/java/com/mrousavy/camera/react/CameraDevicesManager.kt",
  );
  if (
    !fs.realpathSync(target).startsWith(canonicalRoot + path.sep) ||
    fs.realpathSync(target) !== path.resolve(target) ||
    fs.lstatSync(target).isSymbolicLink() ||
    !fs.statSync(target).isFile() ||
    fs.statSync(target).nlink !== 1
  )
    throw Error("Refusing a linked or external camera dependency");
  const original =
      "f2e7159e6715d14fa9eb5e5245bdd88ca960b1d59862474e0629d1ab8249c927",
    prepared =
      "76a594666b61f714ffe72e97f1b378c0f5efcde4ce3a330c0eeca325de4216ab",
    source = fs.readFileSync(target, "utf8");
  if (
    JSON.parse(fs.readFileSync(manifest, "utf8")).version !== "4.7.3" ||
    ![original, prepared].includes(sha(source))
  )
    throw Error("Unknown camera source; review the startup notification fix");
  if (sha(source) === original) {
    const changed = source.replace(
      'Log.i(TAG, "Successfully initialized!")',
      'Log.i(TAG, "Successfully initialized!")\n        // Cubers: publish devices discovered after the initial constants/event.\n        if (reactContext.hasActiveReactInstance()) sendAvailableDevicesChangedEvent()',
    );
    if (sha(changed) !== prepared)
      throw Error("Unexpected camera startup notification output");
    fs.writeFileSync(target, changed);
  }
  console.log("Android camera startup notification verified.");
}
prepareAndroidCamera();
