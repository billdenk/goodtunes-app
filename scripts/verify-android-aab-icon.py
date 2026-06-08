#!/usr/bin/env python3
"""Post-build guard: prove the BUILT .aab actually embeds the real launcher icon.

Why this exists (and why it's separate from verify-android-appicon.py):
  `verify-android-appicon.py` validates the *source* res/ tree (mipmap launcher
  rasters + adaptive XML + notification silhouette) BEFORE the bundle is built.
  That guard passes today — the committed icons are correct. But the iOS side
  taught us the hard way (TestFlight builds 59/64/66) that a build can be
  "source-correct, binary-wrong": the produced artifact ships a generic /
  placeholder / blank icon even though the source assets were fine, because the
  build tooling dropped the icon when assembling the binary. The source guard
  cannot see that — the fault is in the produced artifact, not the res/ tree.

  This guard inspects the actual produced `.aab` (an Android App Bundle is just a
  zip):
    1. Unzips it and locates the base module's compiled resources under base/res/.
    2. Confirms the adaptive-icon definitions (mipmap-anydpi-*/ic_launcher.xml +
       ic_launcher_round.xml) survived into the bundle.
    3. Confirms the per-density legacy launcher rasters (ic_launcher.png,
       ic_launcher_round.png) and the adaptive foreground layer
       (ic_launcher_foreground.png) are actually packaged, at the exact pixel
       size each density requires. Their absence is the reliable, definitive
       signal of an icon-dropped build.
    4. Best-effort: confirms the composited legacy ic_launcher.png is the dark
       navy GoodTunes brand and NOT a near-white blank / default placeholder.

  If no real launcher icon can be proven embedded, it HARD-FAILS so an
  icon-broken bundle can never reach Google Play.

  NOTE on resource path-shortening: the release build sets `minifyEnabled false`
  (android/app/build.gradle), so AAPT2 preserves resource paths
  (base/res/mipmap-<density>/ic_launcher.png). This guard matches by name and
  density token. If resource path-shortening is ever enabled, the rasters get
  renamed to opaque short paths and this name-based match would need updating —
  the guard fails LOUDLY with that explanation rather than passing blindly.

Image inspection prefers Pillow, then falls back to ImageMagick
(`magick`/`identify`/`convert`) so it runs on the Linux Codemagic runner and on a
dev box; dimensions can also be read straight from the PNG header with no deps.

Usage:
    verify-android-aab-icon.py [path/to/app.aab]
    verify-android-aab-icon.py --extracted-dir path/to/unzipped-aab   # skip unzip (tests)

With no argument it auto-discovers the newest android/app/build/outputs/**/*.aab.

Exit status: 0 = a real launcher icon is embedded, non-zero = missing/placeholder
(with a human-readable reason list).
"""

import argparse
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_AAB_GLOB = os.path.join(
    REPO_ROOT, "android", "app", "build", "outputs", "**", "*.aab"
)

# Density buckets every launcher raster must ship at, with the exact px size each
# density requires. These mirror the SOURCE guard (verify-android-appicon.py); the
# point here is to prove the build actually carried them into the bundle.
DENSITIES = ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")
LAUNCHER_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

# The legacy composited launcher icon (60dp xxxhdpi = 192px) is the smallest icon
# that MUST be embedded for a non-blank app. We require at least one legacy
# ic_launcher raster this size or larger as proof a real icon was compiled in.
MIN_REQUIRED_ICON_PX = 192

# Adaptive-icon definitions that must survive into the bundle so Android assembles
# the launcher icon from foreground/background layers rather than a blank default.
ADAPTIVE_XML = ("ic_launcher.xml", "ic_launcher_round.xml")

# The composited GoodTunes launcher is the dark navy brand (#00062B, on-white
# luminance ~0.30). A dropped/blank/default icon is near-white. Anything brighter
# than this is overwhelmingly likely to be a placeholder, never the real icon.
PLACEHOLDER_LUMINANCE_THRESHOLD = 0.7


def discover_aab(explicit):
    """Return the .aab to inspect: the explicit arg, else newest build artifact."""
    if explicit:
        return explicit
    matches = glob.glob(DEFAULT_AAB_GLOB, recursive=True)
    if not matches:
        return None
    return max(matches, key=os.path.getmtime)


def _density_of(dirname):
    """Return the density token of a res dir like 'mipmap-xxxhdpi-v4', else None.

    Matches the density as a whole dash-delimited token so 'hdpi' never collides
    with 'xhdpi'/'xxhdpi'/'xxxhdpi'.
    """
    parts = dirname.split("-")
    for density in DENSITIES:
        if density in parts:
            return density
    return None


