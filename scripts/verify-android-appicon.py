#!/usr/bin/env python3
"""Pre-archive guard for the Android launcher + notification icons.

Why this exists: the iOS side already learned this lesson the hard way —
TestFlight Build 59 shipped Apple's GENERIC placeholder icon because Xcode
silently falls back to a placeholder when the icon set is missing/invalid
(see scripts/verify-ios-appicon.py). The Android build had no equivalent
guard, so a wrong/default launcher icon — or a notification small icon that
renders as a featureless gray box — could ship to Play the exact same way.
This script converts those silent failures into a HARD, fast, clearly
explained build failure.

Android rules DIFFER from iOS:

  1. LAUNCHER icon. Modern Android uses an *adaptive* launcher icon: the
     foreground/background layers declared in mipmap-anydpi-v26/ic_launcher.xml
     (+ ic_launcher_round.xml), with per-density raster fallbacks under
     mipmap-<density>/ (ic_launcher.png, ic_launcher_round.png, and the
     adaptive ic_launcher_foreground.png). A missing density or layer leaves
     Android to substitute a default/blank launcher icon. We check every
     required density has every required raster at the exact pixel size that
     density requires, and that both adaptive-icon XMLs exist.

  2. NOTIFICATION small icon (ic_stat_notify). This is the OPPOSITE of the iOS
     no-alpha rule: the status-bar icon MUST be an alpha-only WHITE silhouette.
     Android throws away the RGB and re-tints the icon using only its alpha
     channel. If you ship a fully-opaque (no-transparency) icon — e.g. the
     coloured launcher icon by mistake — the system has no silhouette to mask
     and draws a solid gray/white box. We check every required density exists,
     carries an alpha channel, actually HAS transparency (is a silhouette, not
     a solid block), and that its visible pixels are white.

Image inspection prefers Pillow, then falls back to ImageMagick
(`magick`/`convert` + `identify`) so it runs on the Linux Codemagic runner and
on a dev box.

Exit status: 0 = valid, non-zero = invalid (with a human-readable reason list).
"""

import os
import shutil
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(REPO_ROOT, "android", "app", "src", "main", "res")

# Density buckets every launcher/notification raster must ship at.
DENSITIES = ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")

# Required launcher rasters per density and the exact px size each density
# requires. Legacy square + round icons share the same size table; the adaptive
# foreground layer is 108dp (2.25x the legacy size) so masking has bleed room.
LAUNCHER_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}
# Notification small icon sizes per density (24dp).
NOTIFY_SIZES = {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}

# Adaptive-icon definitions that must exist so Android assembles the launcher
# icon from foreground/background layers rather than a blank default.
ADAPTIVE_XML = (
    os.path.join("mipmap-anydpi-v26", "ic_launcher.xml"),
    os.path.join("mipmap-anydpi-v26", "ic_launcher_round.xml"),
)

# Allow anti-aliased white edges to drift a hair from pure 255 without failing.
WHITE_MIN = 240


def _im_tool(name):
    """Return an ImageMagick subcommand list, preferring v7 `magick`."""
    magick = shutil.which("magick")
    if magick:
        return [magick] + ([name] if name != "magick" else [])
    legacy = shutil.which(name)
    if legacy:
        return [legacy]
    return None


