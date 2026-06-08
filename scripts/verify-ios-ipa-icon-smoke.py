#!/usr/bin/env python3
"""Smoke test that proves scripts/verify-ios-ipa-icon.py actually catches a
broken iOS build (and passes a good one).

Why this exists:
  verify-ios-ipa-icon.py is the LAST line of defense before a blank/generic-icon
  .ipa reaches App Store review. This is not hypothetical: TestFlight builds 59,
  64 and 66 shipped Apple's generic placeholder even though the source asset
  catalog was correct ("source-correct, binary-wrong"). The guard was reasoned
  about once, but nothing locks its behavior in. A future tweak to the size floor
  (MIN_REQUIRED_ICON_PX), the luminance threshold
  (PLACEHOLDER_LUMINANCE_THRESHOLD), the rendition parsing, or the
  Payload/<App>.app path matching could silently weaken the guard and we'd only
  find out when a placeholder build slipped to Apple.

  This test builds fixture .app bundles in a tempdir (no committed binary blobs)
  and asserts the guard's exit code on each:
    - a GOOD bundle (navy AppIcon embedded at >= 120px)              -> exit 0
      * exercised BOTH as an extracted .app (--app-dir) AND as a real
        zipped .ipa with the Payload/<App>.app layout (the unzip path).
    - missing the required icon size (only a sub-120px icon embedded) -> exit 1
    - near-white placeholder icon (blank/default, not the navy brand) -> exit 1
    - no icons embedded at all (no Assets.car, no loose AppIcon PNGs)  -> exit 1

  The fixtures drive the platform-stable loose-AppIcon-PNG path of the guard
  (size read from the PNG header, luminance via Pillow or ImageMagick), so the
  smoke behaves identically on the Linux dev box / CI runner and on macOS,
  where `assetutil` would otherwise be required to read a real compiled
  Assets.car.

  The end-to-end fixtures above can only exercise the loose-PNG path off macOS,
  because the guard's PRIMARY real-world signal — reading AppIcon renditions out
  of a compiled `Assets.car` via `assetutil` — needs a Mac. That signal is
  exactly the "source-correct, binary-wrong" placeholder case (TestFlight 59, 64,
  66) the guard exists to catch, so leaving its parser untested is the biggest
  gap. We close it by unit-testing the pure `parse_appicon_renditions()` directly
  against captured `assetutil --info` JSON strings (a healthy catalog with
  >= 120px AppIcon renditions, and a placeholder catalog with zero AppIcon
  renditions), which runs on Linux with no Mac required.

PNG fixtures are written with a tiny pure-stdlib solid-color PNG encoder so the
test has no third-party dependency.

Run with: `python3 scripts/verify-ios-ipa-icon-smoke.py`
Exit status: 0 = the guard behaves correctly on every case, 1 = it misbehaved.
"""

import importlib.util
import json
import os
import plistlib
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile
import zlib

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(REPO_ROOT, "scripts", "verify-ios-ipa-icon.py")


def _load_guard_module():
    """Import the hyphenated guard script as a module so we can unit-test its
    pure parser (`parse_appicon_renditions`) directly, without a Mac."""
    spec = importlib.util.spec_from_file_location("verify_ios_ipa_icon", GUARD)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


APP_NAME = "GoodTunes.app"

# Mirror the guard's own floor so the fixtures are valid: a real iPhone home-screen
# icon (60pt @2x) is 120px. GOOD fixtures embed this; the "missing required size"
# fixture embeds only a smaller icon to prove the floor is enforced.
GOOD_ICON_PX = 120
SMALL_ICON_PX = 80

NAVY = (0x00, 0x06, 0x2B, 0xFF)  # GoodTunes brand #00062B, opaque -> low luminance
NEAR_WHITE = (0xFA, 0xFA, 0xFA, 0xFF)  # blank/default placeholder -> high luminance


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


def write_info_plist(app_dir, declare_icon=True):
    """Write a minimal binary Info.plist, optionally declaring a primary icon."""
    info = {
        "CFBundleName": "GoodTunes",
        "CFBundleIdentifier": "Io.GoGoods.music",
        "CFBundleExecutable": "GoodTunes",
    }
    if declare_icon:
        info["CFBundleIcons"] = {
            "CFBundlePrimaryIcon": {
                "CFBundleIconName": "AppIcon",
                "CFBundleIconFiles": ["AppIcon60x60"],
            }
        }
    with open(os.path.join(app_dir, "Info.plist"), "wb") as handle:
        plistlib.dump(info, handle, fmt=plistlib.FMT_BINARY)


