"""Verify the built review APK's bundled model and 64-bit native ELF alignment."""
from pathlib import Path
import hashlib
import os
import struct
import subprocess
import zipfile

expected = "30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498"
apks = list(Path("android/app/build/outputs/apk/release").glob("*.apk"))
if not apks:
    raise SystemExit("No review APK found")
sdk = Path(os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT", ""))
tools = sorted(sdk.glob("build-tools/*/zipalign"), key=lambda p: tuple(int(n) for n in p.parent.name.split(".") if n.isdigit()))
if not tools:
    raise SystemExit("Android zipalign unavailable; APK alignment remains unverified")
for apk in apks:
    count = 0
    with zipfile.ZipFile(apk) as archive:
        model = archive.read("assets/inbox-speech-model.zip")
        if hashlib.sha256(model).hexdigest() != expected:
            raise SystemExit("Bundled speech model checksum mismatch")
        for entry in archive.infolist():
            if not entry.filename.startswith(("lib/arm64-v8a/", "lib/x86_64/")) or not entry.filename.endswith(".so"):
                continue
            if entry.file_size > 256 * 1024 * 1024:
                raise SystemExit("Native library unexpectedly large")
            data = archive.read(entry)
            if data[:6] != b"\x7fELF\x02\x01":
                raise SystemExit("Unexpected native ELF format: " + entry.filename)
            offset = struct.unpack_from("<Q", data, 32)[0]
            size, total = struct.unpack_from("<HH", data, 54)
            if size < 56 or offset + size * total > len(data):
                raise SystemExit("Malformed ELF program headers")
            loads = [struct.unpack_from("<IIQQQQQQ", data, offset + i * size) for i in range(total)]
            loads = [header for header in loads if header[0] == 1]
            if not loads or any(header[-1] < 16384 for header in loads):
                raise SystemExit("Native library lacks 16 KiB LOAD alignment: " + entry.filename)
            count += 1
    if not count:
        raise SystemExit("No 64-bit libraries checked")
    subprocess.run([str(tools[-1]), "-c", "-P", "16", "4", str(apk)], check=True)
    print(f"Verified {apk.name}: pinned offline model, {count} aligned 64-bit ELF libraries, and APK page alignment")
