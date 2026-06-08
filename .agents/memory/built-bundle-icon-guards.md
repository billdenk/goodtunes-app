---
name: Built-bundle icon guards (iOS .ipa + Android .aab)
description: How the post-build app-icon guards work and the CI gotchas when testing them off-macOS
---

# Built-bundle app-icon guards

Two POST-build guards prove the produced binary actually embeds the brand app
icon, separate from the SOURCE asset-catalog guards. They exist because
TestFlight builds 59/64/66 shipped Apple's generic placeholder even though the
source catalog was correct ("source-correct, binary-wrong").

- iOS: `scripts/verify-ios-ipa-icon.py` (+ smoke `...-smoke.py`, validation `ios-ipa-icon-smoke`)
- Android: `scripts/verify-android-aab-icon.py` (+ smoke, validation `android-aab-icon-smoke`)

**Why / gotchas when writing or changing their smoke tests:**

- The iOS guard's authoritative signal is AppIcon renditions in the compiled
  `Assets.car`, read via `assetutil` — which is **macOS-only**. Off-macOS (the
  Linux CI runner) it returns None, so a smoke must drive the **platform-stable
  loose-AppIcon-PNG path** (size from the PNG IHDR header, luminance via an image
  tool) to get deterministic exit codes everywhere. Do NOT build fake Assets.car
  fixtures expecting them to parse.
- The near-white placeholder check needs an image tool. **Pillow is NOT installed
  here; ImageMagick (`magick`/`convert`) IS.** The iOS guard originally used only
  PIL, so its luminance check silently no-op'd in CI — it needs an ImageMagick
  fallback (the Android guard already has one) or the near-white case can't be
  enforced.
- Smokes generate fixtures with a tiny stdlib solid-color PNG encoder (no
  committed binary blobs). Mutation-check by forcing the guard to always-pass and
  confirming every broken case then fails the smoke.
