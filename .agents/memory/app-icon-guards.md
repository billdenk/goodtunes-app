---
name: App-icon guards (source + built-binary) and their smoke tests
description: The four icon guards, why they don't false-positive on real navy art, the Linux-runner constraints on testing them, and what only macOS/operator can confirm.
---

# App-icon guards (source + built-binary) and their smoke tests

Four guards, two layers. **Source** guards inspect the committed trees:
`verify-android-appicon.py` (res/, `--res-dir`) and `verify-ios-appicon.py`
(AppIcon.appiconset, `--appiconset`). **Built-binary** guards inspect the
PRODUCED artifact to catch "source-correct, binary-wrong" drops (the iOS
TestFlight placeholder class of bug): `verify-android-aab-icon.py`
(`--extracted-dir` or real zip) and `verify-ios-ipa-icon.py` (`--app-dir` or
real zip). `scripts/verify-app-icon-guards-smoke.py` is one stdlib-only fixture
test (the `app-icon-guards-smoke` validation step) that locks in all four.

## Verified false-positive-free against a real bundle layout
- A genuine Gradle `.aab` names density mipmap dirs with AAPT2 qualifier
  suffixes: `mipmap-<density>-v4` and `mipmap-anydpi-v26`; source res dirs do
  NOT (`mipmap-xxxhdpi` vs `mipmap-xxxhdpi-v4`). The AAB guard's `_density_of`
  splits on `-` and matches the density token, so suffixes are handled.
- The navy GoodTunes "G" over white reads **~0.30 luminance**, well under the
  `0.7` placeholder threshold; largest legacy `ic_launcher.png` is 192px (== the
  `MIN_REQUIRED_ICON_PX` floor). Calibrated thresholds clear the real art.
- Android notify icon must be an **alpha-only white silhouette** (has alpha, not
  fully opaque, visible pixels white) — a fully-opaque white PNG is the bad case.

## Linux-runner constraints (no Pillow, no macOS tools)
- Image inspection uses the **ImageMagick fallback** (`magick`/`convert`/
  `identify`, present on the Replit box) + a pure-stdlib PNG IHDR reader; the
  AAB color check survives a failed `pip3 install Pillow`. Smoke fixtures are
  written with a tiny in-script PNG encoder (no blobs).
- iOS .ipa guard: `assetutil` on the compiled `Assets.car` is **macOS-only**, so
  off-mac only the **loose-AppIcon-PNG** branch runs — good fixtures put a loose
  `AppIcon*.png` (>=120px) in the .app, bad fixtures drop it or go sub-120px.
  Its near-white color check is **Pillow-only** and is skipped off-mac.

## What only the operator / macOS can confirm
- The iOS `.ipa` authoritative `assetutil` check runs on the Codemagic macOS
  runner during the TestFlight build.
- A genuine signed `.aab` needs JDK + Android SDK + `goodtunes_keystore` — the
  real-build pass is operator-gated (Codemagic `android-internal` + eyeball the
  installed navy "G"); checklist in `docs/google-play-setup.md` → "Confirm the
  icon on the first real build".

**Why:** thresholds (luminance 0.7, min 192px) were calibrated against committed
art, not a Gradle-assembled bundle; future icon swaps only need to keep the
brand dark and the xxxhdpi raster >= 192px. The `--res-dir`/`--appiconset` flags
default to the committed trees, so Codemagic's no-arg calls are unchanged.
