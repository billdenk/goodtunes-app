#!/usr/bin/env python3
"""Smoke test that locks in the behavior of ALL FOUR app-icon guards.

Why this exists:
  Four pure-logic scripts stand between a broken icon and an app-store build:

    Pre-build (source) guards
      - scripts/verify-android-appicon.py  (res/ launcher + notification icons)
      - scripts/verify-ios-appicon.py      (AppIcon.appiconset Contents.json)
    Post-build (binary) guards
      - scripts/verify-android-aab-icon.py (icons baked into the produced .aab)
      - scripts/verify-ios-ipa-icon.py     (icon baked into the produced .ipa)

  Their thresholds and tables (luminance 0.7, MIN_REQUIRED_ICON_PX 192/120,
  per-density px sizes, the AAPT2 ``-v4``/``-v26`` density-token matching, the
  no-alpha / alpha-only-silhouette rules) are easy to break with a well-meaning
  edit. A weakened guard either FALSE-PASSES (a blank/placeholder icon ships) or
  FALSE-FAILS (every store build is blocked). They were only ever exercised by
  hand on a real Codemagic run. This test feeds each guard a known-GOOD fixture
  (asserts exit 0) and known-BAD fixtures (asserts non-zero, blocked) so a
  regression is caught here instead of on the store.

Linux-CI constraints (this is what the validation step runs on):
  - No Pillow: image inspection falls back to ImageMagick (`magick`/`convert`/
    `identify`) and the pure-stdlib PNG header reader. Fixtures are written with
    a tiny stdlib PNG encoder so there are no committed binary blobs.
  - No macOS `assetutil`: the iOS .ipa guard's authoritative Assets.car check is
    macOS-only, so off-macOS we exercise its loose-AppIcon-PNG path (the branch
    that DOES run on Linux). The iOS .ipa near-white color check is Pillow-only
    by design and is simply skipped here (documented in that guard).

Run with: `python3 scripts/verify-app-icon-guards-smoke.py`
Exit status: 0 = every guard behaves correctly on every case, 1 = one misbehaved.
"""

import json
import os
import struct
import subprocess
import sys
import tempfile
import zipfile
import zlib

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(REPO_ROOT, "scripts")

ANDROID_SRC_GUARD = os.path.join(SCRIPTS, "verify-android-appicon.py")
IOS_SRC_GUARD = os.path.join(SCRIPTS, "verify-ios-appicon.py")
ANDROID_AAB_GUARD = os.path.join(SCRIPTS, "verify-android-aab-icon.py")
IOS_IPA_GUARD = os.path.join(SCRIPTS, "verify-ios-ipa-icon.py")

# Mirror the guards' density/size tables so the fixtures are valid bundles.
DENSITIES = ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")
LAUNCHER_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}
NOTIFY_SIZES = {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}

# Full set of required iOS AppIcon slots (idiom, size, scale) — mirrors the guard.
IOS_REQUIRED_SLOTS = [
    ("iphone", "20x20", "2x"),
    ("iphone", "20x20", "3x"),
    ("iphone", "29x29", "2x"),
    ("iphone", "29x29", "3x"),
    ("iphone", "40x40", "2x"),
    ("iphone", "40x40", "3x"),
    ("iphone", "60x60", "2x"),
    ("iphone", "60x60", "3x"),
    ("ipad", "20x20", "1x"),
    ("ipad", "20x20", "2x"),
    ("ipad", "29x29", "1x"),
    ("ipad", "29x29", "2x"),
    ("ipad", "40x40", "1x"),
    ("ipad", "40x40", "2x"),
    ("ipad", "76x76", "1x"),
    ("ipad", "76x76", "2x"),
    ("ipad", "83.5x83.5", "2x"),
    ("ios-marketing", "1024x1024", "1x"),
]

NAVY = (0x00, 0x06, 0x2B)  # GoodTunes brand #00062B -> low luminance (real icon)
NEAR_WHITE = (0xFA, 0xFA, 0xFA)  # blank/default placeholder -> high luminance

ADAPTIVE_XML_BODY = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    '  <background android:drawable="@color/ic_launcher_background"/>\n'
    '  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
    "</adaptive-icon>\n"
)


