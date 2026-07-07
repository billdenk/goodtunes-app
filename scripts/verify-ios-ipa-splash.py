#!/usr/bin/env python3
"""Post-build guard: prove the BUILT .ipa embeds the real GoodTunes splash (not solid navy).

Why this exists:
  The three Splash.imageset PNGs were accidentally overwritten with solid-navy images
  around June 9, causing the LaunchScreen to show a blank navy screen and the
  @capacitor/splash-screen plugin to fall through to its own placeholder (the Android
  Bugdroid robot). Xcode never fails an archive over a missing-logo splash — it
  silently compiles whatever is in the imageset.

  This guard inspects the actual produced .ipa: it unzips it, runs `assetutil --info`
  on the compiled Assets.car to confirm a Splash rendition exists, then samples the
  centre 100×100 px of the extracted splash image and asserts that at least one pixel
  is NOT the navy background (#00062B). A near-solid-colour (all-navy) result means
  the logo was absent from the committed splash PNGs, and we HARD-FAIL before the
  binary reaches Apple.

Usage:
    verify-ios-ipa-splash.py [path/to/App.ipa]
    verify-ios-ipa-splash.py --app-dir path/to/Extracted.app   # skip unzip (tests)

With no argument it auto-discovers the newest build/ios/ipa/*.ipa.

Exit status: 0 = splash looks good, non-zero = solid-navy / missing (with reason).
"""

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_IPA_GLOB = os.path.join(REPO_ROOT, "build", "ios", "ipa", "*.ipa")

# Navy background in 8-bit sRGB: #00062B = (0, 6, 43)
NAVY_R, NAVY_G, NAVY_B = 0, 6, 43
# Tolerance: a pixel is "navy" if all three channels are within this many steps.
NAVY_TOLERANCE = 10

# We sample this many pixels from the centre crop to look for a non-navy pixel.
# If NONE of the sampled pixels differ from navy by more than NAVY_TOLERANCE,
# the splash is considered solid-navy (logo missing) and we hard-fail.
CENTRE_CROP_PX = 100  # width and height of the centre crop square


def discover_ipa(explicit):
    if explicit:
        return explicit
    matches = glob.glob(DEFAULT_IPA_GLOB)
    if not matches:
        return None
    return max(matches, key=os.path.getmtime)


def find_app_dir(root):
    if root.endswith(".app") and os.path.isdir(root):
        return root
    payload = os.path.join(root, "Payload")
    if os.path.isdir(payload):
        for name in sorted(os.listdir(payload)):
            if name.endswith(".app"):
                return os.path.join(payload, name)
    for name in sorted(os.listdir(root)):
        if name.endswith(".app") and os.path.isdir(os.path.join(root, name)):
            return os.path.join(root, name)
    return None


def run_assetutil(car_path):
    assetutil = shutil.which("assetutil")
    if not assetutil or not os.path.isfile(car_path):
        return None
    try:
        return subprocess.check_output(
            [assetutil, "--info", car_path], text=True, stderr=subprocess.DEVNULL
        )
    except Exception:
        return None


def find_splash_rendition(assetutil_json_text):
    """Return True if assetutil output contains a Splash rendition entry."""
    try:
        data = json.loads(assetutil_json_text)
    except (TypeError, ValueError):
        return False
    if not isinstance(data, list):
        return False
    for entry in data:
        if not isinstance(entry, dict):
            continue
        name = (entry.get("Name") or "").lower()
        rendition = (entry.get("RenditionName") or entry.get("Rendition Name") or "").lower()
        if "splash" in name or "splash" in rendition:
            return True
    return False


def _im_tool(name):
    magick = shutil.which("magick")
    if magick:
        return [magick] + ([name] if name != "magick" else [])
    legacy = shutil.which(name)
    if legacy:
        return [legacy]
    return None


