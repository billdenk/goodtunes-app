# Production GoodDeed social manifest

## Source identity

- Upstream Artist Assets handoff: `f618f07628012ca4c0e66b0769507bf3eccfd632`
- Applied handoff commit in this workspace: `3993a1db1e5fabb14498ff67f1565ca84d0116a7`
- Production renderer: `client/src/components/GoodDeedCertificate.tsx`
- Returned snapshot: `source/GoodDeedCertificate.tsx`
- Renderer/snapshot SHA-256:
  `abd50abf9d9948d2be30ba878f899bf9a16720e6f202a541434afb4d98621f5f`
- Last production commit that changed the renderer:
  `30ac57c0b24a6ee39f70a807d2f3b9c5cfa5c682`
- Renderer comparison after capture: byte-for-byte unchanged.

## Native output dimensions

| Shape | File | Dimensions |
|---|---|---:|
| Square | `renders/square-1080x1080.png` | 1080×1080 |
| Portrait | `renders/portrait-1080x1350.png` | 1080×1350 |
| Story | `renders/story-1080x1920.png` | 1080×1920 |

All three cards are authored at a 1080-pixel base. The native export path uses
pixel ratio 1, and the returned PNG dimensions were independently verified.

## Production geometry

- Outer corners: square, `radiusU: 0` for Square, Portrait, and Story.
- Frame: 45 pixels at the 1080-pixel base, implemented as
  `45 * (renderWidth / 1080)`.
- Frame color source: CSS custom property `--brand-orange` in
  `client/src/index.css`, currently `#FF7C06`.
- Card background source: production `--brand-bg`.
- Artwork treatment: the production sharp artwork layer, format-specific
  crop/mask behavior, and `BLEED_SCRIM` from the returned source.

## Avatar placement rules

The avatar or initial fallback is centered on the ownership axis. Values below
are 1080-base CSS pixels and scale with `renderWidth / 1080`.

| Shape | Diameter | Top offset |
|---|---:|---:|
| Square | 200 px | -148 px |
| Portrait | 210 px | -170 px |
| Story | 248 px | -178 px |

The avatar has a 6-pixel translucent white border at the 1080 base and the
production shadow declared in `GoodDeedCertificate.tsx`. These representative
renders exercise the valid no-photo initial fallback; a signed-in fan photo
uses the same position, diameter, border, and circular crop.

## Assets and fonts

- Production GoodTunes logo URL: `/goodtunes-logo-white.png`
- Production-owned source:
  `client/public/goodtunes-logo-white.png`
- Returned exact copy:
  `assets/goodtunes-logo-white.png`
- Representative art source:
  `client/public/figmaAssets/album-5-cover.jpg`
- Returned exact copy:
  `assets/representative-album-art.jpg`
- The renderer does not bundle a certificate-only font file. It inherits the
  application’s Inter stack from `client/src/index.css`, with the Google Fonts
  declaration in `client/index.html` and system fallbacks
  `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Remaining card styling is inline in the returned production component and
  uses the application Tailwind utility build from `tailwind.config.ts` and
  `client/src/index.css`; these are explicit production-owned paths and are not
  duplicated here.
- Album art and owner photo are runtime record data, not fixed certificate
  branding assets. Missing artwork uses the shared production `AlbumCover`
  fallback; missing owner photo uses the renderer’s initial fallback.

## Render provenance

Otis generated these PNGs in headless Chromium 138 by mounting the actual
production `CertCard` implementation at `w=1080`, waiting for fonts and images
to decode, and capturing the exact card element at device pixel ratio 1.
Temporary harness files and a temporary export were removed after capture.
The final production renderer hash matches the pre-capture hash above.

This is not a screenshot-based reconstruction and no GoodStudio certificate
component, mock social card, blue mock logo, rounded-corner variant, dashed
safe-zone inset, historical recipient, CALIFORNIALAND artwork, or old PDF was
used.

## Sample-data boundary

- Owner: `Jordan Ellis` — fictional representative identity.
- Serial: `#07` — representative sample only; no production entitlement,
  certificate record, or database identity is implied.
- Release caption: `Wildflower by Marlowe Vance` — fictional representative
  metadata.
- The returned album-art file is a production-owned public sample image used
  only to exercise the live image-rendering path. It does not claim an
  association with the fictional caption.

## Story safe zone

**Unavailable.** Production does not document all of the following together:

1. a target platform,
2. a dated platform-guidance source, and
3. verified top, right, bottom, and left pixel bounds on the 1080×1920 Otis
   output.

No bounds were inferred, no overlay was rendered, and no safe-zone option was
enabled. When verified evidence exists, any future overlay must be preview-only
and excluded from exports.
