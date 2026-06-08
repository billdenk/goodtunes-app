#!/usr/bin/env python3
"""Pre-archive guard for the iOS AppIcon set.

Why this exists: TestFlight Build 59 shipped Apple's GENERIC placeholder icon
(white tile, light-blue arrows) instead of the navy GoodTunes "G". The committed
asset catalog was correct, so the only way that happens is a build that archived
without a valid AppIcon set. Xcode does NOT fail an archive when the icon is
missing or invalid — it silently falls back to the placeholder. This script
converts that silent fallback into a HARD, fast, clearly-explained build failure
so a generic-icon build can never reach Apple again.

It checks, against ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json:
  1. Every required iOS slot (idiom/size/scale) is present in Contents.json.
  2. Every referenced PNG file actually exists on disk.
  3. Every PNG has the exact pixel dimensions its slot requires (size * scale).
  4. NO PNG has an alpha channel (Apple rejects/ignores alpha app icons; an
     alpha icon is the classic cause of a dropped-to-placeholder icon).

Image inspection prefers `sips` (built into every macOS Codemagic runner) and
falls back to Pillow so the script can also be run on a Linux dev box.

Exit status: 0 = valid, non-zero = invalid (with a human-readable reason list).
"""

import argparse
import json
import os
import shutil
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPICONSET = os.path.join(
    REPO_ROOT,
    "ios",
    "App",
    "App",
    "Assets.xcassets",
    "AppIcon.appiconset",
)

# The full set of slots a modern universal iOS app icon must declare. Keyed by
# (idiom, size, scale). If any of these is absent from Contents.json the catalog
# is incomplete and Xcode may fall back to the placeholder for that context.
REQUIRED_SLOTS = {
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
}


def expected_pixels(size, scale):
    """'20x20' + '3x' -> (60, 60); '83.5x83.5' + '2x' -> (167, 167)."""
    w_pt, h_pt = (float(x) for x in size.split("x"))
    factor = int(scale.rstrip("x"))
    return round(w_pt * factor), round(h_pt * factor)


def inspect_image(path):
    """Return (width, height, has_alpha). Prefer sips (macOS), fall back to PIL."""
    sips = shutil.which("sips")
    if sips:
        def prop(key):
            out = subprocess.check_output([sips, "-g", key, path], text=True)
            for line in out.splitlines():
                line = line.strip()
                if line.startswith(key + ":"):
                    return line.split(":", 1)[1].strip()
            raise RuntimeError(f"sips did not report {key} for {path}")

        width = int(prop("pixelWidth"))
        height = int(prop("pixelHeight"))
        has_alpha = prop("hasAlpha").lower() == "yes"
        return width, height, has_alpha

    try:
        from PIL import Image
    except ImportError:
        Image = None

    if Image is not None:
        with Image.open(path) as im:
            width, height = im.size
            has_alpha = im.mode in ("RGBA", "LA", "PA") or (
                im.mode == "P" and "transparency" in im.info
            )
            return width, height, has_alpha

    identify = shutil.which("identify")
    if identify:
        out = subprocess.check_output(
            [identify, "-format", "%w|%h|%A|%[channels]", path], text=True
        ).strip()
        w_str, h_str, alpha_flag, channels = out.split("|")
        has_alpha = alpha_flag.strip().lower() in ("true", "blend", "on") or (
            "a" in channels.strip().lower()
        )
        return int(w_str), int(h_str), has_alpha

    raise RuntimeError(
        "Cannot inspect icons: none of `sips` (macOS), Pillow, or ImageMagick "
        "`identify` is available."
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--appiconset",
        default=APPICONSET,
        help="Inspect this AppIcon.appiconset instead of the committed one (tests).",
    )
    args = parser.parse_args()
    appiconset = args.appiconset
    contents_path = os.path.join(appiconset, "Contents.json")

    errors = []

    if not os.path.isfile(contents_path):
        print(
            f"ERROR: AppIcon Contents.json not found at {contents_path}",
            file=sys.stderr,
        )
        return 1

    with open(contents_path, "r", encoding="utf-8") as f:
        contents = json.load(f)

    images = contents.get("images", [])
    declared_slots = set()

    for entry in images:
        idiom = entry.get("idiom")
        size = entry.get("size")
        scale = entry.get("scale")
        filename = entry.get("filename")
        declared_slots.add((idiom, size, scale))

        slot_label = f"{idiom} {size} {scale}"

        if not filename:
            errors.append(f"Slot [{slot_label}] has no filename in Contents.json.")
            continue

        path = os.path.join(appiconset, filename)
        if not os.path.isfile(path):
            errors.append(
                f"Slot [{slot_label}] references '{filename}' but the file is missing."
            )
            continue

        try:
            width, height, has_alpha = inspect_image(path)
        except Exception as exc:  # noqa: BLE001 - surface any inspection failure
            errors.append(f"Could not inspect '{filename}': {exc}")
            continue

        exp_w, exp_h = expected_pixels(size, scale)
        if (width, height) != (exp_w, exp_h):
            errors.append(
                f"'{filename}' is {width}x{height}px but slot [{slot_label}] "
                f"requires {exp_w}x{exp_h}px."
            )
        if has_alpha:
            errors.append(
                f"'{filename}' has an ALPHA channel. App icons must be flat RGB "
                f"with no transparency, or Apple drops it to the generic placeholder."
            )

    missing_slots = REQUIRED_SLOTS - declared_slots
    for idiom, size, scale in sorted(missing_slots):
        errors.append(
            f"Required slot [{idiom} {size} {scale}] is missing from Contents.json."
        )

    if errors:
        print(
            "AppIcon guard FAILED — this build would ship the generic placeholder "
            "icon. Fix the following before building:",
            file=sys.stderr,
        )
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print(
        f"AppIcon guard passed: {len(images)} icons, all slots present, correct "
        f"sizes, no alpha channels. Safe to archive."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