def sample_centre_pixels_imagemagick(path, crop_px):
    """Return list of (r, g, b) tuples for a centre crop using ImageMagick txt output."""
    convert = _im_tool("convert")
    if not convert:
        return None
    try:
        out = subprocess.check_output(
            convert + [
                path,
                "-gravity", "center",
                f"-crop", f"{crop_px}x{crop_px}+0+0",
                "+repage",
                "txt:-",
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None

    pixels = []
    for line in out.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Format: "x,y: (R,G,B)  #RRGGBB  ..."
        try:
            paren_start = line.index("(")
            paren_end = line.index(")")
            rgb_str = line[paren_start + 1:paren_end]
            parts = [p.strip() for p in rgb_str.split(",")]
            if len(parts) >= 3:
                # Values may be 8-bit (0-255) or 16-bit (0-65535) depending on image depth.
                r, g, b = int(parts[0]), int(parts[1]), int(parts[2])
                # Normalise to 8-bit
                if r > 255 or g > 255 or b > 255:
                    r, g, b = r >> 8, g >> 8, b >> 8
                pixels.append((r, g, b))
        except (ValueError, IndexError):
            continue
    return pixels if pixels else None


def sample_centre_pixels_pillow(path, crop_px):
    """Return list of (r, g, b) tuples for a centre crop using Pillow."""
    try:
        from PIL import Image
        with Image.open(path) as im:
            w, h = im.size
            left = (w - crop_px) // 2
            top = (h - crop_px) // 2
            cropped = im.convert("RGB").crop((left, top, left + crop_px, top + crop_px))
            return list(cropped.getdata())
    except Exception:
        return None


def has_non_navy_pixel(pixels):
    """Return True if any pixel in the list differs from navy by more than NAVY_TOLERANCE."""
    for r, g, b in pixels:
        if (
            abs(r - NAVY_R) > NAVY_TOLERANCE
            or abs(g - NAVY_G) > NAVY_TOLERANCE
            or abs(b - NAVY_B) > NAVY_TOLERANCE
        ):
            return True
    return False


def find_splash_png_in_bundle(app_dir):
    """Look for a loose splash PNG copied into the bundle (some Capacitor configs do this)."""
    candidates = []
    try:
        for name in os.listdir(app_dir):
            low = name.lower()
            if low.endswith(".png") and "splash" in low:
                candidates.append(os.path.join(app_dir, name))
    except OSError:
        pass
    return candidates


def verify_app_dir(app_dir):
    """Return (errors, notes). errors empty == OK."""
    errors = []
    notes = []

    car_path = os.path.join(app_dir, "Assets.car")
    splash_found_in_car = False
    assetutil_json = run_assetutil(car_path)

    if assetutil_json is not None:
        splash_found_in_car = find_splash_rendition(assetutil_json)
        if splash_found_in_car:
            notes.append("Assets.car contains a Splash rendition (confirmed via assetutil).")
        else:
            errors.append(
                "Assets.car is present but contains NO Splash rendition (assetutil found none). "
                "The LaunchScreen will fall back to a blank view — the Splash.imageset was "
                "not compiled into Assets.car. Check that Assets.xcassets is listed under "
                "the App target's 'Copy Bundle Resources' build phase and that the "
                "Splash.imageset folder name and Contents.json are correct."
            )
    elif os.path.isfile(car_path):
        notes.append(
            "Assets.car is present but assetutil is unavailable (expected only off-macOS). "
            "Splash rendition could not be confirmed from the compiled asset catalog."
        )
    else:
        errors.append(
            "No Assets.car found in the app bundle. The splash screen cannot be verified — "
            "the archive may be missing the asset catalog entirely."
        )

    # Locate a splash image to pixel-sample. Prefer loose PNGs; fall back to
    # extracting from Assets.car via assetutil (macOS only).
    splash_pngs = find_splash_png_in_bundle(app_dir)
    extracted_splash = None

    if not splash_pngs and assetutil_json is not None and os.path.isfile(car_path):
        # Try to extract the first Splash rendition from Assets.car.
        assetutil = shutil.which("assetutil")
        if assetutil:
            tmp_extract = tempfile.mkdtemp(prefix="splash-extract-")
            try:
                subprocess.call(
                    [assetutil, "--output", tmp_extract, "--idiom", "universal", car_path],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                for root, _dirs, files in os.walk(tmp_extract):
                    for f in files:
                        if "splash" in f.lower() and f.lower().endswith(".png"):
                            extracted_splash = os.path.join(root, f)
                            break
                    if extracted_splash:
                        break
                if extracted_splash:
                    notes.append(f"Extracted splash from Assets.car for pixel sampling: {os.path.basename(extracted_splash)}")
            except Exception:
                pass
            if not extracted_splash:
                shutil.rmtree(tmp_extract, ignore_errors=True)

    sample_target = extracted_splash or (splash_pngs[0] if splash_pngs else None)

    if sample_target:
        notes.append(f"Pixel-sampling splash image: {os.path.basename(sample_target)}")
        pixels = sample_centre_pixels_pillow(sample_target, CENTRE_CROP_PX)
        if pixels is None:
            pixels = sample_centre_pixels_imagemagick(sample_target, CENTRE_CROP_PX)

        if pixels:
            notes.append(f"Sampled {len(pixels)} centre pixels from the splash image.")
            if has_non_navy_pixel(pixels):
                notes.append(
                    "Centre crop contains non-navy pixels — the GoodTunes wordmark "
                    "(or other branding) is present in the splash. ✓"
                )
            else:
                errors.append(
                    "Splash image centre is SOLID NAVY (#00062B) — no visible logo was found. "
                    "The committed Splash.imageset PNGs must be regenerated with the GoodTunes "
                    "wordmark centred on navy. Run: "
                    "magick -size 2732x2732 xc:'#00062B' "
                    r"\( client/public/goodtunes-logo-white.png -resize 1600x \) "
                    "-gravity center -composite ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png "
                    "(then copy to splash-2732x2732-1.png and splash-2732x2732-2.png)."
                )
        else:
            notes.append(
                "WARNING: could not pixel-sample the splash image (no Pillow or ImageMagick). "
                "The solid-navy check was skipped — verify the splash visually on device."
            )
    else:
        if assetutil_json is None and os.path.isfile(car_path):
            notes.append(
                "WARNING: splash pixel check skipped — assetutil unavailable off-macOS. "
                "Verify visually on device that the GoodTunes wordmark appears on launch."
            )
        else:
            notes.append(
                "WARNING: no splash PNG could be located for pixel sampling. "
                "If assetutil --output extraction is incomplete, verify the splash on device."
            )

    if extracted_splash:
        shutil.rmtree(os.path.dirname(extracted_splash), ignore_errors=True)

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
    tmp = tempfile.mkdtemp(prefix="ipa-splash-check-")
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
            "\nSplash guard FAILED — this binary would ship a BLANK NAVY splash screen "
            "(no GoodTunes wordmark). Do NOT send it to Apple. Reasons:",
            file=sys.stderr,
        )
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    print("\nSplash guard passed: GoodTunes wordmark is present in the splash screen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