def index_launcher_files(res_root):
    """Walk base/res/ and bucket launcher rasters + adaptive XML by density/name.

    Returns (rasters, adaptive_xml) where:
      rasters[density][filename] = absolute path
      adaptive_xml = set of adaptive XML basenames found under mipmap-anydpi-*
    """
    rasters = {d: {} for d in DENSITIES}
    adaptive_xml = set()
    if not os.path.isdir(res_root):
        return rasters, adaptive_xml
    for entry in sorted(os.listdir(res_root)):
        sub = os.path.join(res_root, entry)
        if not os.path.isdir(sub) or not entry.startswith("mipmap"):
            continue
        if "anydpi" in entry.split("-"):
            for name in os.listdir(sub):
                if name in ADAPTIVE_XML:
                    adaptive_xml.add(name)
            continue
        density = _density_of(entry)
        if not density:
            continue
        for name in os.listdir(sub):
            low = name.lower()
            if low.startswith("ic_launcher") and low.endswith(".png"):
                rasters[density][name] = os.path.join(sub, name)
    return rasters, adaptive_xml


def _png_size_from_header(path):
    """Read (width, height) straight from a PNG's IHDR. Pure stdlib, no deps."""
    try:
        with open(path, "rb") as handle:
            header = handle.read(24)
    except OSError:
        return None
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        return None
    width = int.from_bytes(header[16:20], "big")
    height = int.from_bytes(header[20:24], "big")
    if width and height:
        return width, height
    return None


def _im_tool(name):
    """Return an ImageMagick subcommand list, preferring v7 `magick`."""
    magick = shutil.which("magick")
    if magick:
        return [magick] + ([name] if name != "magick" else [])
    legacy = shutil.which(name)
    if legacy:
        return [legacy]
    return None


def inspect_png_dimensions(path):
    """Return (width, height) for a PNG using Pillow, ImageMagick, or the raw IHDR."""
    try:
        from PIL import Image

        with Image.open(path) as im:
            return im.size
    except Exception:  # noqa: BLE001
        pass
    identify = _im_tool("identify")
    if identify:
        try:
            out = subprocess.check_output(
                identify + ["-format", "%w %h", path], text=True
            ).strip()
            w, h = out.split()
            return int(w), int(h)
        except Exception:  # noqa: BLE001
            pass
    return _png_size_from_header(path)


def composited_luminance(path):
    """Mean luminance (0..1) of the image composited over white, or None.

    Compositing over white means transparency reads as white, so a mostly-blank
    icon scores near 1.0 while the solid navy brand scores ~0.30. Used only to
    tell the real icon apart from a near-white placeholder. Best-effort: returns
    None when neither Pillow nor ImageMagick is available.
    """
    try:
        from PIL import Image

        with Image.open(path) as im:
            rgba = im.convert("RGBA").resize((16, 16))
            bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            comp = Image.alpha_composite(bg, rgba).convert("RGB")
            pixels = list(comp.getdata())
        if not pixels:
            return None
        n = len(pixels)
        r = sum(p[0] for p in pixels) / n
        g = sum(p[1] for p in pixels) / n
        b = sum(p[2] for p in pixels) / n
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
    except Exception:  # noqa: BLE001
        pass
    convert = _im_tool("convert")
    if convert:
        try:
            out = subprocess.check_output(
                convert
                + [
                    path,
                    "-background",
                    "white",
                    "-alpha",
                    "remove",
                    "-alpha",
                    "off",
                    "-colorspace",
                    "Gray",
                    "-format",
                    "%[fx:mean]",
                    "info:",
                ],
                text=True,
                stderr=subprocess.DEVNULL,
            ).strip()
            return float(out)
        except Exception:  # noqa: BLE001
            pass
    return None


def find_base_res(root):
    """Locate the base module's res/ dir inside an extracted .aab (or a res root)."""
    candidate = os.path.join(root, "base", "res")
    if os.path.isdir(candidate):
        return candidate
    # Allow pointing straight at an extracted base/ or at a res/ directory (tests).
    if os.path.isdir(os.path.join(root, "res")):
        return os.path.join(root, "res")
    if os.path.basename(root.rstrip("/")) == "res" and os.path.isdir(root):
        return root
    return None


