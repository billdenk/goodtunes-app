#!/usr/bin/env bash
# Generate landscape iOS launch splash PNGs (white GoodTunes wordmark on brand
# navy #00062B), mirroring the portrait set produced for the home-screen PWA.
#
# iOS only honors an exact device-pixel match, so we emit one image per device
# at its landscape resolution (portrait WxH swapped to HxW). The wordmark is
# sized to ~52% of the short side (the canvas height in landscape) so it reads
# at the same physical size as the portrait splash, then centered.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGO="$ROOT/client/public/goodtunes-logo-white.png"
OUT="$ROOT/client/public/splash"
BG="#00062B"
RATIO=0.518

mkdir -p "$OUT"

# Portrait resolutions (WxH); short side = W. Landscape swaps to HxW.
SIZES=(
  640x1136
  750x1334
  1242x2208
  1125x2436
  828x1792
  1242x2688
  1170x2532
  1284x2778
  1179x2556
  1290x2796
  1206x2622
  1320x2868
  1536x2048
  1620x2160
  1668x2224
  1640x2360
  1668x2388
  2048x2732
)

for size in "${SIZES[@]}"; do
  w="${size%x*}"
  h="${size#*x}"
  # Landscape canvas: height x width.
  cw="$h"
  ch="$w"
  mark_w=$(awk "BEGIN { printf \"%.0f\", $w * $RATIO }")
  out="$OUT/splash-${cw}x${ch}.png"
  magick -size "${cw}x${ch}" "xc:${BG}" \
    \( "$LOGO" -resize "${mark_w}x" \) \
    -gravity center -compose over -composite \
    "$out"
  echo "wrote $out (${cw}x${ch}, wordmark ${mark_w}px)"
done
