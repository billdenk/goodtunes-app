---
name: ImageMagick PSD layer extraction gotchas
description: Pulling individual layers out of a multi-layer PSD into PNGs with ImageMagick — two silent failure modes and how to verify.
---

Extracting per-layer renders from a multi-layer PSD (e.g. a vinyl-mockup template) with `magick`:

- **Use a per-layer LOOP, not a range read.** `magick "file.psd[2-33]" ... out-%d.png` (a sequence/range read with operators) renders only the FIRST layer's content and writes the rest as empty/transparent. Do one invocation per layer instead: `for i in $(seq 2 33); do magick "file.psd[$i]" ...; done`.
- **Do trim/center/extent as a SEPARATE pass on plain PNGs.** Fusing `-trim +repage -gravity center -extent WxH` into the SAME command that loads a PSD layer silently zeroes the alpha on every layer except the first — the disc vanishes. The PNG keeps a large file size (RGB data persists with alpha=0), so file size is NOT a validity check. Extract raw first (`magick "psd[$i]" -resize WxH out.png`), then normalize each plain PNG in a second loop.
- **Verify with mean alpha, not average color.** `magick f.png -format '%[fx:mean.a]' info:` → 0 means fully transparent (broken). Average color via `-resize 1x1 -alpha off` reads `#000000` for transparent pixels and hides the problem. For a representative fill color, flatten over a neutral bg first (`-background "#777" -flatten`).
- `montage` / `+append` showing only one tile usually means the OTHER inputs are transparent (a real upstream data problem), not a tool bug.

**Why:** Hit all three while extracting 32 Splatter disc renders from `BONUS_VinylMockUp_Examples.psd`; the trim/extent fusion wasted a cycle because file sizes looked fine.
**How to apply:** Any task that pulls individual layers out of a PSD via ImageMagick (swatch/mockup extraction).