def verify_res_root(res_root):
    """Return (errors, notes) for an extracted base/res directory."""
    errors = []
    notes = []

    rasters, adaptive_xml = index_launcher_files(res_root)

    for name in ADAPTIVE_XML:
        if name in adaptive_xml:
            notes.append(f"Adaptive-icon definition '{name}' present in the bundle.")
        else:
            errors.append(
                f"Adaptive-icon definition 'mipmap-anydpi-*/{name}' is MISSING from "
                f"the built bundle — Android would fall back to a default launcher icon."
            )

    total_found = sum(len(v) for v in rasters.values())
    if total_found == 0:
        errors.append(
            "No ic_launcher*.png rasters found anywhere under base/res/. Either the "
            "build dropped every launcher icon (would ship a blank/default icon), or "
            "resource path-shortening renamed them to opaque short paths (the release "
            "build sets minifyEnabled false, so this should not happen — if it was "
            "turned on, this name-based guard needs updating)."
        )
        return errors, notes

    largest = 0
    for density in DENSITIES:
        checks = (
            ("ic_launcher.png", LAUNCHER_SIZES[density]),
            ("ic_launcher_round.png", LAUNCHER_SIZES[density]),
            ("ic_launcher_foreground.png", FOREGROUND_SIZES[density]),
        )
        for filename, expected in checks:
            path = rasters[density].get(filename)
            if not path:
                errors.append(
                    f"Launcher raster 'mipmap-{density}/{filename}' is MISSING from "
                    f"the built bundle."
                )
                continue
            dims = inspect_png_dimensions(path)
            if not dims:
                errors.append(
                    f"Could not read dimensions of 'mipmap-{density}/{filename}'."
                )
                continue
            width, height = dims
            if (width, height) != (expected, expected):
                errors.append(
                    f"'mipmap-{density}/{filename}' is {width}x{height}px but "
                    f"{density} requires {expected}x{expected}px."
                )
            if filename == "ic_launcher.png":
                largest = max(largest, min(width, height))

    if largest >= MIN_REQUIRED_ICON_PX:
        notes.append(
            f"Largest embedded legacy launcher icon is {largest}px "
            f"(>= {MIN_REQUIRED_ICON_PX}px) — a real icon is baked into the bundle."
        )
    elif largest:
        errors.append(
            f"Largest embedded legacy launcher icon is only {largest}px "
            f"(< {MIN_REQUIRED_ICON_PX}px); the high-density icon did not make it "
            f"into the bundle."
        )

    # Placeholder / blank color check on the largest legacy icon we can find.
    biggest_legacy = None
    biggest_px = 0
    for density in DENSITIES:
        path = rasters[density].get("ic_launcher.png")
        if not path:
            continue
        dims = inspect_png_dimensions(path)
        side = min(dims) if dims else 0
        if side >= biggest_px:
            biggest_px = side
            biggest_legacy = path
    if biggest_legacy:
        lum = composited_luminance(biggest_legacy)
        if lum is None:
            notes.append(
                "Could not run the placeholder color check (neither Pillow nor "
                "ImageMagick available); relying on the presence/size checks above."
            )
        elif lum > PLACEHOLDER_LUMINANCE_THRESHOLD:
            errors.append(
                f"Embedded launcher icon is near-white (composited luminance "
                f"{lum:.2f} > {PLACEHOLDER_LUMINANCE_THRESHOLD}) — this looks like a "
                f"blank/default placeholder, not the navy GoodTunes icon."
            )
        else:
            notes.append(
                f"Embedded launcher icon composited luminance is {lum:.2f} "
                f"(<= {PLACEHOLDER_LUMINANCE_THRESHOLD}) — the dark navy brand icon, "
                f"not a placeholder."
            )

    return errors, notes


def _report(res_root, errors, notes):
    print(f"Inspected base/res: {res_root}")
    for note in notes:
        print(f"  · {note}")
    if errors:
        print(
            "\nBuilt-AAB icon guard FAILED — this bundle would ship a wrong/blank "
            "launcher icon. Do NOT send it to Google Play. Reasons:",
            file=sys.stderr,
        )
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    print(
        "\nBuilt-AAB icon guard passed: the adaptive-icon XML, per-density launcher "
        "rasters, and the navy brand icon are all baked into the bundle."
    )
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("aab", nargs="?", help="Path to the .aab to inspect.")
    parser.add_argument(
        "--extracted-dir",
        help="Inspect an already-extracted .aab (or its base/res) instead of a .aab.",
    )
    args = parser.parse_args()

    if args.extracted_dir:
        res_root = find_base_res(args.extracted_dir)
        if not res_root:
            print(
                f"ERROR: no base/res found under {args.extracted_dir}", file=sys.stderr
            )
            return 1
        errors, notes = verify_res_root(res_root)
        return _report(res_root, errors, notes)

    aab = discover_aab(args.aab)
    if not aab or not os.path.isfile(aab):
        print(
            "ERROR: no .aab found to inspect. Pass a path, or build first so "
            f"{DEFAULT_AAB_GLOB} exists.",
            file=sys.stderr,
        )
        return 1

    print(f"Inspecting built AAB: {aab}")
    tmp = tempfile.mkdtemp(prefix="aab-icon-check-")
    try:
        try:
            with zipfile.ZipFile(aab) as zf:
                zf.extractall(tmp)
        except zipfile.BadZipFile:
            print(f"ERROR: {aab} is not a valid .aab (zip) archive.", file=sys.stderr)
            return 1

        res_root = find_base_res(tmp)
        if not res_root:
            print(
                "ERROR: could not find base/res/ inside the .aab.", file=sys.stderr
            )
            return 1

        errors, notes = verify_res_root(res_root)
        return _report(res_root, errors, notes)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
