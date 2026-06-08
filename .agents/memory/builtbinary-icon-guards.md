---
name: Built-binary icon guards (AAB/IPA)
description: Why the post-build app-icon guards don't false-positive, and what only the operator/macOS runner can confirm.
---

# Built-binary icon guards (verify-android-aab-icon.py / verify-ios-ipa-icon.py)

These inspect the PRODUCED artifact (not the source res/catalog) to catch
"source-correct, binary-wrong" icon drops (the iOS TestFlight 59/64/66 placeholder
class of bug). Source guards are `verify-android-appicon.py` / `verify-ios-appicon.py`.

## Verified false-positive-free against a real bundle layout
- A genuine Gradle `.aab` names density mipmap dirs with AAPT2 qualifier suffixes:
  `mipmap-<density>-v4` and `mipmap-anydpi-v26`. The AAB guard's `_density_of`
  splits on `-` and matches the density token, so the suffixes are handled — no
  path change needed.
- The navy GoodTunes "G" composited over white reads **~0.30 luminance**, well
  under the `0.7` placeholder threshold; the largest legacy `ic_launcher.png` is
  192px (== the `MIN_REQUIRED_ICON_PX` floor). So the calibrated thresholds clear
  the real art with margin.
- The AAB color check runs even if the CI `pip3 install Pillow` line fails: the
  guard falls back to ImageMagick (`magick`/`convert`/`identify`) and then the raw
  PNG header. ImageMagick is present on the Replit box too.

## What can only be confirmed off-box
- The iOS built-`.ipa` guard's authoritative check is `assetutil` on the compiled
  `Assets.car` — **macOS-only**. It can't be exercised in the Linux/Replit task
  env; it runs on the Codemagic macOS runner during the TestFlight build.
- Producing a genuine signed `.aab` needs JDK + Android SDK + the
  `goodtunes_keystore` — not available in the task env. The actual real-build pass
  is operator-gated (Codemagic `android-internal` run + eyeball the installed navy
  "G"). Operator checklist lives in `docs/google-play-setup.md` → "Confirm the icon
  on the first real build".

**Why:** thresholds (luminance 0.7, min 192px) were calibrated against committed
art, not a Gradle-assembled bundle; this records that the AAPT2 dir naming + real
navy art clear them, so future icon swaps only need to keep the brand dark and the
xxxhdpi raster >= 192px.
