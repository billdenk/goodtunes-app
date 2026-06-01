---
name: Vectorizing brand/App Store icons when SVG sources are blocked
description: How to produce crisp, faithful vector brand tiles when official SVGs can't be fetched
---

When a task needs an accurate vector brand logo (e.g. matching a service's App Store
icon) and the official brand/press-kit SVGs are unreachable — every public download
CDN (worldvectorlogo, svgporn, svgrepo, brandfetch, clearbit, vectorlogo.zone)
returns HTML/AccessDenied to curl — reproduce the supplied screenshot as a real
vector instead of guessing path data or shipping a raster.

**Pipeline that works in this environment:**
- `potrace` is NOT installable via npm (`bash` blocks installs) or as a pip binding,
  but it runs ephemerally with `nix run nixpkgs#potrace -- <args>` (first call unpacks
  nixpkgs, then cached). ImageMagick (`magick`) is available; the binary is `convert`
  but use `magick`.
- Crop the icon region from the high-res screenshot, isolate each element (a single
  luminance/hue band per color: black bg ~0, a colored mark mid-luminance, white text
  >85%), then `-threshold` + `-negate` + `-type bilevel` to get black-on-white the way
  potrace expects (potrace traces the BLACK foreground on white). Trace each element
  separately (e.g. a colored mark vs. a white wordmark) so a single luminance threshold
  doesn't merge them.
- Crop strictly INSIDE the rounded tile — screenshot background bleeding into the crop
  corners (incl. the page's colored header) survives threshold and gets traced as stray
  corner triangles. Bump potrace `-t` (turdsize, ~45) to drop residual speckles, but
  not so high it eats legitimate small detached shapes (e.g. Deezer's two side lobes).
- potrace emits one `<path>` per disconnected region — grab them ALL (`re.findall`),
  not just the first.
- potrace SVGs are sized in `pt`; ImageMagick renders at 96dpi so a pt-sized render is
  NOT 1px/unit. Render with `-density 72` to get px == viewBox units, then
  `magick … -fuzz 6% -format '%@' info:` gives the tight content bbox. Set that bbox as
  the nested `<svg viewBox=…>` + `preserveAspectRatio="xMidYMid meet"` to center exactly.
- Keep potrace's `<g transform="translate(0,H) scale(0.1,-0.1)">` wrapper and just swap
  `fill` to the brand color.
- Always re-render the final tile at 180px AND 44px and eyeball it before shipping.

**Why:** vector (not a raster trace) is required for retina crispness, and tracing the
actual letterforms is far more faithful than hand-drawing or substituting a system font
(which would also drift across devices, defeating the whole point of a shared registry).

**How to apply:** any future "match this brand/app icon" asset task. GoodTunes streaming
tiles live in `client/src/assets/brand/*.svg`, wired through `SERVICE_LOGO` in
`client/src/lib/streamingService.ts` (filename swap = no import change). The
`design-lint` linter only scans `*.{ts,tsx,jsx}`, so SVG asset edits never trip it.