def make_app_bundle(parent, *, icon_px=None, icon_rgba=NAVY, declare_icon=True):
    """Create Payload/<App>.app under `parent`; embed a loose AppIcon PNG if asked.

    Returns the path to the .app directory. When `icon_px` is None no icon is
    embedded at all (the "build dropped the icon" case).
    """
    app_dir = os.path.join(parent, "Payload", APP_NAME)
    os.makedirs(app_dir, exist_ok=True)
    write_info_plist(app_dir, declare_icon=declare_icon)
    if icon_px is not None:
        write_solid_png(
            os.path.join(app_dir, "AppIcon60x60@2x.png"), icon_px, icon_rgba
        )
    return app_dir


def zip_payload_as_ipa(parent, ipa_path):
    """Zip a tree containing Payload/<App>.app into a real .ipa (the unzip path)."""
    with zipfile.ZipFile(ipa_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(parent):
            for fname in files:
                full = os.path.join(root, fname)
                arc = os.path.relpath(full, parent)
                zf.write(full, arc)


def run_guard_app_dir(app_dir):
    proc = subprocess.run(
        [sys.executable, GUARD, "--app-dir", app_dir],
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stdout + proc.stderr


def run_guard_ipa(ipa_path):
    proc = subprocess.run(
        [sys.executable, GUARD, ipa_path], capture_output=True, text=True
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

    def check_truth(self, name, ok, detail=""):
        """Assert a boolean condition (used by the in-process parser unit tests)."""
        if ok:
            self.passed += 1
            print(f"  ok   {name}")
        else:
            self.failed += 1
            print(f"  FAIL {name}", file=sys.stderr)
            if detail:
                print(f"         | {detail}", file=sys.stderr)


# --- Captured `assetutil --info` fixtures (Linux-safe parser unit tests) ------
#
# `assetutil --info <Assets.car>` prints a JSON array whose first element is
# catalog metadata (no PixelWidth) and whose remaining elements describe each
# rendition. We capture trimmed-but-realistic samples here so the guard's pure
# parser can be exercised on Linux, where the real `assetutil` doesn't exist.

# A HEALTHY catalog: real AppIcon renditions baked in at 120px and 180px (the
# iPhone home-screen sizes), plus an unrelated AccentColor the parser must skip.
GOOD_ASSETUTIL_JSON = json.dumps(
    [
        {
            "AssetStorageVersion": "IBCocoaTouchImageCatalogTool-15.0",
            "Authoring Tool": "@(#)PROGRAM:CoreThemeDefinition  PROJECT:...",
            "CoreUIVersion": 692,
            "SchemaVersion": 2,
        },
        {
            "AssetType": "Color",
            "Color components": [0.0, 0.0, 0.0, 1.0],
            "Name": "AccentColor",
            "Colorspace": "srgb",
        },
        {
            "AssetType": "Image",
            "Idiom": "iphone",
            "Name": "AppIcon",
            "PixelHeight": 120,
            "PixelWidth": 120,
            "RenditionName": "AppIcon60x60@2x.png",
            "Scale": 2,
            "SizeOnDisk": 4096,
        },
        {
            "AssetType": "Image",
            "Idiom": "iphone",
            "Name": "AppIcon",
            "PixelHeight": 180,
            "PixelWidth": 180,
            "RenditionName": "AppIcon60x60@3x.png",
            "Scale": 3,
            "SizeOnDisk": 8192,
        },
    ]
)

# A PLACEHOLDER catalog: the build compiled WITHOUT the AppIcon, so the car holds
# only unrelated assets (AccentColor, a launch image). Zero AppIcon renditions is
# the definitive "source-correct, binary-wrong" placeholder signal.
PLACEHOLDER_ASSETUTIL_JSON = json.dumps(
    [
        {
            "AssetStorageVersion": "IBCocoaTouchImageCatalogTool-15.0",
            "CoreUIVersion": 692,
            "SchemaVersion": 2,
        },
        {
            "AssetType": "Color",
            "Color components": [1.0, 1.0, 1.0, 1.0],
            "Name": "AccentColor",
            "Colorspace": "srgb",
        },
        {
            "AssetType": "Image",
            "Idiom": "universal",
            "Name": "LaunchImage",
            "PixelHeight": 2048,
            "PixelWidth": 1536,
            "RenditionName": "LaunchImage.png",
            "Scale": 2,
        },
    ]
)


def run_parser_unit_cases(res):
    """Unit-test the pure `parse_appicon_renditions()` against captured assetutil
    JSON, locking in the macOS-only Assets.car signal without needing a Mac."""
    guard = _load_guard_module()
    parse = guard.parse_appicon_renditions
    floor = guard.MIN_REQUIRED_ICON_PX

    # Healthy catalog: parser must surface BOTH AppIcon renditions (and not the
    # AccentColor), with the largest at/over the guard's required size floor.
    good = parse(GOOD_ASSETUTIL_JSON)
    good_sizes = sorted(min(r["width"], r["height"]) for r in good)
    res.check_truth(
        "parser: healthy catalog yields exactly the AppIcon renditions",
        good_sizes == [120, 180],
        f"got renditions sizes {good_sizes!r} (expected [120, 180])",
    )
    largest_good = max((min(r["width"], r["height"]) for r in good), default=0)
    res.check_truth(
        "parser: healthy catalog clears the icon-size floor",
        largest_good >= floor,
        f"largest AppIcon {largest_good}px < floor {floor}px",
    )

    # Placeholder catalog: parser must find ZERO AppIcon renditions, which is what
    # makes the guard hard-fail the "source-correct, binary-wrong" build.
    placeholder = parse(PLACEHOLDER_ASSETUTIL_JSON)
    res.check_truth(
        "parser: placeholder catalog yields zero AppIcon renditions",
        placeholder == [],
        f"expected [] but got {placeholder!r}",
    )

    # Malformed / empty input must degrade to [] (never throw), since the parser
    # is fed whatever assetutil emits.
    res.check_truth(
        "parser: malformed JSON degrades to []",
        parse("not json at all") == [] and parse("{}") == [],
        "malformed/non-list assetutil output should parse to an empty list",
    )


def main():
    if not os.path.isfile(GUARD):
        print(f"smoke: guard script not found at {GUARD}", file=sys.stderr)
        return 1

    work = tempfile.mkdtemp(prefix="ipa-icon-smoke-")
    res = Results()
    try:
        # --- Parser unit tests: lock in the macOS-only Assets.car signal ---
        run_parser_unit_cases(res)

        # --- GOOD bundle: extracted .app -> exit 0 ---
        good_parent = os.path.join(work, "good")
        good_app = make_app_bundle(good_parent, icon_px=GOOD_ICON_PX, icon_rgba=NAVY)
        code, out = run_guard_app_dir(good_app)
        res.check("good bundle (extracted .app)", 0, code, out)

        # --- GOOD bundle: real zipped .ipa -> exit 0 (exercise unzip path) ---
        ipa = os.path.join(work, "good-app.ipa")
        zip_payload_as_ipa(good_parent, ipa)
        code, out = run_guard_ipa(ipa)
        res.check("good bundle (zipped .ipa)", 0, code, out)

        # --- BROKEN: only a sub-120px icon embedded (size floor) -> exit 1 ---
        small_app = make_app_bundle(
            os.path.join(work, "too-small"), icon_px=SMALL_ICON_PX, icon_rgba=NAVY
        )
        code, out = run_guard_app_dir(small_app)
        res.check("missing required icon size", 1, code, out)

        # --- BROKEN: near-white placeholder icon (blank/default) -> exit 1 ---
        white_app = make_app_bundle(
            os.path.join(work, "near-white"),
            icon_px=GOOD_ICON_PX,
            icon_rgba=NEAR_WHITE,
        )
        code, out = run_guard_app_dir(white_app)
        res.check("near-white placeholder icon", 1, code, out)

        # --- BROKEN: no icon embedded at all -> exit 1 ---
        empty_app = make_app_bundle(
            os.path.join(work, "no-icon"), icon_px=None, declare_icon=False
        )
        code, out = run_guard_app_dir(empty_app)
        res.check("no icons embedded", 1, code, out)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    total = res.passed + res.failed
    print(f"\nipa-icon-smoke: {res.passed}/{total} cases behaved correctly")
    if res.failed:
        print(
            "\nipa-icon-smoke FAILED: the built-IPA icon guard did not behave as "
            "expected on one or more cases above. Either the guard regressed (it no "
            "longer catches a broken bundle / rejects a good one) or this test's "
            "fixtures drifted from the guard's size/luminance tables — investigate "
            "before merging, because this guard is what keeps a placeholder-icon "
            ".ipa out of App Store review.",
            file=sys.stderr,
        )
        return 1
    print(
        "ipa-icon-smoke: the guard catches every broken bundle and passes the good one."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
