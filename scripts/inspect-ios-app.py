"""Inspect a built Cubers development app without installing or launching it.

Requires macOS/Xcode command-line tools. Output must be a new directory.
This records packaging and SDK declarations, not device or privacy approval.
"""

import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import re
import subprocess
import time


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()



def scene_lifecycle_checks(info, executables):
    manifest = info.get("UIApplicationSceneManifest", {})
    configurations = manifest.get("UISceneConfigurations", {}) if isinstance(manifest, dict) else {}
    scenes = configurations.get("UIWindowSceneSessionRoleApplication", []) if isinstance(configurations, dict) else []
    declaration = (
        isinstance(manifest, dict)
        and manifest.get("UIApplicationSupportsMultipleScenes") is False
        and isinstance(scenes, list) and len(scenes) == 1
        and isinstance(scenes[0], dict)
        and scenes[0].get("UISceneClassName") == "UIWindowScene"
        and str(scenes[0].get("UISceneDelegateClassName", "")).endswith(".CubersSceneDelegate")
    )
    return {
        "singleSceneLifecycleDeclared": bool(declaration),
        "sceneDelegatePackaged": bool(declaration) and any(b"CubersSceneDelegate" in data for data in executables),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--platform", choices=["simulator", "device"], required=True)
    parser.add_argument("--require-embedded-javascript", action="store_true")
    parser.add_argument("--mode", choices=["review", "development"], default="review")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    app = args.app.resolve(strict=True)
    if not app.is_dir() or app.suffix != ".app":
        parser.error("Expected an existing .app directory")
    out = args.output.absolute()
    out.mkdir(mode=0o700)

    def run(name, command):
        result = subprocess.run(
            [str(x) for x in command], text=True, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, timeout=120, check=False,
        )
        (out / name).write_text(result.stdout)
        return result

    info = plistlib.loads((app / "Info.plist").read_bytes())
    binary = app / info["CFBundleExecutable"]
    arches = run("architectures.log", ["/usr/bin/lipo", "-archs", binary])
    platform = run("platform.log", ["/usr/bin/xcrun", "vtool", "-show-build", binary])
    signing = run("signature.log", ["/usr/bin/codesign", "-d", "--verbose=4", app])
    localizations = {}
    for locale in ["en", "zh-Hans"]:
        source = json.loads((root / f"apps/mobile/locales/{locale}.json").read_text())["ios"]
        if args.mode == "development":
            source = {**source, "CFBundleDisplayName": "Cubers Dev" if locale == "en" else "Cubers 开发版",
                      "NSLocalNetworkUsageDescription": "Connect to the development servers you configure in Cubers Dev." if locale == "en" else "连接您在 Cubers 开发版中设置的开发服务器。"}
        compiled = app / f"{locale}.lproj/InfoPlist.strings"
        result = run(f"locale-{locale}.json", ["/usr/bin/plutil", "-convert", "json", "-o", "-", compiled])
        if result.returncode:
            raise ValueError(f"Cannot read packaged permission locale: {locale}")
        values = json.loads(result.stdout)
        localizations[locale] = {
            "sha256": digest(compiled), "values": values,
            "matchesSource": values == source,
        }
    privacy = []
    for file in sorted(app.rglob("*.xcprivacy")):
        if file.is_symlink():
            raise ValueError("Review a linked privacy manifest separately")
        privacy.append({
            "path": str(file.relative_to(app)), "sha256": digest(file),
            "declaration": plistlib.loads(file.read_bytes()),
        })
    executables = [binary]
    debug = app / (binary.name + ".debug.dylib")
    if debug.is_file():
        executables.append(debug)
    module_markers = {name: False for name in ["ExpoAppIntegrity", "VisionCamera", "MultiplatformBleAdapter"]}
    for file in executables:
        data = file.read_bytes()
        for name in module_markers:
            module_markers[name] |= name.encode() in data
    arm_arches = arches.stdout.strip().split() if arches.returncode == 0 else []
    platforms = re.findall(r"^\s*platform\s+(\S+)", platform.stdout, re.M)
    minimum = info.get("MinimumOSVersion", "")
    javascript = app / "main.jsbundle"
    sdk, platform_name, allowed_arches = (
        ("iphonesimulator", "IOSSIMULATOR", {"arm64", "x86_64"})
        if args.platform == "simulator" else ("iphoneos", "IOS", {"arm64"})
    )
    no_team_signature = (
        signing.returncode != 0 and "code object is not signed at all" in signing.stdout
    ) or ("Signature=adhoc" in signing.stdout and "TeamIdentifier=not set" in signing.stdout)
    checks = {
        "bundleIdentity": info.get("CFBundleIdentifier") == ("app.cubers.mobile.dev" if args.mode == "development" else "app.cubers.mobile"),
        "expectedPlatform": info.get("DTPlatformName") == sdk
        and bool(platforms) and all(p == platform_name for p in platforms),
        "expectedArchitectures": bool(arm_arches) and set(arm_arches) <= allowed_arches,
        "noTeamSigning": no_team_signature,
        "minimumIos16": minimum == "16.0",
        "declaredLanguages": set(info.get("CFBundleLocalizations", [])) == {"en", "zh-Hans"},
        "packagedPermissionsMatchSource": all(v["matchesSource"] for v in localizations.values()),
        "unusedFaceIdDeclarationAbsent": "NSFaceIDUsageDescription" not in info,
        "microphoneDeclarationAbsent": "NSMicrophoneUsageDescription" not in info,
        "compiledAssetsPresent": (app / "Assets.car").is_file(),
        "nativeModuleMarkers": all(module_markers.values()),
        "requiredJavaScriptPresent": not args.require_embedded_javascript
        or (javascript.is_file() and javascript.stat().st_size > 0),
    }
    checks.update(scene_lifecycle_checks(info, [file.read_bytes() for file in executables]))
    if args.mode == "development":
        checks["developmentHttpServersAllowed"] = info.get("NSAppTransportSecurity", {}).get("NSAllowsArbitraryLoads") is True
        checks["developmentLocalNetworkNotice"] = bool(info.get("NSLocalNetworkUsageDescription"))
    report = {
        "schema": 1, "platform": args.platform,
        "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "app": str(app), "bundleId": info.get("CFBundleIdentifier"),
        "version": info.get("CFBundleShortVersionString"), "build": info.get("CFBundleVersion"),
        "minimumIos": minimum, "architectures": arm_arches, "platforms": platforms,
        "signatureInspectionExit": signing.returncode,
        "embeddedJavaScript": javascript.is_file() and javascript.stat().st_size > 0,
        "javascriptBundle": {"bytes": javascript.stat().st_size, "sha256": digest(javascript)}
        if javascript.is_file() else None,
        "localizations": localizations, "nativeModuleMarkers": module_markers,
        "privacyManifests": privacy,
        "privacyDeclarationsApproved": False, "runtimeTested": False,
        "teamSigned": not no_team_signature, "releaseAccepted": False,
        "hashes": {str(p.relative_to(app)): digest(p) for p in [*executables, app / "Info.plist", app / "Assets.car"]},
        "checks": checks, "passed": all(checks.values()),
    }
    (out / "inspection.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"passed": report["passed"], "checks": checks,
                      "privacyManifests": len(privacy), "architectures": arm_arches}, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
