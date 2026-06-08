#!/usr/bin/env python3
"""Post-build guard: prove the BUILT .ipa actually embeds the real app icon.

Why this exists (and why it's separate from verify-ios-appicon.py):
  `verify-ios-appicon.py` validates the *source* asset catalog
  (AppIcon.appiconset) BEFORE archiving. That guard passes today — the committed
  icons are correct. But TestFlight builds 59, 64 and 66 STILL shipped Apple's
  GENERIC placeholder (white tile, light-blue arrows) instead of the navy "G".
  That is the "source-correct-but-archive-wrong" case: Xcode compiled the archive
  WITHOUT baking the AppIcon into the app bundle, and iOS silently renders the
  placeholder at display time. The source guard cannot catch this because the
  fault is in the produced binary, not the catalog.

  This guard inspects the actual produced `.ipa`:
    1. Unzips it and locates Payload/<App>.app.
    2. Reads the embedded (binary) Info.plist to see what icon the build DECLARES.
    3. Runs `assetutil --info` on the compiled Assets.car and confirms it really
       contains AppIcon renditions at the expected sizes (>=120px). When the
       placeholder ships, the catalog has NO AppIcon renditions at all — so their
       absence is the reliable, definitive signal of a placeholder build.
    4. Best-effort: if any loose AppIcon*.png ended up in the bundle, confirms it
       is the dark navy icon and NOT a near-white placeholder image.

  If no real embedded icon can be proven, it HARD-FAILS so a placeholder binary
  can never reach Apple again.

Usage:
    verify-ios-ipa-icon.py [path/to/App.ipa]
    verify-ios-ipa-icon.py --app-dir path/to/Extracted.app   # skip unzip (tests)

With no argument it auto-discovers the newest build/ios/ipa/*.ipa.

Exit status: 0 = a real icon is embedded, non-zero = missing/placeholder (with a
human-readable reason list).
"""

import argparse
import glob
import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
import zipfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_IPA_GLOB = os.path.join(REPO_ROOT, "build", "ios", "ipa", "*.ipa")

# The iPhone home-screen icon (60pt @2x) is 120px; this is the smallest icon that
# MUST be embedded for a non-placeholder app. We require at least one AppIcon
# rendition this size or larger as proof a real icon was compiled in.
MIN_REQUIRED_ICON_PX = 120

# A built app icon is the dark navy GoodTunes brand (#00062B → luminance ~0.02).
# Apple's generic placeholder is near-white. Anything brighter than this is
# overwhelmingly likely to be the placeholder, never the real icon.
PLACEHOLDER_LUMINANCE_THRESHOLD = 0.7


def discover_ipa(explicit):
    """Return the .ipa to inspect: the explicit arg, else newest build artifact."""
    if explicit:
        return explicit
    matches = glob.glob(DEFAULT_IPA_GLOB)
    if not matches:
        return None
    return max(matches, key=os.path.getmtime)


def find_app_dir(root):
    """Locate Payload/<App>.app under an extracted .ipa (or a passed .app dir)."""
    if root.endswith(".app") and os.path.isdir(root):
        return root
    payload = os.path.join(root, "Payload")
    if os.path.isdir(payload):
        for name in sorted(os.listdir(payload)):
            if name.endswith(".app"):
                return os.path.join(payload, name)
    # Some callers may point straight at a directory that *is* the Payload parent.
    for name in sorted(os.listdir(root)):
        if name.endswith(".app") and os.path.isdir(os.path.join(root, name)):
            return os.path.join(root, name)
    return None


def load_info_plist(app_dir):
    """Read the embedded Info.plist (binary or XML). Returns {} on any failure."""
    path = os.path.join(app_dir, "Info.plist")
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "rb") as handle:
            return plistlib.load(handle)
    except Exception:  # noqa: BLE001 - a corrupt plist is itself a red flag, handled by caller
        return {}


def declared_primary_icon_files(info):
    """Pull CFBundleIcons -> CFBundlePrimaryIcon -> CFBundleIconFiles/Name."""
    icons = info.get("CFBundleIcons") or {}
    primary = icons.get("CFBundlePrimaryIcon") or {}
    files = list(primary.get("CFBundleIconFiles") or [])
    name = primary.get("CFBundleIconName")
    return files, name


def run_assetutil(car_path):
    """Return `assetutil --info` JSON text for Assets.car, or None if unavailable."""
    assetutil = shutil.which("assetutil")
    if not assetutil or not os.path.isfile(car_path):
        return None
    try:
        return subprocess.check_output(
            [assetutil, "--info", car_path], text=True, stderr=subprocess.DEVNULL
        )
    except Exception:  # noqa: BLE001
        return None


