#!/usr/bin/env python3
"""Smoke test that proves scripts/verify-android-aab-icon.py actually catches a
broken Android bundle (and passes a good one).

Why this exists:
  verify-android-aab-icon.py is the LAST line of defense before a blank-icon
  .aab reaches Google Play. It was hand-tested once against synthetic broken
  cases, but nothing locks that behavior in. A future tweak to the density
  tables (LAUNCHER_SIZES/FOREGROUND_SIZES), the luminance threshold
  (PLACEHOLDER_LUMINANCE_THRESHOLD), the MIN_REQUIRED_ICON_PX floor, or the
  .aab path matching could silently weaken the guard and we'd only find out
  when a generic-icon bundle slipped to the Play Store.

  This test builds fixture bundles in a tempdir (no committed binary blobs) and
  asserts the guard's exit code on each:
    - a GOOD bundle (all densities, correct sizes, dark navy brand)  -> exit 0
      * exercised BOTH as an extracted base/res tree (--extracted-dir) AND as a
        real zipped .aab (the unzip + base/res discovery path).
    - missing high-density raster (xxxhdpi ic_launcher.png dropped)  -> exit 1
    - missing adaptive XML (mipmap-anydpi/ic_launcher.xml dropped)   -> exit 1
    - near-white placeholder (blank/default icon, not the navy brand) -> exit 1
    - no rasters at all (every ic_launcher*.png dropped)             -> exit 1

PNG fixtures are written with a tiny pure-stdlib solid-color PNG encoder so the
test has no third-party dependency. The guard reads dimensions from the PNG
header (stdlib) and luminance via ImageMagick/Pillow, both available on the
Codemagic runner and the dev box.

Run with: `python3 scripts/verify-android-aab-icon-smoke.py`
Exit status: 0 = the guard behaves correctly on every case, 1 = it misbehaved.
"""

import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile
import zlib

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(REPO_ROOT, "scripts", "verify-android-aab-icon.py")

# Mirror the guard's own density/size tables so the fixtures are valid bundles.
DENSITIES = ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")
LAUNCHER_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

NAVY = (0x00, 0x06, 0x2B, 0xFF)  # GoodTunes brand #00062B, opaque -> low luminance
NEAR_WHITE = (0xFA, 0xFA, 0xFA, 0xFF)  # blank/default placeholder -> high luminance

ADAPTIVE_XML_BODY = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    '  <background android:drawable="@color/ic_launcher_background"/>\n'
    '  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
    "</adaptive-icon>\n"
)


def _png_chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_solid_png(path, size, rgba):
    """Write a valid size×size 8-bit RGBA PNG of one solid color, stdlib only."""
    width = height = size
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    row = b"\x00" + bytes(rgba) * width  # filter byte 0 + width RGBA pixels
    raw = row * height
    idat = zlib.compress(raw, 9)
    with open(path, "wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n")
        handle.write(_png_chunk(b"IHDR", ihdr))
        handle.write(_png_chunk(b"IDAT", idat))
        handle.write(_png_chunk(b"IEND", b""))


def build_good_res(res_root, launcher_rgba=NAVY):
    """Create a complete, correct base/res launcher-icon tree."""
    anydpi = os.path.join(res_root, "mipmap-anydpi-v4")
    os.makedirs(anydpi, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(anydpi, name), "w") as handle:
            handle.write(ADAPTIVE_XML_BODY)

    for density in DENSITIES:
        ddir = os.path.join(res_root, f"mipmap-{density}-v4")
        os.makedirs(ddir, exist_ok=True)
        write_solid_png(
            os.path.join(ddir, "ic_launcher.png"), LAUNCHER_SIZES[density], launcher_rgba
        )
        write_solid_png(
            os.path.join(ddir, "ic_launcher_round.png"),
            LAUNCHER_SIZES[density],
            launcher_rgba,
        )
        write_solid_png(
            os.path.join(ddir, "ic_launcher_foreground.png"),
            FOREGROUND_SIZES[density],
            launcher_rgba,
        )


