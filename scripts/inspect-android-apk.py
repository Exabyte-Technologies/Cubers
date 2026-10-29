"""Static checks for a Cubers ARM64 debug or unsigned review APK; never runs it.

Uses an already installed Android SDK. Output must be a new directory.
This is packaging evidence, not release signing or device acceptance.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import time
import zipfile


PAGE = 16384


def elf_layout(data):
    if len(data) < 64 or data[:6] != b"\x7fELF\x02\x01":
        raise ValueError("Expected a little-endian ELF64 library")
    header = struct.unpack_from("<HHIQQQIHHHHHH", data, 16)
    offset, size, count = header[4], header[8], header[9]
    if not (size == 56 and 0 < count < 4096 and offset + count * size <= len(data)):
        raise ValueError("Invalid ELF program-header extent")
    segments = [
        struct.unpack_from("<IIQQQQQQ", data, offset + i * size)
        for i in range(count)
    ]
    loads = [p for p in segments if p[0] == 1]
    relros = [p for p in segments if p[0] == 0x6474E552]
    if not loads or any(p[5] > p[6] or p[2] + p[5] > len(data) for p in loads):
        raise ValueError("Invalid ELF load extent")
    relro_checks = []
    for relro in relros:
        start, length = relro[3], relro[6]
        end = start + length
        # GNU_RELRO can include padding beyond its LOAD's actual memory bytes.
        # Bionic also treats p_memsz >= LOAD.p_memsz as the entire LOAD case.
        own_load = any(
            p[3] == start and p[6] > 0 and p[3] + p[6] <= end
            and end <= (p[3] + p[6] + PAGE - 1) // PAGE * PAGE
            for p in loads
        )
        containing = any(p[3] <= start and end <= p[3] + p[6] for p in loads)
        rounded_start, rounded_end = start // PAGE * PAGE, (end + PAGE - 1) // PAGE * PAGE
        extra_writable_overlap = False
        for p in loads:
            left, right = max(p[3], rounded_start), min(p[3] + p[6], rounded_end)
            if p[1] & 2 and left < right and (left < start or right > end):
                extra_writable_overlap = True
        relro_checks.append({
            "virtualAddress": start,
            "memoryBytes": length,
            "endAligned": end % PAGE == 0,
            "entireLoad": own_load,
            "layout16KiB": length > 0 and (containing or own_load)
            and not extra_writable_overlap,
        })
    return {
        "arm64": header[1] == 183,
        "minimumLoadAlignment": min(p[7] for p in loads),
        "load16KiBAligned": all(
            p[7] >= PAGE and p[2] % PAGE == p[3] % PAGE for p in loads
        ),
        "relro": relro_checks,
        "relroLayout16KiB": all(p["layout16KiB"] for p in relro_checks),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--sdk", type=Path, required=True)
    parser.add_argument("--build-tools", default="36.0.0")
    parser.add_argument("--mode", choices=["debug", "unsigned-review", "development", "development-debug"], default="debug")
    args = parser.parse_args()
    apk, out = args.apk.resolve(strict=True), args.output.absolute()
    if not apk.is_file():
        parser.error("APK must be a regular file")
    tools = args.sdk.resolve(strict=True) / "build-tools" / args.build_tools
    for tool in ["aapt2", "apksigner", "zipalign"]:
        if not (tools / tool).is_file():
            parser.error("Install the requested Android build tools first")
    out.mkdir(mode=0o700)  # Refuse to overwrite prior evidence.
    original_hash = hashlib.sha256(apk.read_bytes()).hexdigest()

    def run(name, command):
        result = subprocess.run(
            [str(x) for x in command], text=True, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, timeout=120, check=False,
        )
        (out / name).write_text(result.stdout)
        return result

    badging = run("badging.log", [tools / "aapt2", "dump", "badging", apk])
    manifest = run("manifest.log", [tools / "aapt2", "dump", "xmltree", "--file", "AndroidManifest.xml", apk])
    signing = run("signature.log", [tools / "apksigner", "verify", "--verbose", "--print-certs", apk])
    alignment = run("alignment.log", [tools / "zipalign", "-c", "-P", "16", "-v", "4", apk])
    package = re.search(r"package: name='([^']+)'", badging.stdout)
    permissions = re.findall(r"uses-permission[^\n]*name='([^']+)'", badging.stdout)
    report = {
        "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "apk": str(apk), "bytes": apk.stat().st_size, "sha256": original_hash,
        "mode": args.mode,
        "package": package.group(1) if package else None,
        "manifestDecoded": badging.returncode == 0 and manifest.returncode == 0,
        "debuggable": "application-debuggable" in badging.stdout,
        "target36": "targetSdkVersion:'36'" in badging.stdout,
        "backupDisabled": bool(re.search(
            r"android:allowBackup[^\n]*=(?:false|\(type 0x12\)0x0)\s*$",
            manifest.stdout, re.M,
        )),
        "permissions": permissions,
        "microphonePermissionAbsent": "android.permission.RECORD_AUDIO" not in permissions,
        "cameraPermission": "android.permission.CAMERA" in permissions,
        "bluetoothPermission": "android.permission.BLUETOOTH_CONNECT" in permissions,
        "signatureValid": signing.returncode == 0,
        "androidDebugCertificate": bool(re.search(r"Signer #1 certificate DN:.*CN=Android Debug", signing.stdout)),
        "zip16KiBAlignment": alignment.returncode == 0,
        "nativeLibraries": [], "runtimeTested": False, "releaseAccepted": False,
    }
    with zipfile.ZipFile(apk) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate APK archive entries")
        dex = b"".join(archive.read(n) for n in names if re.fullmatch(r"classes\d*\.dex", n))
        report["integrityModulePackaged"] = b"Lexpo/modules/integrity/IntegrityModule;" in dex
        report["cryptoModulePackaged"] = b"Lexpo/modules/crypto/CryptoModule;" in dex
        report["embeddedJavaScript"] = "assets/index.android.bundle" in names
        if report["embeddedJavaScript"]:
            bundle = archive.read("assets/index.android.bundle")
            report["bundle"] = {
                "bytes": len(bundle), "sha256": hashlib.sha256(bundle).hexdigest(),
                "magic": bundle[:8].hex(),
                "hermesBytecode": len(bundle) > 1024 and bundle[:8].hex() == "c61fbc03c103191f",
            }
        # Android v2/v3 signatures have this footer immediately before the
        # central directory. JAR signatures use META-INF certificate/SF files.
        # A verifier failure by itself does not prove an archive is unsigned.
        with apk.open("rb") as stream:
            stream.seek(max(0, archive.start_dir - 16))
            report["apkSigningBlockPresent"] = stream.read(16) == b"APK Sig Block 42"
        report["jarSignatureEntries"] = sorted(
            n for n in names if re.fullmatch(r"META-INF/[^/]+\.(?:RSA|DSA|EC|SF)", n, re.I)
        )
        report["signatureAbsent"] = (
            signing.returncode == 1 and "DOES NOT VERIFY" in signing.stdout
            and not report["apkSigningBlockPresent"] and not report["jarSignatureEntries"]
        )
        report["launcherResources"] = sorted(n for n in names if "ic_launcher" in n)
        report["launcherResourceLookup"] = "Archive names only; optimized builds may rename resources"
        for name in names:
            if name.startswith("lib/") and name.endswith(".so"):
                data = archive.read(name)
                report["nativeLibraries"].append({
                    "path": name,
                    "sha256": hashlib.sha256(data).hexdigest(),
                    **elf_layout(data),
                })
    libraries = report["nativeLibraries"]
    report["allNativeArm64"] = bool(libraries) and all(
        x["arm64"] and x["path"].startswith("lib/arm64-v8a/") for x in libraries
    )
    report["allNative16KiBLoadAligned"] = bool(libraries) and all(x["load16KiBAligned"] for x in libraries)
    report["allNative16KiBRelroLayout"] = bool(libraries) and all(x["relroLayout16KiB"] for x in libraries)
    report["apkUnchangedDuringInspection"] = original_hash == hashlib.sha256(apk.read_bytes()).hexdigest()
    checks = [
        "manifestDecoded", "target36", "backupDisabled",
        "microphonePermissionAbsent", "cameraPermission", "bluetoothPermission",
        "zip16KiBAlignment",
        "integrityModulePackaged", "cryptoModulePackaged", "allNativeArm64",
        "allNative16KiBLoadAligned", "allNative16KiBRelroLayout",
        "apkUnchangedDuringInspection",
    ]
    if args.mode in ["debug", "development-debug"]:
        checks += ["debuggable", "signatureValid", "androidDebugCertificate"]
    else:
        report["nonDebuggable"] = not report["debuggable"]
        report["embeddedHermes"] = report.get("bundle", {}).get("hermesBytecode", False)
        checks += ["nonDebuggable", "embeddedJavaScript", "embeddedHermes"]
        checks += ["signatureValid", "androidDebugCertificate"] if args.mode == "development" else ["signatureAbsent"]
    expected_package = "app.cubers.mobile.dev" if args.mode.startswith("development") else "app.cubers.mobile"
    report["passed"] = report["package"] == expected_package and all(report[x] for x in checks)
    (out / "inspection.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k not in ["nativeLibraries", "launcherResources", "permissions"]}, indent=2))
    print("Native libraries:", len(libraries))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