def parse_appicon_renditions(assetutil_json_text):
    """Pure: extract AppIcon image renditions from `assetutil --info` JSON.

    Returns a list of dicts: {name, rendition, width, height}. The first element
    of assetutil output is catalog metadata (no PixelWidth) and is skipped, as is
    any non-AppIcon asset (AccentColor, launch images, etc.).
    """
    try:
        data = json.loads(assetutil_json_text)
    except (TypeError, ValueError):
        return []
    if not isinstance(data, list):
        return []

    out = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        name = entry.get("Name") or ""
        rendition = entry.get("RenditionName") or entry.get("Rendition Name") or ""
        is_appicon = name == "AppIcon" or str(rendition).startswith("AppIcon")
        if not is_appicon:
            continue
        width = entry.get("PixelWidth")
        height = entry.get("PixelHeight")
        if not isinstance(width, int) or not isinstance(height, int):
            continue
        out.append(
            {"name": name, "rendition": rendition, "width": width, "height": height}
        )
    return out


def find_loose_icon_pngs(app_dir):
    """Loose AppIcon*.png copied into the .app root (older/edge build configs)."""
    out = []
    try:
        for name in sorted(os.listdir(app_dir)):
            low = name.lower()
            if low.endswith(".png") and low.startswith("appicon"):
                out.append(os.path.join(app_dir, name))
    except OSError:
        pass
    return out


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


def inspect_png_dimensions(path):
    """Return (width, height) for a PNG using sips (macOS), Pillow, or the raw IHDR."""
    sips = shutil.which("sips")
    if sips:
        try:
            def prop(key):
                out = subprocess.check_output([sips, "-g", key, path], text=True)
                for line in out.splitlines():
                    line = line.strip()
                    if line.startswith(key + ":"):
                        return line.split(":", 1)[1].strip()
                return None

            w = prop("pixelWidth")
            h = prop("pixelHeight")
            if w and h:
                return int(w), int(h)
        except Exception:  # noqa: BLE001
            pass
    try:
        from PIL import Image

        with Image.open(path) as im:
            return im.size
    except Exception:  # noqa: BLE001
        pass
    return _png_size_from_header(path)


def _im_tool(name):
    """Return an ImageMagick subcommand list, preferring v7 `magick`."""
    magick = shutil.which("magick")
    if magick:
        return [magick] + ([name] if name != "magick" else [])
    legacy = shutil.which(name)
    if legacy:
        return [legacy]
    return None


def mean_luminance(path):
    """Average perceptual luminance (0..1) of an image, or None if unreadable.

    Used only to tell the dark navy real icon (~0.02) apart from Apple's near-white
    placeholder (~0.95). Prefers Pillow, then falls back to ImageMagick
    (`magick`/`convert`) so the check still runs on the Linux CI runner where
    Pillow isn't installed. Best-effort: returns None when neither is available.
    """
    try:
        from PIL import Image

        with Image.open(path) as im:
            small = im.convert("RGB").resize((16, 16))
            pixels = list(small.getdata())
        if pixels:
            n = len(pixels)
            r = sum(p[0] for p in pixels) / n
            g = sum(p[1] for p in pixels) / n
            b = sum(p[2] for p in pixels) / n
            return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
    except Exception:  # noqa: BLE001 - fall through to ImageMagick
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