# --------------------------------------------------------------------------- #
# Tiny pure-stdlib PNG encoders (no Pillow dependency).
# --------------------------------------------------------------------------- #
def _png_chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def _write_png(path, width, height, color_type, raw):
    bit_depth = 8
    ihdr = struct.pack(">IIBBBBB", width, height, bit_depth, color_type, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    with open(path, "wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n")
        handle.write(_png_chunk(b"IHDR", ihdr))
        handle.write(_png_chunk(b"IDAT", idat))
        handle.write(_png_chunk(b"IEND", b""))


def write_rgb_png(path, size, rgb):
    """Solid size×size RGB PNG, NO alpha channel (iOS AppIcon requirement)."""
    row = b"\x00" + bytes(rgb) * size
    _write_png(path, size, size, 2, row * size)


def write_rgba_png(path, size, rgb, alpha=0xFF):
    """Solid size×size RGBA PNG (has an alpha channel)."""
    row = b"\x00" + bytes((rgb[0], rgb[1], rgb[2], alpha)) * size
    _write_png(path, size, size, 6, row * size)


def write_white_silhouette_png(path, size):
    """size×size RGBA white-on-transparent silhouette (Android notify icon).

    Top half is opaque white, bottom half fully transparent: so it HAS an alpha
    channel, is NOT fully opaque (real transparency), and every visible pixel is
    white — exactly what the notification-icon guard requires.
    """
    opaque = b"\x00" + bytes((0xFF, 0xFF, 0xFF, 0xFF)) * size
    clear = b"\x00" + bytes((0xFF, 0xFF, 0xFF, 0x00)) * size
    rows = [opaque if y < size // 2 else clear for y in range(size)]
    _write_png(path, size, size, 6, b"".join(rows))


# --------------------------------------------------------------------------- #
# Fixture builders.
# --------------------------------------------------------------------------- #
def build_android_source_res(res_root, notify_builder=write_white_silhouette_png):
    """A complete, correct android res/ tree (source-guard layout, no -v* dirs)."""
    anydpi = os.path.join(res_root, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(anydpi, name), "w") as handle:
            handle.write(ADAPTIVE_XML_BODY)
    for density in DENSITIES:
        mip = os.path.join(res_root, f"mipmap-{density}")
        os.makedirs(mip, exist_ok=True)
        write_rgba_png(os.path.join(mip, "ic_launcher.png"), LAUNCHER_SIZES[density], NAVY)
        write_rgba_png(
            os.path.join(mip, "ic_launcher_round.png"), LAUNCHER_SIZES[density], NAVY
        )
        write_rgba_png(
            os.path.join(mip, "ic_launcher_foreground.png"),
            FOREGROUND_SIZES[density],
            NAVY,
        )
        draw = os.path.join(res_root, f"drawable-{density}")
        os.makedirs(draw, exist_ok=True)
        notify_builder(os.path.join(draw, "ic_stat_notify.png"), NOTIFY_SIZES[density])


def build_ios_source_appiconset(appiconset, alpha_filename=None, drop_slot=None):
    """A complete AppIcon.appiconset; optionally inject an alpha PNG / drop a slot."""
    os.makedirs(appiconset, exist_ok=True)
    images = []
    for idiom, size, scale in IOS_REQUIRED_SLOTS:
        if drop_slot is not None and (idiom, size, scale) == drop_slot:
            continue
        w_pt, _h_pt = (float(x) for x in size.split("x"))
        px = round(w_pt * int(scale.rstrip("x")))
        filename = f"icon-{idiom}-{size.replace('.', '_')}-{scale}.png".replace(" ", "")
        path = os.path.join(appiconset, filename)
        if filename == alpha_filename:
            write_rgba_png(path, px, NAVY)  # illegal alpha channel
        else:
            write_rgb_png(path, px, NAVY)
        images.append(
            {"idiom": idiom, "size": size, "scale": scale, "filename": filename}
        )
    with open(os.path.join(appiconset, "Contents.json"), "w", encoding="utf-8") as f:
        json.dump({"images": images, "info": {"version": 1, "author": "smoke"}}, f)


def build_aab_base_res(res_root, launcher_rgb=NAVY):
    """A complete, correct extracted-.aab base/res tree (with AAPT2 -v4 dirs)."""
    anydpi = os.path.join(res_root, "mipmap-anydpi-v4")
    os.makedirs(anydpi, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(anydpi, name), "w") as handle:
            handle.write(ADAPTIVE_XML_BODY)
    for density in DENSITIES:
        ddir = os.path.join(res_root, f"mipmap-{density}-v4")
        os.makedirs(ddir, exist_ok=True)
        write_rgba_png(
            os.path.join(ddir, "ic_launcher.png"), LAUNCHER_SIZES[density], launcher_rgb
        )
        write_rgba_png(
            os.path.join(ddir, "ic_launcher_round.png"),
            LAUNCHER_SIZES[density],
            launcher_rgb,
        )
        write_rgba_png(
            os.path.join(ddir, "ic_launcher_foreground.png"),
            FOREGROUND_SIZES[density],
            launcher_rgb,
        )


def zip_dir_as_archive(src_dir, archive_path):
    """Zip a tree into a real .aab/.ipa (exercises the guards' unzip path)."""
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(src_dir):
            for fname in files:
                full = os.path.join(root, fname)
                zf.write(full, os.path.relpath(full, src_dir))


def build_ipa_app_dir(app_dir, loose_icon=("AppIcon60x60@3x.png", 180, NAVY)):
    """An extracted .app with a loose AppIcon PNG (the Linux-runnable IPA path)."""
    os.makedirs(app_dir, exist_ok=True)
    if loose_icon is not None:
        name, px, rgb = loose_icon
        write_rgb_png(os.path.join(app_dir, name), px, rgb)


# --------------------------------------------------------------------------- #
# Runner + assertions.
# --------------------------------------------------------------------------- #
def run_guard(guard, *guard_args):
    proc = subprocess.run(
        [sys.executable, guard, *guard_args], capture_output=True, text=True
    )
    return proc.returncode, proc.stdout + proc.stderr


class Results:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def expect(self, name, want, got, output):
        ok = got == want if isinstance(want, int) else got != 0
        label = want if isinstance(want, int) else "non-zero"
        if ok:
            self.passed += 1
            print(f"  ok   {name} (exit {got})")
        else:
            self.failed += 1
            print(
                f"  FAIL {name}: expected exit {label}, got {got}", file=sys.stderr
            )
            for line in output.strip().splitlines():
                print(f"         | {line}", file=sys.stderr)

    def ok_exit(self, name, got, output):
        self.expect(name, 0, got, output)

    def bad_exit(self, name, got, output):
        self.expect(name, "non-zero", got, output)


def main():
    for guard in (ANDROID_SRC_GUARD, IOS_SRC_GUARD, ANDROID_AAB_GUARD, IOS_IPA_GUARD):
        if not os.path.isfile(guard):
            print(f"smoke: guard script not found at {guard}", file=sys.stderr)
            return 1

    work = tempfile.mkdtemp(prefix="app-icon-guards-smoke-")
    res = Results()
    try:
        # ---------------- Android SOURCE guard ----------------
        print("verify-android-appicon.py (source res/ tree):")
        good = os.path.join(work, "android-src-good")
        build_android_source_res(good)
        code, out = run_guard(ANDROID_SRC_GUARD, "--res-dir", good)
        res.ok_exit("good res/ tree", code, out)

        bad_missing = os.path.join(work, "android-src-missing")
        build_android_source_res(bad_missing)
        os.remove(os.path.join(bad_missing, "mipmap-xxxhdpi", "ic_launcher.png"))
        code, out = run_guard(ANDROID_SRC_GUARD, "--res-dir", bad_missing)
        res.bad_exit("missing high-density launcher raster", code, out)

        bad_notify = os.path.join(work, "android-src-notify")

        def opaque_white(path, size):
            write_rgba_png(path, size, (0xFF, 0xFF, 0xFF), alpha=0xFF)

        build_android_source_res(bad_notify, notify_builder=opaque_white)
        code, out = run_guard(ANDROID_SRC_GUARD, "--res-dir", bad_notify)
        res.bad_exit("notification icon not an alpha silhouette", code, out)

        # ---------------- iOS SOURCE guard ----------------
        print("verify-ios-appicon.py (AppIcon.appiconset):")
        good_ios = os.path.join(work, "ios-src-good")
        build_ios_source_appiconset(good_ios)
        code, out = run_guard(IOS_SRC_GUARD, "--appiconset", good_ios)
        res.ok_exit("good appiconset", code, out)

        bad_alpha = os.path.join(work, "ios-src-alpha")
        # Marketing 1024 slot is unambiguous to target.
        alpha_name = "icon-ios-marketing-1024x1024-1x.png"
        build_ios_source_appiconset(bad_alpha, alpha_filename=alpha_name)
        code, out = run_guard(IOS_SRC_GUARD, "--appiconset", bad_alpha)
        res.bad_exit("app icon carries an alpha channel", code, out)

        bad_slot = os.path.join(work, "ios-src-slot")
        build_ios_source_appiconset(bad_slot, drop_slot=("iphone", "60x60", "3x"))
        code, out = run_guard(IOS_SRC_GUARD, "--appiconset", bad_slot)
        res.bad_exit("missing required icon slot", code, out)

        # ---------------- Android AAB (post-build) guard ----------------
        print("verify-android-aab-icon.py (built .aab):")
        aab_good = os.path.join(work, "aab-good", "base", "res")
        build_aab_base_res(aab_good)
        code, out = run_guard(ANDROID_AAB_GUARD, "--extracted-dir",
                              os.path.join(work, "aab-good"))
        res.ok_exit("good bundle (extracted base/res)", code, out)

        aab_zip = os.path.join(work, "good-app.aab")
        zip_dir_as_archive(os.path.join(work, "aab-good"), aab_zip)
        code, out = run_guard(ANDROID_AAB_GUARD, aab_zip)
        res.ok_exit("good bundle (zipped .aab, unzip path)", code, out)

        aab_white = os.path.join(work, "aab-white", "base", "res")
        build_aab_base_res(aab_white, launcher_rgb=NEAR_WHITE)
        code, out = run_guard(ANDROID_AAB_GUARD, "--extracted-dir",
                              os.path.join(work, "aab-white"))
        res.bad_exit("near-white placeholder icon", code, out)

        aab_missing = os.path.join(work, "aab-missing", "base", "res")
        build_aab_base_res(aab_missing)
        os.remove(os.path.join(aab_missing, "mipmap-xxxhdpi-v4", "ic_launcher.png"))
        code, out = run_guard(ANDROID_AAB_GUARD, "--extracted-dir",
                              os.path.join(work, "aab-missing"))
        res.bad_exit("missing high-density raster", code, out)

        # ---------------- iOS IPA (post-build) guard ----------------
        # assetutil is macOS-only; off-macOS the loose-AppIcon-PNG path is what
        # runs, so the fixtures use a loose icon (no Assets.car).
        print("verify-ios-ipa-icon.py (built .ipa, loose-PNG path off-macOS):")
        ipa_good = os.path.join(work, "ipa-good", "Payload", "App.app")
        build_ipa_app_dir(ipa_good)
        code, out = run_guard(IOS_IPA_GUARD, "--app-dir", ipa_good)
        res.ok_exit("good app (loose 180px AppIcon)", code, out)

        ipa_zip = os.path.join(work, "good-app.ipa")
        zip_dir_as_archive(os.path.join(work, "ipa-good"), ipa_zip)
        code, out = run_guard(IOS_IPA_GUARD, ipa_zip)
        res.ok_exit("good app (zipped .ipa, unzip path)", code, out)

        ipa_empty = os.path.join(work, "ipa-empty", "Payload", "App.app")
        build_ipa_app_dir(ipa_empty, loose_icon=None)
        code, out = run_guard(IOS_IPA_GUARD, "--app-dir", ipa_empty)
        res.bad_exit("no icon embedded at all", code, out)

        ipa_small = os.path.join(work, "ipa-small", "Payload", "App.app")
        build_ipa_app_dir(ipa_small, loose_icon=("AppIcon40x40@2x.png", 80, NAVY))
        code, out = run_guard(IOS_IPA_GUARD, "--app-dir", ipa_small)
        res.bad_exit("embedded icon below 120px floor", code, out)
    finally:
        import shutil

        shutil.rmtree(work, ignore_errors=True)

    total = res.passed + res.failed
    print(f"\napp-icon-guards-smoke: {res.passed}/{total} cases behaved correctly")
    if res.failed:
        print(
            "\napp-icon-guards-smoke FAILED: one or more app-icon guards did not "
            "behave as expected above. Either a guard regressed (it no longer "
            "catches a broken build / now rejects a good one) or these fixtures "
            "drifted from the guards' density/size tables. Investigate before "
            "merging — these guards are what keep a blank/placeholder icon off the "
            "App Store and Google Play.",
            file=sys.stderr,
        )
        return 1
    print(
        "app-icon-guards-smoke: every guard catches its broken fixtures and passes "
        "the good ones."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
