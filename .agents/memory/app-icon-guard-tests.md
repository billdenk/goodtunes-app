---
name: App-icon guard regression tests
description: How the four icon guards are tested and the Linux-runner constraints that shape the fixtures.
---

# App-icon guard regression tests

`scripts/verify-app-icon-guards-smoke.py` is one stdlib-only fixture test that
locks in all four icon guards. It is the `app-icon-guards-smoke` validation step.

**The four guards & how the smoke reaches them:**
- `verify-android-appicon.py` (source res/) — testable via `--res-dir`.
- `verify-ios-appicon.py` (source AppIcon.appiconset) — testable via `--appiconset`.
- `verify-android-aab-icon.py` (built .aab) — `--extracted-dir` or a real zip.
- `verify-ios-ipa-icon.py` (built .ipa) — `--app-dir` or a real zip.

**Why:** the source guards originally hardcoded their paths (no override), so
their bad-path logic was untestable. The two `--res-dir`/`--appiconset` flags
default to the committed trees, so Codemagic's no-arg calls are unchanged.

**How to apply / Linux-runner gotchas (no Pillow, no macOS tools):**
- Image inspection runs on the **ImageMagick fallback** + the pure-stdlib PNG
  IHDR reader. Fixtures are written with a tiny in-script PNG encoder (no blobs).
- iOS .ipa guard: `assetutil`/Assets.car is **macOS-only**, so off-mac only the
  **loose-AppIcon-PNG** branch runs — good fixtures put a loose `AppIcon*.png`
  (>=120px) in the .app, bad fixtures drop it or go sub-120px. Its near-white
  color check is **Pillow-only** and is simply skipped off-mac (don't try to
  assert it on Linux).
- AAB res dirs carry AAPT2 `-v4`/`-v26` density suffixes; source res dirs do NOT
  (`mipmap-xxxhdpi` vs `mipmap-xxxhdpi-v4`). Fixture builders differ accordingly.
- Android notify icon must be an **alpha-only white silhouette** (has alpha, not
  fully opaque, visible pixels white) — a fully-opaque white PNG is the bad case.