def zip_extracted_as_aab(extracted_dir, aab_path):
    """Zip an extracted bundle tree into a real .aab (the unzip path under test)."""
    with zipfile.ZipFile(aab_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(extracted_dir):
            for fname in files:
                full = os.path.join(root, fname)
                arc = os.path.relpath(full, extracted_dir)
                zf.write(full, arc)


def run_guard_extracted(extracted_dir):
    proc = subprocess.run(
        [sys.executable, GUARD, "--extracted-dir", extracted_dir],
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stdout + proc.stderr


def run_guard_aab(aab_path):
    proc = subprocess.run(
        [sys.executable, GUARD, aab_path], capture_output=True, text=True
    )
    return proc.returncode, proc.stdout + proc.stderr


class Results:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def check(self, name, expected_code, actual_code, output):
        ok = actual_code == expected_code
        if ok:
            self.passed += 1
            print(f"  ok   {name} (exit {actual_code})")
        else:
            self.failed += 1
            print(
                f"  FAIL {name}: expected exit {expected_code}, got {actual_code}",
                file=sys.stderr,
            )
            for line in output.strip().splitlines():
                print(f"         | {line}", file=sys.stderr)


def main():
    if not os.path.isfile(GUARD):
        print(f"smoke: guard script not found at {GUARD}", file=sys.stderr)
        return 1

    work = tempfile.mkdtemp(prefix="aab-icon-smoke-")
    res = Results()
    try:
        # --- GOOD bundle: extracted base/res tree -> exit 0 ---
        good = os.path.join(work, "good", "base", "res")
        build_good_res(good)
        code, out = run_guard_extracted(os.path.join(work, "good"))
        res.check("good bundle (extracted base/res)", 0, code, out)

        # --- GOOD bundle: real zipped .aab -> exit 0 (exercise unzip path) ---
        aab = os.path.join(work, "good-app.aab")
        zip_extracted_as_aab(os.path.join(work, "good"), aab)
        code, out = run_guard_aab(aab)
        res.check("good bundle (zipped .aab)", 0, code, out)

        # --- BROKEN: missing high-density (xxxhdpi) launcher raster -> exit 1 ---
        broken1 = os.path.join(work, "missing-xxxhdpi", "base", "res")
        build_good_res(broken1)
        os.remove(os.path.join(broken1, "mipmap-xxxhdpi-v4", "ic_launcher.png"))
        code, out = run_guard_extracted(os.path.join(work, "missing-xxxhdpi"))
        res.check("missing high-density raster", 1, code, out)

        # --- BROKEN: missing adaptive-icon XML -> exit 1 ---
        broken2 = os.path.join(work, "missing-adaptive-xml", "base", "res")
        build_good_res(broken2)
        os.remove(os.path.join(broken2, "mipmap-anydpi-v4", "ic_launcher.xml"))
        code, out = run_guard_extracted(os.path.join(work, "missing-adaptive-xml"))
        res.check("missing adaptive XML", 1, code, out)

        # --- BROKEN: near-white placeholder icon (blank/default) -> exit 1 ---
        broken3 = os.path.join(work, "near-white", "base", "res")
        build_good_res(broken3, launcher_rgba=NEAR_WHITE)
        code, out = run_guard_extracted(os.path.join(work, "near-white"))
        res.check("near-white placeholder icon", 1, code, out)

        # --- BROKEN: no launcher rasters at all -> exit 1 ---
        broken4 = os.path.join(work, "no-rasters", "base", "res")
        anydpi = os.path.join(broken4, "mipmap-anydpi-v4")
        os.makedirs(anydpi, exist_ok=True)
        for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
            with open(os.path.join(anydpi, name), "w") as handle:
                handle.write(ADAPTIVE_XML_BODY)
        code, out = run_guard_extracted(os.path.join(work, "no-rasters"))
        res.check("no launcher rasters", 1, code, out)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    total = res.passed + res.failed
    print(f"\naab-icon-smoke: {res.passed}/{total} cases behaved correctly")
    if res.failed:
        print(
            "\naab-icon-smoke FAILED: the built-AAB icon guard did not behave as "
            "expected on one or more cases above. Either the guard regressed (it no "
            "longer catches a broken bundle / rejects a good one) or this test's "
            "fixtures drifted from the guard's density tables — investigate before "
            "merging, because this guard is what keeps a blank-icon .aab off Google "
            "Play.",
            file=sys.stderr,
        )
        return 1
    print("aab-icon-smoke: the guard catches every broken bundle and passes the good one.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