def inspect_image(path):
    """Return (width, height, has_alpha, fully_opaque, visible_all_white).

    visible_all_white is True when every pixel with alpha > 0 is white. For
    launcher rasters we only consult width/height, but computing the rest is
    cheap and keeps a single code path.
    """
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
            if not has_alpha:
                return width, height, False, True, False
            rgba = im.convert("RGBA")
            fully_opaque = True
            visible_all_white = True
            for r, g, b, a in rgba.getdata():
                if a < 255:
                    fully_opaque = False
                if a > 0 and (r < WHITE_MIN or g < WHITE_MIN or b < WHITE_MIN):
                    visible_all_white = False
                    if not fully_opaque:
                        break
            return width, height, True, fully_opaque, visible_all_white

    # ---- ImageMagick fallback (Linux runner) ----
    identify = shutil.which("identify") or _im_tool("identify")
    if not identify:
        raise RuntimeError(
            "Cannot inspect icons: neither Pillow nor ImageMagick "
            "(`magick`/`identify`) is available."
        )
    identify = identify if isinstance(identify, list) else [identify]

    def idprop(fmt):
        return subprocess.check_output(
            identify + ["-format", fmt, path], text=True
        ).strip()

    width = int(idprop("%w"))
    height = int(idprop("%h"))
    channels = idprop("%[channels]").lower()
    has_alpha = "a" in channels
    if not has_alpha:
        return width, height, False, True, False

    fully_opaque = idprop("%[opaque]").lower() == "true"

    # Composite over white: if every visible pixel is white, the result is pure
    # white everywhere (minima of all RGB channels == 1.0). Any visible colour
    # or partial-alpha non-white pixel drags a channel minimum below 1.0.
    convert = _im_tool("convert")
    visible_all_white = False
    if convert:
        thr = WHITE_MIN / 255.0
        fx = (
            "%[fx:minima.r>=" + repr(thr) + " && minima.g>=" + repr(thr)
            + " && minima.b>=" + repr(thr) + " ? 1:0]"
        )
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
                "-format",
                fx,
                "info:",
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        visible_all_white = out.endswith("1")
    return width, height, True, fully_opaque, visible_all_white


def check_launcher(errors):
    for xml_rel in ADAPTIVE_XML:
        if not os.path.isfile(os.path.join(RES, xml_rel)):
            errors.append(
                f"Adaptive-icon definition '{xml_rel}' is missing — Android will "
                f"fall back to a default launcher icon."
            )

    for density in DENSITIES:
        checks = (
            ("ic_launcher.png", LAUNCHER_SIZES[density]),
            ("ic_launcher_round.png", LAUNCHER_SIZES[density]),
            ("ic_launcher_foreground.png", FOREGROUND_SIZES[density]),
        )
        for filename, expected in checks:
            path = os.path.join(RES, f"mipmap-{density}", filename)
            if not os.path.isfile(path):
                errors.append(
                    f"Launcher icon 'mipmap-{density}/{filename}' is missing."
                )
                continue
            try:
                width, height, *_ = inspect_image(path)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"Could not inspect 'mipmap-{density}/{filename}': {exc}")
                continue
            if (width, height) != (expected, expected):
                errors.append(
                    f"'mipmap-{density}/{filename}' is {width}x{height}px but "
                    f"{density} requires {expected}x{expected}px."
                )


def check_notification(errors):
    for density in DENSITIES:
        expected = NOTIFY_SIZES[density]
        rel = f"drawable-{density}/ic_stat_notify.png"
        path = os.path.join(RES, f"drawable-{density}", "ic_stat_notify.png")
        if not os.path.isfile(path):
            errors.append(
                f"Notification icon '{rel}' is missing — the status-bar icon "
                f"would render as a gray box."
            )
            continue
        try:
            width, height, has_alpha, fully_opaque, visible_all_white = inspect_image(
                path
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Could not inspect '{rel}': {exc}")
            continue
        if (width, height) != (expected, expected):
            errors.append(
                f"'{rel}' is {width}x{height}px but {density} requires "
                f"{expected}x{expected}px."
            )
        if not has_alpha:
            errors.append(
                f"'{rel}' has NO alpha channel. The notification small icon must "
                f"be an alpha-only white silhouette, or Android draws a gray box."
            )
            continue
        if fully_opaque:
            errors.append(
                f"'{rel}' is fully opaque (no transparency). Android masks the "
                f"status-bar icon by its alpha channel; a solid icon renders as a "
                f"gray box. Provide a white-on-transparent silhouette."
            )
        if not visible_all_white:
            errors.append(
                f"'{rel}' has non-white visible pixels. The notification icon must "
                f"be a WHITE silhouette (only the alpha channel may vary)."
            )


def main():
    if not os.path.isdir(RES):
        print(f"ERROR: Android res directory not found at {RES}", file=sys.stderr)
        return 1

    errors = []
    check_launcher(errors)
    check_notification(errors)

    if errors:
        print(
            "Android icon guard FAILED — this build would ship a wrong launcher "
            "icon and/or a gray-box notification icon. Fix the following before "
            "building:",
            file=sys.stderr,
        )
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print(
        "Android icon guard passed: launcher icons present at all densities with "
        "correct sizes + adaptive-icon XML, and the notification icon is an "
        "alpha-only white silhouette at every density. Safe to build."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