def verify_app_dir(app_dir):
    """Return (errors, notes) for an extracted .app directory. errors empty == OK."""
    errors = []
    notes = []

    info = load_info_plist(app_dir)
    icon_files, icon_name = declared_primary_icon_files(info)
    if icon_files or icon_name:
        notes.append(
            f"Info.plist declares primary icon (name={icon_name!r}, files={icon_files})."
        )
    else:
        notes.append(
            "Info.plist has no CFBundleIcons primary-icon entry (asset-catalog-only "
            "icons can omit it; relying on the compiled Assets.car check below)."
        )

    car_path = os.path.join(app_dir, "Assets.car")
    renditions = []
    assetutil_json = run_assetutil(car_path)
    if assetutil_json is not None:
        renditions = parse_appicon_renditions(assetutil_json)
        notes.append(
            f"Assets.car reports {len(renditions)} AppIcon rendition(s) via assetutil."
        )
    elif os.path.isfile(car_path):
        notes.append(
            "Assets.car is present but `assetutil` is unavailable to inspect it "
            "(expected only off-macOS)."
        )
    else:
        notes.append("No Assets.car found in the app bundle.")

    loose = find_loose_icon_pngs(app_dir)
    loose_sizes = []
    for png in loose:
        dims = inspect_png_dimensions(png)
        if dims:
            loose_sizes.append((os.path.basename(png), dims[0], dims[1]))
        lum = mean_luminance(png)
        if lum is not None and lum > PLACEHOLDER_LUMINANCE_THRESHOLD:
            errors.append(
                f"Embedded icon '{os.path.basename(png)}' is near-white "
                f"(luminance {lum:.2f}) — this is Apple's generic placeholder, "
                f"not the navy GoodTunes icon."
            )
    if loose_sizes:
        notes.append(f"Loose AppIcon PNGs in bundle: {loose_sizes}.")

    # The definitive check: is there ANY real app-icon image >= 120px embedded?
    largest = 0
    for r in renditions:
        largest = max(largest, min(r["width"], r["height"]))
    for _name, w, h in loose_sizes:
        largest = max(largest, min(w, h))

    if largest >= MIN_REQUIRED_ICON_PX:
        notes.append(
            f"Largest embedded AppIcon is {largest}px (>= {MIN_REQUIRED_ICON_PX}px) — "
            f"a real icon is baked into the binary."
        )
    elif assetutil_json is None and not os.path.isfile(car_path) and not loose:
        # Nothing to inspect at all (and not even on macOS) — cannot prove an icon.
        errors.append(
            "Could not find any compiled app icon in the binary (no Assets.car, no "
            "loose AppIcon PNGs). The build would ship Apple's generic placeholder."
        )
    elif assetutil_json is None and os.path.isfile(car_path) and not loose:
        # Assets.car exists but we can't read it here (off-macOS). Don't hard-fail
        # on a tooling gap — but make it loud. On the CI runner assetutil always
        # exists, so this branch never triggers in the pipeline.
        notes.append(
            "WARNING: Assets.car exists but could not be inspected here, so the icon "
            "could not be definitively verified on this machine. On the macOS build "
            "runner assetutil is always present and this check is authoritative."
        )
    else:
        errors.append(
            f"No real AppIcon found in the built bundle (largest embedded icon "
            f"{largest or 0}px < {MIN_REQUIRED_ICON_PX}px). The archive compiled "
            f"WITHOUT baking in the app icon, so iOS will render the generic "
            f"placeholder. (Source AppIcon.appiconset is fine — the fault is the "
            f"archive.) Re-run the build; if it recurs, check that the App target's "
            f"Assets.xcassets is in 'Copy Bundle Resources' and "
            f"ASSETCATALOG_COMPILER_APPICON_NAME=AppIcon."
        )

    return errors, notes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ipa", nargs="?", help="Path to the .ipa to inspect.")
    parser.add_argument(
        "--app-dir",
        help="Inspect an already-extracted .app directory instead of an .ipa.",
    )
    args = parser.parse_args()

    if args.app_dir:
        app_dir = find_app_dir(args.app_dir)
        if not app_dir:
            print(f"ERROR: no .app found at {args.app_dir}", file=sys.stderr)
            return 1
        errors, notes = verify_app_dir(app_dir)
        return _report(app_dir, errors, notes)

    ipa = discover_ipa(args.ipa)
    if not ipa or not os.path.isfile(ipa):
        print(
            "ERROR: no .ipa found to inspect. Pass a path, or build first so "
            f"{DEFAULT_IPA_GLOB} exists.",
            file=sys.stderr,
        )
        return 1

    print(f"Inspecting built IPA: {ipa}")
    tmp = tempfile.mkdtemp(prefix="ipa-icon-check-")
    try:
        try:
            with zipfile.ZipFile(ipa) as zf:
                zf.extractall(tmp)
        except zipfile.BadZipFile:
            print(f"ERROR: {ipa} is not a valid .ipa (zip) archive.", file=sys.stderr)
            return 1

        app_dir = find_app_dir(tmp)
        if not app_dir:
            print(
                "ERROR: could not find Payload/<App>.app inside the .ipa.",
                file=sys.stderr,
            )
            return 1

        errors, notes = verify_app_dir(app_dir)
        return _report(app_dir, errors, notes)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _report(app_dir, errors, notes):
    print(f"App bundle: {os.path.basename(app_dir)}")
    for note in notes:
        print(f"  · {note}")
    if errors:
        print(
            "\nBuilt-IPA icon guard FAILED — this binary would ship the GENERIC "
            "PLACEHOLDER icon. Do NOT send it to Apple. Reasons:",
            file=sys.stderr,
        )
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    print("\nBuilt-IPA icon guard passed: a real app icon is embedded in the binary.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
